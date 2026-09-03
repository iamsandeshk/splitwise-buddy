/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { subscribeGoogleAuth } from '@/integrations/firebase/auth';
import {
  loadProSubscriptionForCurrentUser,
  subscribeToProSubscriptionForCurrentUser,
} from '@/integrations/firebase/proSubscription';
import {
  isProSubscriptionActive,
  type ProPlanId,
  type ProSubscriptionRecord,
} from '@/lib/proSubscription';
import {
  silentRevalidateProSubscription,
  type RevalidationResult,
} from '@/hooks/useBilling';
import {
  clearProStatusCache,
  getLastAuthUid,
  getProOverride,
  getProStatusCacheForUser,
  isDevOverrideEmail,
  setLastAuthUid,
  setProStatusCacheForUser,
} from '@/lib/proAccess';

const PRO_SUBSCRIPTION_REFRESH_EVENT = 'splitmate-pro-subscription-updated';

type ProContextValue = {
  isPro: boolean;
  plan: ProPlanId | null;
  loading: boolean;
  subscription: ProSubscriptionRecord | null;
};

export const ProContext = createContext<ProContextValue | null>(null);

export function ProContextProvider({ children }: PropsWithChildren) {
  const isNative = Capacitor.isNativePlatform();

  /*
   * Important:
   * The cached entitlement is UID-bound. It is only used as an instant UI/
   * offline entitlement; Google Play remains the authority for native
   * purchase ownership and revalidation runs in the background.
   */
  const initialCached = useMemo(() => {
    const lastUid = getLastAuthUid();

    if (lastUid) {
      const cached = getProStatusCacheForUser(lastUid);

      if (cached.isPro && cached.plan === 'lifetime') {
        return {
          isPro: true,
          plan: 'lifetime' as ProPlanId,
          loading: false,
        };
      }
    }

    return {
      isPro: false,
      plan: null,
      loading: true,
    };
  }, []);

  const [subscription, setSubscription] =
    useState<ProSubscriptionRecord | null>(null);
  const [isPro, setIsPro] = useState(initialCached.isPro);
  const [plan, setPlan] = useState<ProPlanId | null>(initialCached.plan);
  const [loading, setLoading] = useState(initialCached.loading);

  /*
   * A cached Lifetime entitlement is immediately usable.
   * Revalidation may later revoke it only after Google Play explicitly says
   * the purchase is no longer owned.
   */
  const [billingVerified, setBillingVerified] = useState(
    !isNative || initialCached.isPro,
  );
  const billingVerifiedRef = useRef(
    !isNative || initialCached.isPro,
  );

  const [proOverride, setProOverride] = useState(getProOverride());
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const currentUserEmailRef = useRef<string | null>(null);

  const isProRef = useRef(isPro);
  const currentUserUidRef = useRef<string | null>(getLastAuthUid());

  useEffect(() => {
    isProRef.current = isPro;
  }, [isPro]);

  useEffect(() => {
    billingVerifiedRef.current = billingVerified;
  }, [billingVerified]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeSubscription = () => { };
    let resumeListener: { remove: () => Promise<void> } | null = null;
    let appStateListener: { remove: () => Promise<void> } | null = null;
    let previousUserUid: string | null | undefined = undefined;

    const setBillingVerification = (value: boolean) => {
      billingVerifiedRef.current = value;

      if (isMounted) {
        setBillingVerified(value);
      }
    };

    /*
     * Reset React entitlement state only.
     *
     * Do NOT clear every Pro cache here. The cache is UID-bound and may belong
     * to another account. Clearing it globally during auth initialization or
     * account switching can destroy valid offline entitlement data.
     */
    const resetSubscriptionState = () => {
      if (!isMounted) return;

      setSubscription(null);
      setIsPro(false);
      setPlan(null);
    };

    const finishCachedTransactionsForSubscription = async (
      record: ProSubscriptionRecord,
    ) => {
      const store = window.CdvPurchase?.store;
      if (!store?.localTransactions?.length || !record.purchaseToken) {
        return;
      }

      const matchingTransactions = store.localTransactions.filter(
        (transaction) => {
          const purchaseToken =
            transaction.purchaseId ?? transaction.transactionId ?? null;

          return purchaseToken === record.purchaseToken;
        },
      );

      await Promise.all(
        matchingTransactions.map((transaction) =>
          transaction.finish().catch(() => { }),
        ),
      );
    };

    const clearCurrentUserCache = () => {
      /*
       * clearProStatusCache() is retained as a compatibility fallback for the
       * existing cache implementation. The current account UID is cleared
       * first through the account-aware cache API where available.
       */
      clearProStatusCache();
    };

    const applySubscription = (record: ProSubscriptionRecord | null) => {
      if (!isMounted) return;

      /*
       * On native, Firestore is NOT authoritative for purchase ownership.
       * Before Google Play verification completes, an active Firestore record
       * may be stale, so it must not grant Pro.
       */
      if (isNative && !billingVerifiedRef.current) {
        if (record && isProSubscriptionActive(record)) {
          setSubscription(record);
        }
        return;
      }

      if (!record) {
        /*
         * Never wipe an already-valid local entitlement just because Firestore
         * is temporarily empty/unavailable.
         */
        if (!isProRef.current) {
          setSubscription(null);
          setLoading(false);
        }

        return;
      }

      if (
        record.isExpired ||
        !isProSubscriptionActive(record) ||
        record.subscriptionState === 'expired'
      ) {
        clearCurrentUserCache();

        void finishCachedTransactionsForSubscription(record).finally(() => {
          if (!isMounted) return;

          resetSubscriptionState();
          setLoading(false);
        });

        return;
      }

      setSubscription(record);
      setIsPro(true);
      setPlan('lifetime');
      setLoading(false);

      /*
       * Firestore can refresh the UID-bound local cache after the record has
       * already passed the native Play verification gate.
       */
      const uid = currentUserUidRef.current;

      if (uid) {
        setProStatusCacheForUser(
          uid,
          currentUserEmailRef.current,
          true,
          record.purchaseToken,
        );
      }
    };

    const refreshSubscription = async () => {
      try {
        const record = await loadProSubscriptionForCurrentUser();

        if (!isMounted) return;

        applySubscription(record);
      } catch (error) {
        console.warn(
          '[ProContext] Failed to load Pro subscription:',
          error,
        );

        /*
         * Firestore failure must never revoke cached Pro.
         */
        if (isMounted && !isProRef.current) {
          setLoading(false);
        }
      }
    };

    const runSilentRevalidation = async () => {
      if (!isNative) {
        if (isMounted) {
          setBillingVerification(true);
        }

        return;
      }

      try {
        const result: RevalidationResult =
          await silentRevalidateProSubscription();

        if (!isMounted) return;

        if (result === 'active') {
          /*
           * Google Play confirmed ownership.
           * useBilling is responsible for ensuring the verified purchase is
           * acknowledged/finished and for updating the UID-bound cache.
           */
          setBillingVerification(true);
          setLoading(false);

          await refreshSubscription();
          return;
        }

        if (result === 'revoked') {
          /*
           * Only an explicit Play revocation is allowed to remove native Pro.
           */
          clearCurrentUserCache();
          setBillingVerification(true);
          resetSubscriptionState();
          setLoading(false);
          return;
        }

        /*
         * 'unavailable':
         * Store/network is unavailable. Keep an existing cached Pro
         * entitlement instead of showing Free or wiping the cache.
         */
        if (isProRef.current) {
          setBillingVerification(true);
        } else {
          setBillingVerification(true);
          setLoading(false);
        }
      } catch (error) {
        console.warn(
          '[ProContext] Silent revalidation error:',
          error,
        );

        if (!isMounted) return;

        /*
         * Verification failure is not proof of revocation.
         * Keep cached Pro if it exists; otherwise finish the loading state so
         * a normal Free account is not stuck behind the Play store.
         */
        setBillingVerification(true);
        setLoading(false);
      }
    };

    const handleSubscriptionRefresh = (event: Event) => {
      if (!isMounted) return;

      const playStoreVerified =
        (
          event as CustomEvent<{
            playStoreVerified?: boolean;
          }>
        ).detail?.playStoreVerified === true;

      if (playStoreVerified) {
        setBillingVerification(true);
        void refreshSubscription();
        return;
      }

      /*
       * Local change notifications should not bypass the native Play gate.
       */
      if (!isNative || billingVerifiedRef.current) {
        void refreshSubscription();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSilentRevalidation();
      }
    };

    const handleProChange = () => {
      if (!isMounted) return;

      setProOverride(getProOverride());
    };

    window.addEventListener(
      PRO_SUBSCRIPTION_REFRESH_EVENT,
      handleSubscriptionRefresh,
    );
    window.addEventListener('splitmate_pro_changed', handleProChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    /*
     * Periodic background ownership check.
     */
    const revalidationIntervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void runSilentRevalidation();
      }
    }, 15 * 60 * 1000);

    if (isNative) {
      void CapacitorApp.addListener('resume', () => {
        void runSilentRevalidation();
      })
        .then((listener) => {
          resumeListener = listener;
        })
        .catch(() => { });

      void CapacitorApp.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (isActive) {
            void runSilentRevalidation();
          }
        },
      )
        .then((listener) => {
          appStateListener = listener;
        })
        .catch(() => { });
    }

    const unsubscribeAuth = subscribeGoogleAuth((user) => {
      unsubscribeSubscription();
      unsubscribeSubscription = () => { };

      const nextUid = user?.uid ?? null;
      const isInitialLoad = previousUserUid === undefined;
      const uidChanged =
        !isInitialLoad && previousUserUid !== nextUid;

      previousUserUid = nextUid;
      currentUserUidRef.current = nextUid;
      const nextEmail = user?.email ?? null;
      setCurrentUserEmail(nextEmail);
      currentUserEmailRef.current = nextEmail;

      /*
       * Account changed:
       * never carry Account A's React entitlement into Account B.
       * Account B gets its own UID-bound cache below.
       */
      if (uidChanged) {
        resetSubscriptionState();
        setLoading(true);
        setBillingVerification(!isNative);
      }

      if (!user) {
        currentUserUidRef.current = null;
        resetSubscriptionState();
        setLoading(false);
        setBillingVerification(!isNative);
        return;
      }

      setLastAuthUid(user.uid);

      /*
       * Instant UID-bound cache.
       * This is what makes Lifetime Pro appear immediately after app launch.
       */
      const cached = getProStatusCacheForUser(user.uid);

      if (cached.isPro && cached.plan === 'lifetime') {
        setIsPro(true);
        setPlan('lifetime');
        setLoading(false);

        if (isNative) {
          setBillingVerification(true);
        } else {
          setBillingVerification(true);
        }
      } else {
        setIsPro(false);
        setPlan(null);
        setLoading(true);
        setBillingVerification(!isNative);
      }

      /*
       * Firebase listener is attached for synchronization, but on native it
       * cannot grant/revoke Pro until Play verification has completed.
       */
      unsubscribeSubscription =
        subscribeToProSubscriptionForCurrentUser(
          user.uid,
          (record) => {
            if (!isMounted) return;

            if (isNative && !billingVerifiedRef.current) {
              if (record && isProSubscriptionActive(record)) {
                setSubscription(record);
              }

              return;
            }

            if (record && isProSubscriptionActive(record)) {
              setSubscription(record);
              setIsPro(true);
              setPlan('lifetime');
              setLoading(false);

              setProStatusCacheForUser(
                user.uid,
                user.email,
                true,
                record.purchaseToken,
              );
            } else if (
              record &&
              (record.isExpired ||
                record.subscriptionState === 'expired')
            ) {
              applySubscription(record);
            }
          },
        );

      /*
       * Play verification is deliberately background work. It must not block
       * the initial cached Pro UI.
       */
      void runSilentRevalidation();
    });

    return () => {
      isMounted = false;

      window.removeEventListener(
        PRO_SUBSCRIPTION_REFRESH_EVENT,
        handleSubscriptionRefresh,
      );
      window.removeEventListener(
        'splitmate_pro_changed',
        handleProChange,
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );

      window.clearInterval(revalidationIntervalId);

      if (resumeListener) {
        void resumeListener.remove();
      }

      if (appStateListener) {
        void appStateListener.remove();
      }

      unsubscribeSubscription();
      unsubscribeAuth();
    };
  }, [isNative]);

  const overrideActive = isDevOverrideEmail(currentUserEmail);

  /*
   * Do not use billingVerified to hide cached Pro or show a loading screen.
   * The cache is intentionally the fast path; Google Play verification is
   * background validation.
   */
  const effectiveLoading = loading;

  const effectiveIsPro =
    isPro &&
    (!overrideActive || proOverride !== 'force-free');

  const effectivePlan = effectiveIsPro ? plan : null;

  const value = useMemo<ProContextValue>(
    () => ({
      isPro: effectiveIsPro,
      plan: effectivePlan,
      loading: effectiveLoading,
      subscription,
    }),
    [
      effectiveIsPro,
      effectivePlan,
      effectiveLoading,
      subscription,
    ],
  );

  return (
    <ProContext.Provider value={value}>
      {children}
    </ProContext.Provider>
  );
}

export type { ProContextValue };
