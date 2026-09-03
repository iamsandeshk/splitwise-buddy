/* eslint-disable react-refresh/only-export-components */
import { createContext, type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
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
import { silentRevalidateProSubscription, type RevalidationResult } from '@/hooks/useBilling';
import {
    clearProStatusCache,
    getProOverride,
    isDevOverrideEmail,
    setProStatusCache,
    setProStatusCacheForUser,
    getProStatusCacheForUser,
    getLastAuthUid,
    setLastAuthUid,
    clearLastAuthUid,
} from '@/lib/proAccess';
import { getAccountProfile } from '@/lib/storage';

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

    const initialCached = useMemo(() => {
        const lastUid = getLastAuthUid();
        if (lastUid) {
            const cached = getProStatusCacheForUser(lastUid);
            if (cached.isPro && cached.plan === 'lifetime') {
                return { isPro: true, plan: 'lifetime' as ProPlanId, loading: false };
            }
        }
        return { isPro: false, plan: null, loading: true };
    }, []);

    const [subscription, setSubscription] = useState<ProSubscriptionRecord | null>(null);
    const [isPro, setIsPro] = useState(initialCached.isPro);
    const [plan, setPlan] = useState<ProPlanId | null>(initialCached.plan);
    const [loading, setLoading] = useState(initialCached.loading);
    const [billingVerified, setBillingVerified] = useState(!isNative || initialCached.isPro);
    const billingVerifiedRef = useRef(!isNative || initialCached.isPro);

    const setBillingVerification = (value: boolean) => {
        billingVerifiedRef.current = value;
        setBillingVerified(value);
    };
    const [proOverride, setProOverride] = useState(getProOverride());
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const currentUserEmailRef = useRef<string | null>(null);
    const isProRef = useRef(isPro);

    useEffect(() => {
        isProRef.current = isPro;
    }, [isPro]);

    useEffect(() => {
        let isMounted = true;
        let unsubscribeSubscription = () => { };
        let resumeListener: { remove: () => Promise<void> } | null = null;
        let appStateListener: { remove: () => Promise<void> } | null = null;
        let previousUserUid: string | null | undefined = undefined;

        const resetSubscriptionState = () => {
            if (!isMounted) return;

            clearProStatusCache();
            setSubscription(null);
            setIsPro(false);
            setPlan(null);
        };

        const finishCachedTransactionsForSubscription = async (record: ProSubscriptionRecord) => {
            const store = window.CdvPurchase?.store;
            if (!store?.localTransactions?.length || !record.purchaseToken) return;

            const matchingTransactions = store.localTransactions.filter((transaction) => {
                return transaction.purchaseId === record.purchaseToken;
            });

            await Promise.all(
                matchingTransactions.map((transaction) => transaction.finish().catch(() => { })),
            );
        };

        const applySubscription = (record: ProSubscriptionRecord | null) => {
            if (!isMounted) return;

            // On native, Firestore is synchronization/storage only. Google Play
            // verification is the authority for granting or revoking Lifetime Pro.
            // This prevents stale Firestore state from re-granting Pro after a
            // refund/revocation, and prevents a transient Firestore "expired"
            // record from wiping a valid local entitlement.
            if (isNative && !billingVerifiedRef.current) {
                if (record && isProSubscriptionActive(record)) {
                    setSubscription(record);
                }
                return;
            }

            if (!record) {
                // If the user already has a valid local entitlement, do not wipe it
                // merely because Firestore is temporarily unavailable/empty.
                if (!isProRef.current) {
                    resetSubscriptionState();
                    setLoading(false);
                }
                return;
            }

            if (
                record.isExpired ||
                !isProSubscriptionActive(record) ||
                record.subscriptionState === 'expired'
            ) {
                clearProStatusCache();
                localStorage.removeItem('splitmate_pro_override');

                finishCachedTransactionsForSubscription(record)
                    .catch(() => { })
                    .finally(() => {
                        resetSubscriptionState();
                        setLoading(false);
                    });
                return;
            }

            setSubscription(record);
            setIsPro(true);
            setPlan('lifetime');
            setLoading(false);
            setBillingVerification(true);
            const activeUid = previousUserUid || getLastAuthUid();
            if (activeUid) {
                setProStatusCacheForUser(
                    activeUid,
                    currentUserEmailRef.current,
                    true,
                    record.purchaseToken,
                );
            }
        };

        const refreshSubscription = async () => {
            try {
                const record = await loadProSubscriptionForCurrentUser();
                applySubscription(record);
            } catch (error) {
                console.warn('[ProContext] Failed to load Pro subscription:', error);
                if (!isProRef.current) {
                    applySubscription(null);
                }
            }
        };

        const runSilentRevalidation = async () => {
            if (!isNative) {
                if (isMounted) setBillingVerification(true);
                return;
            }

            try {
                const result: RevalidationResult = await silentRevalidateProSubscription();

                if (!isMounted) return;

                if (result === 'active') {
                    // Google Play confirmed ownership.
                    setBillingVerification(true);
                    setLoading(false);
                    await refreshSubscription();
                    return;
                }

                if (result === 'revoked') {
                    // Google Play explicitly confirmed no Lifetime Pro ownership.
                    clearProStatusCache();
                    setBillingVerification(true);
                    resetSubscriptionState();
                    setLoading(false);
                    return;
                }

                // Unavailable state (network failure / store unreachable):
                // DO NOT revoke Lifetime Pro! If already active, keep it.
                if (isMounted) {
                    if (isProRef.current) {
                        setBillingVerification(true);
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.warn('[ProContext] Silent revalidation error:', error);
                if (isMounted) {
                    if (isProRef.current) {
                        setBillingVerification(true);
                    }
                    setLoading(false);
                }
            }
        };

        const handleSubscriptionRefresh = (event: Event) => {
            if (!isMounted) return;

            const playStoreVerified =
                (event as CustomEvent<{ playStoreVerified?: boolean }>).detail?.playStoreVerified === true;

            if (playStoreVerified) {
                setBillingVerification(true);
                void refreshSubscription();
                return;
            }

            // For ordinary local change notifications, refresh only after Play has
            // already been verified on native. This prevents stale Firestore from
            // re-granting access during a revocation race.
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
            if (isMounted) setProOverride(getProOverride());
        };

        window.addEventListener(PRO_SUBSCRIPTION_REFRESH_EVENT, handleSubscriptionRefresh);
        window.addEventListener('splitmate_pro_changed', handleProChange);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Revalidate every 15 minutes while the app is open.
        const revalidationIntervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void runSilentRevalidation();
            }
        }, 15 * 60 * 1000);

        if (isNative) {
            void CapacitorApp.addListener('resume', () => {
                void runSilentRevalidation();
            }).then((listener) => {
                resumeListener = listener;
            }).catch(() => { });

            void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
                if (isActive) void runSilentRevalidation();
            }).then((listener) => {
                appStateListener = listener;
            }).catch(() => { });
        }

        const unsubscribeAuth = subscribeGoogleAuth((user) => {
            unsubscribeSubscription();
            unsubscribeSubscription = () => { };

            const email = user?.email ?? null;
            setCurrentUserEmail(email);
            currentUserEmailRef.current = email;

            const isInitialLoad = previousUserUid === undefined;
            const uidChanged = !isInitialLoad && previousUserUid !== user?.uid;
            previousUserUid = user?.uid ?? null;

            if (uidChanged) {
                resetSubscriptionState();
                if (isNative) setBillingVerification(false);
            }

            if (!user) {
                currentUserEmailRef.current = null;
                clearLastAuthUid();
                resetSubscriptionState();
                setLoading(false);
                if (!isNative) setBillingVerification(true);
                return;
            }

            setLastAuthUid(user.uid);

            // 1. Instant local entitlement from UID-bound cache
            const cached = getProStatusCacheForUser(user.uid);
            if (cached.isPro && cached.plan === 'lifetime') {
                // UID-bound cache is safe to use immediately for UI/offline access.
                // Play revalidation still runs in the background.
                setIsPro(true);
                setPlan('lifetime');
                setLoading(false);
                setBillingVerification(true);
            } else {
                setIsPro(false);
                setPlan(null);
                setLoading(true);
                if (isNative) setBillingVerification(false);
            }

            // 2. Listen to Firebase for synchronized entitlement state
            unsubscribeSubscription = subscribeToProSubscriptionForCurrentUser(
                user.uid,
                (record) => {
                    if (!isMounted) return;

                    if (isNative && !billingVerifiedRef.current) {
                        // Keep the Firestore record available for display/sync, but
                        // never let it grant or revoke native Pro before Play has
                        // confirmed ownership.
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
                        setBillingVerification(true);
                        setProStatusCacheForUser(
                            user.uid,
                            user.email,
                            true,
                            record.purchaseToken,
                        );
                    } else if (
                        record &&
                        (record.isExpired || record.subscriptionState === 'expired')
                    ) {
                        applySubscription(record);
                    }
                },
            );

            // 3. Play verification runs in background without blocking UI
            void runSilentRevalidation();
        });

        return () => {
            isMounted = false;
            window.removeEventListener(PRO_SUBSCRIPTION_REFRESH_EVENT, handleSubscriptionRefresh);
            window.removeEventListener('splitmate_pro_changed', handleProChange);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.clearInterval(revalidationIntervalId);

            if (resumeListener) void resumeListener.remove();
            if (appStateListener) void appStateListener.remove();

            unsubscribeSubscription();
            unsubscribeAuth();
        };
    }, [isNative]);

    const overrideActive = isDevOverrideEmail(currentUserEmail);
    // A valid UID-bound cache is intentionally usable immediately. Play
    // verification runs in the background and can revoke it only when Google Play
    // explicitly confirms that ownership is gone.
    const effectiveLoading = loading;
    const effectiveIsPro =
        isPro &&
        (!overrideActive || proOverride !== 'force-free');
    const effectivePlan = effectiveIsPro ? plan : null;

    const value = useMemo<ProContextValue>(() => ({
        isPro: effectiveIsPro,
        plan: effectivePlan,
        loading: effectiveLoading,
        subscription,
    }), [effectiveIsPro, effectivePlan, effectiveLoading, subscription]);

    return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export const ProProvider = ProContextProvider;

export type { ProContextValue };
