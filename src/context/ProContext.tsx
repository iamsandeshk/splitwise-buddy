import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { subscribeGoogleAuth } from '@/integrations/firebase/auth';
import {
  deleteProSubscriptionForCurrentUser,
  loadProSubscriptionForCurrentUser,
  subscribeToProSubscriptionForCurrentUser,
} from '@/integrations/firebase/proSubscription';
import {
  isProSubscriptionActive,
  type ProPlanId,
  type ProSubscriptionRecord,
} from '@/lib/proSubscription';
import { clearProStatusCache, getProOverride, getProStatusCache, isDevOverrideEmail, setProStatusCache } from '@/lib/proAccess';
import { getAccountProfile, saveAccountProfile } from '@/lib/storage';

const PRO_SUBSCRIPTION_REFRESH_EVENT = 'splitmate-pro-subscription-updated';

type ProContextValue = {
  isPro: boolean;
  plan: ProPlanId | null;
  loading: boolean;
  subscription: ProSubscriptionRecord | null;
};

const ProContext = createContext<ProContextValue | null>(null);

export function ProContextProvider({ children }: PropsWithChildren) {
  const cachedProStatus = getProStatusCache();
  const [subscription, setSubscription] = useState<ProSubscriptionRecord | null>(null);
  const [isPro, setIsPro] = useState(cachedProStatus.isPro);
  const [plan, setPlan] = useState<ProPlanId | null>((cachedProStatus.plan as ProPlanId | null) ?? null);
  const [loading, setLoading] = useState(!cachedProStatus.isPro);
  const [proOverride, setProOverride] = useState(getProOverride());
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeSubscription = () => {};

    const finishCachedTransactionsForSubscription = async (record: ProSubscriptionRecord) => {
      const store = window.CdvPurchase?.store;
      if (!store?.localTransactions?.length) {
        return;
      }

      const matchingTransactions = store.localTransactions.filter((transaction) => {
        const productId = transaction.products?.[0]?.id ?? null;
        const purchaseToken = transaction.purchaseId ?? transaction.transactionId ?? null;
        return productId === record.productId || purchaseToken === record.purchaseToken;
      });

      await Promise.all(matchingTransactions.map((transaction) => transaction.finish().catch(() => {})));
    };

    const resetSubscriptionState = () => {
      if (!isMounted) {
        return;
      }

      clearProStatusCache();
      setSubscription(null);
      setIsPro(false);
      setPlan(null);
    };

    const applySubscription = (record: ProSubscriptionRecord | null) => {
      if (!isMounted) {
        return;
      }

      if (!record) {
        resetSubscriptionState();
        setLoading(false);
        return;
      }

      const now = Date.now();

      const endDateMs = record.endDate ? new Date(record.endDate).getTime() : null;
      const isExpired = endDateMs !== null && endDateMs <= now;

      if (isExpired) {
        const profile = getAccountProfile();
        if (profile.nightlyBackupEnabled) {
          saveAccountProfile({ ...profile, nightlyBackupEnabled: false });
        }

        void deleteProSubscriptionForCurrentUser()
          .catch(() => {})
          .finally(() => {
            void finishCachedTransactionsForSubscription(record)
              .catch(() => {})
              .finally(() => {
                resetSubscriptionState();
                setLoading(false);
              });
          });
        return;
      }

      if (!isProSubscriptionActive(record, now)) {
        resetSubscriptionState();
        setLoading(false);
        return;
      }

      setSubscription(record);
      setIsPro(true);
      setPlan(record.plan);
      setLoading(false);
      setProStatusCache(true, record.plan, record.endDate);
    };

    const refreshSubscription = () => {
      void loadProSubscriptionForCurrentUser()
        .then((record) => {
          applySubscription(record);
        })
        .catch(() => {
          applySubscription(null);
        });
    };

    const handleSubscriptionRefresh = () => {
      refreshSubscription();
    };

    const handleProChange = () => {
      if (!isMounted) {
        return;
      }

      setProOverride(getProOverride());
    };

    window.addEventListener(PRO_SUBSCRIPTION_REFRESH_EVENT, handleSubscriptionRefresh);
    window.addEventListener('splitmate_pro_changed', handleProChange);

    const unsubscribeAuth = subscribeGoogleAuth((user) => {
      unsubscribeSubscription();
      unsubscribeSubscription = () => {};

      setCurrentUserEmail(user?.email ?? null);

      // On account switch or logout, clear stale Pro state immediately.
      resetSubscriptionState();

      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);

      unsubscribeSubscription = subscribeToProSubscriptionForCurrentUser(user.uid, (record) => {
        applySubscription(record);
      });
    });

    return () => {
      isMounted = false;
      window.removeEventListener(PRO_SUBSCRIPTION_REFRESH_EVENT, handleSubscriptionRefresh);
      window.removeEventListener('splitmate_pro_changed', handleProChange);
      unsubscribeSubscription();
      unsubscribeAuth();
    };
  }, []);

  const effectiveIsPro = proOverride === 'on' && isDevOverrideEmail(currentUserEmail) ? false : isPro;
  const effectivePlan = effectiveIsPro ? plan : null;

  const value = useMemo<ProContextValue>(() => ({
    isPro: effectiveIsPro,
    plan: effectivePlan,
    loading,
    subscription,
  }), [effectiveIsPro, effectivePlan, loading, subscription]);

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function useProGate() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error('useProGate must be used within ProContextProvider.');
  }

  return {
    isPro: context.isPro,
    plan: context.plan,
    loading: context.loading,
  };
}

export type { ProContextValue };
