import 'cordova-plugin-purchase';

import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSubscriptionRecordFromVerifiedPurchase,
  getPlanEndDate,
  getPlanIdFromProductId,
  getProductIdForPlan,
  normalizeProSubscription,
  pickBestVerifiedPurchase,
  type ProSubscriptionRecord,
  type BillingProductState,
  type ProPlanId,
} from '@/lib/proSubscription';
import { loadProSubscriptionForCurrentUser, saveProSubscriptionForCurrentUser } from '@/integrations/firebase/proSubscription';
import { getCurrentGoogleUser, subscribeGoogleAuth } from '@/integrations/firebase/auth';
import { clearProStatusCache, setProStatusCache } from '@/lib/proAccess';

const PRODUCT_META: Array<{ plan: ProPlanId; productId: string; name: string; type: CdvPurchase.ProductType; }> = [
  { plan: 'monthly', productId: 'pro_monthly', name: 'SplitMate Pro - Monthly', type: CdvPurchase.ProductType.PAID_SUBSCRIPTION },
  { plan: 'yearly', productId: 'pro_yearly', name: 'SplitMate Pro - Yearly', type: CdvPurchase.ProductType.PAID_SUBSCRIPTION },
  { plan: 'lifetime', productId: 'pro_lifetime', name: 'SplitMate Pro - Lifetime', type: CdvPurchase.ProductType.NON_CONSUMABLE },
];

type BillingProduct = BillingProductState;

const PRO_SUBSCRIPTION_REFRESH_EVENT = 'splitmate-pro-subscription-updated';
const AUTH_WAIT_TIMEOUT_MS = 15000;

function getStore() {
  const store = window.CdvPurchase?.store;
  if (!store) {
    throw new Error('In-app purchase store is not available yet.');
  }
  return store as typeof CdvPurchase.store;
}

function getLocalizedPrice(product?: CdvPurchase.Product) {
  return product?.pricing?.price ?? product?.getOffer()?.pricingPhases?.[0]?.price ?? null;
}

function createInitialProducts(): BillingProduct[] {
  return PRODUCT_META.map((item) => ({
    plan: item.plan,
    productId: item.productId,
    name: item.name,
    localizedPrice: null,
    loading: true,
  }));
}

function notifyProSubscriptionChanged() {
  window.dispatchEvent(new Event(PRO_SUBSCRIPTION_REFRESH_EVENT));
}

function formatPurchaseError(error: unknown) {
  const message = (error as Error)?.message ?? '';

  if (message === 'auth/not-signed-in') {
    return 'Sign in with Google first, then retry the purchase.';
  }

  return message || 'Unable to save purchase.';
}

function getTransactionProductId(transaction: CdvPurchase.Transaction) {
  return transaction.products?.[0]?.id ?? null;
}

function isTransactionStillValid(transaction: CdvPurchase.Transaction): boolean {
  const transactionAny = transaction as any;
  const expiryDate =
    toIsoDate(transactionAny.expiryDate)
    || toIsoDate(transactionAny.expirationDate)
    || toIsoDate(transactionAny.expiresDate)
    || toIsoDate(transactionAny.expiryTime)
    || toIsoDate(transactionAny.expiryTimeMillis)
    || toIsoDate(transactionAny.expiryDateMillis)
    || toIsoDate(transactionAny.expirationDateMillis)
    || toIsoDate(transactionAny.expiryDateMs)
    || toIsoDate(transactionAny.expiryDateInMillis);

  if (!expiryDate) return true;
  return new Date(expiryDate).getTime() > Date.now();
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === 'number') {
    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const parsed = new Date(millis);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      return toIsoDate(Number(trimmed));
    }
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  return null;
}

function buildSubscriptionRecordFromApprovedTransaction(transaction: CdvPurchase.Transaction): ProSubscriptionRecord | null {
  const productId = getTransactionProductId(transaction);
  if (!productId) return null;

  const plan = getPlanIdFromProductId(productId);
  if (!plan) return null;

  const purchasedAt = transaction.lastRenewalDate ?? transaction.purchaseDate ?? new Date();
  const transactionAny = transaction as any;
  const explicitExpiryDate =
    toIsoDate(transactionAny.expiryDate)
    || toIsoDate(transactionAny.expirationDate)
    || toIsoDate(transactionAny.expiresDate)
    || toIsoDate(transactionAny.expiryTime)
    || toIsoDate(transactionAny.expiryTimeMillis)
    || toIsoDate(transactionAny.expiryDateMillis)
    || toIsoDate(transactionAny.expirationDateMillis)
    || toIsoDate(transactionAny.expiryDateMs)
    || toIsoDate(transactionAny.expiryDateInMillis);

  const computedEndDate = explicitExpiryDate ?? (plan === 'lifetime' ? null : getPlanEndDate(plan, purchasedAt));
  const isExpiredByDate = computedEndDate ? new Date(computedEndDate).getTime() <= Date.now() : false;

  return normalizeProSubscription({
    isPro: true,
    plan,
    startDate: purchasedAt.toISOString(),
    endDate: computedEndDate,
    purchaseToken: transaction.purchaseId ?? transaction.transactionId ?? `${productId}:${purchasedAt.getTime()}`,
    productId,
    isExpired: isExpiredByDate,
    restoredAt: null,
  });
}

function pickBestLocalTransaction(transactions: CdvPurchase.Transaction[]) {
  const priority: Record<ProPlanId, number> = { lifetime: 3, yearly: 2, monthly: 1 };

  return transactions
    .map((transaction) => {
      const productId = getTransactionProductId(transaction);
      const plan = productId ? getPlanIdFromProductId(productId) : null;
      return { transaction, plan };
    })
    .filter((entry): entry is { transaction: CdvPurchase.Transaction; plan: ProPlanId } => Boolean(entry.plan))
    .sort((left, right) => {
      const planDiff = priority[right.plan] - priority[left.plan];
      if (planDiff !== 0) return planDiff;

      const leftDate = (left.transaction.lastRenewalDate ?? left.transaction.purchaseDate)?.getTime() ?? 0;
      const rightDate = (right.transaction.lastRenewalDate ?? right.transaction.purchaseDate)?.getTime() ?? 0;
      return rightDate - leftDate;
    })[0]?.transaction ?? null;
}

function waitForCurrentGoogleUser(timeoutMs = AUTH_WAIT_TIMEOUT_MS) {
  const currentUser = getCurrentGoogleUser();
  if (currentUser) {
    return Promise.resolve(currentUser);
  }

  return new Promise<NonNullable<ReturnType<typeof getCurrentGoogleUser>>>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      unsubscribe();
      reject(new Error('Firebase Auth user was not ready before the purchase callback completed. Please sign in again and retry.'));
    }, timeoutMs);

    const unsubscribe = subscribeGoogleAuth((user) => {
      if (!user) {
        return;
      }

      window.clearTimeout(timeoutId);
      unsubscribe();
      resolve(user);
    });
  });
}

export function useBilling() {
  const [products, setProducts] = useState<BillingProduct[]>(() => createInitialProducts());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const persistedPurchaseTokensRef = useRef(new Set<string>());
  const pendingPurchaseTokensRef = useRef(new Set<string>());
  const isStoreInitRestoreRef = useRef(false);

  const syncProducts = useCallback(() => {
    if (!Capacitor.isNativePlatform() || !window.CdvPurchase?.store) {
      setProducts(createInitialProducts().map((item) => ({ ...item, loading: false })));
      return;
    }

    const store = getStore();
    setProducts(PRODUCT_META.map((item) => {
      const product = store.get(item.productId, CdvPurchase.Platform.GOOGLE_PLAY) ?? store.get(item.productId);
      return {
        plan: item.plan,
        productId: item.productId,
        name: item.name,
        localizedPrice: getLocalizedPrice(product),
        loading: !product?.pricing?.price,
        product,
      };
    }));
  }, []);

  const syncBestVerifiedPurchase = useCallback(async (restoredAt: string | null): Promise<ProSubscriptionRecord | null> => {
    const store = getStore();
    const bestPurchase = pickBestVerifiedPurchase(store.verifiedPurchases);
    if (!bestPurchase) return null;

    const record = buildSubscriptionRecordFromVerifiedPurchase(bestPurchase, restoredAt);
    if (!record) return null;

    await saveProSubscriptionForCurrentUser(record);
    return record;
  }, []);

  const syncBestLocalTransactionPurchase = useCallback(async (): Promise<ProSubscriptionRecord | null> => {
    const store = getStore();
    const bestTransaction = pickBestLocalTransaction(store.localTransactions);
    if (!bestTransaction) return null;

    const record = buildSubscriptionRecordFromApprovedTransaction(bestTransaction);
    if (!record) return null;

    await saveProSubscriptionForCurrentUser(record);
    return record;
  }, []);

  const persistProRecordAndFinish = useCallback(async (
    record: ProSubscriptionRecord,
    finish: () => Promise<void>,
  ) => {
    if (persistedPurchaseTokensRef.current.has(record.purchaseToken) || pendingPurchaseTokensRef.current.has(record.purchaseToken)) {
      return;
    }

    pendingPurchaseTokensRef.current.add(record.purchaseToken);

    try {
      await waitForCurrentGoogleUser();
      await saveProSubscriptionForCurrentUser(record);
      await finish();

      persistedPurchaseTokensRef.current.add(record.purchaseToken);
      setProStatusCache(true, record.plan, record.endDate);
      setError(null);
      notifyProSubscriptionChanged();
      syncProducts();
    } finally {
      pendingPurchaseTokensRef.current.delete(record.purchaseToken);
    }
  }, [syncProducts]);

  const initBilling = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setLoading(false);
      setProducts(createInitialProducts().map((item) => ({ ...item, loading: false })));
      return;
    }

    const store = getStore();

    if (initializedRef.current) {
      syncProducts();
      setLoading(false);
      return;
    }

    initializedRef.current = true;

    const validatorUrl = (import.meta.env.VITE_PRO_SUBSCRIPTION_VALIDATOR_URL as string | undefined)?.trim();
    if (validatorUrl) {
      store.validator = validatorUrl;
    }

    store.when()
      .approved((transaction) => {
        void (async () => {
          console.log('1. Receipt approved fired');
          console.log('2. UID:', getCurrentGoogleUser()?.uid);
          try {
            const existingRecord = await loadProSubscriptionForCurrentUser().catch(() => null);

            const transactionRecord = buildSubscriptionRecordFromApprovedTransaction(transaction);
            if (transactionRecord) {
              if (!isTransactionStillValid(transaction)) {
                await transaction.finish();
                return;
              }

              if (isStoreInitRestoreRef.current && existingRecord?.isPro) {
                await transaction.finish();
                return;
              }

              console.log('3. About to write to Firestore');
              await persistProRecordAndFinish(transactionRecord, () => transaction.finish());
              console.log('4. Firestore write success');
              console.log('5. store.finish() called');
            } else {
              console.log('Approved callback: transaction did not map to a Pro record');
            }

            void transaction.verify().catch(() => {
              // Verification can fail when validator is unavailable; approved flow already persisted entitlement.
            });
          } catch (purchaseError) {
            console.error('Approved callback failed:', purchaseError);
            setError(formatPurchaseError(purchaseError));
          }
        })();
      }, 'splitmate_pro_approved')
      .verified((receipt) => {
        void (async () => {
          console.log('1. Receipt approved fired');
          console.log('2. UID:', getCurrentGoogleUser()?.uid);
          try {
            const existingRecord = await loadProSubscriptionForCurrentUser().catch(() => null);

            const bestPurchase = pickBestVerifiedPurchase(receipt.collection);
            if (!bestPurchase) {
              console.log('Verified callback: no best purchase in receipt collection');
              setError('No verified purchase was found.');
              return;
            }

            if (!isTransactionStillValid(bestPurchase as unknown as CdvPurchase.Transaction)) {
              await receipt.finish();
              return;
            }

            const record = buildSubscriptionRecordFromVerifiedPurchase(bestPurchase, null);
            if (!record) {
              console.log('Verified callback: purchase did not map to a Pro record');
              setError('Purchase did not match a Pro plan.');
              return;
            }

            if (isStoreInitRestoreRef.current && existingRecord?.isPro) {
              await receipt.finish();
              return;
            }

            console.log('3. About to write to Firestore');
            await persistProRecordAndFinish(record, () => receipt.finish());
            console.log('4. Firestore write success');
            console.log('5. store.finish() called');
          } catch (purchaseError) {
            console.error('Verified callback failed:', purchaseError);
            setError(formatPurchaseError(purchaseError));
          }
        })();
      }, 'splitmate_pro_verified')
      .unverified((response) => {
        void (async () => {
          const responseData = response as CdvPurchase.UnverifiedReceipt | null;
          const fallbackTransaction = responseData?.receipt?.lastTransaction?.();
          const fallbackRecord = fallbackTransaction ? buildSubscriptionRecordFromApprovedTransaction(fallbackTransaction) : null;

          if (fallbackRecord) {
            try {
              await persistProRecordAndFinish(fallbackRecord, () => responseData.receipt.finish());
              return;
            } catch (purchaseError) {
              setError(formatPurchaseError(purchaseError));
              return;
            }
          }

          const message = (responseData?.payload as { message?: string } | null)?.message
            || (response as { message?: string } | null)?.message
            || 'Purchase could not be verified.';
          setError(message);
        })();
      }, 'splitmate_pro_unverified');

    PRODUCT_META.forEach((item) => {
      store.register({
        id: item.productId,
        type: item.type,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      });
    });

    isStoreInitRestoreRef.current = true;

    try {
      await store.initialize([CdvPurchase.Platform.GOOGLE_PLAY]);
      await store.update();
      syncProducts();
    } finally {
      isStoreInitRestoreRef.current = false;
      setLoading(false);
    }
  }, [syncProducts]);

  useEffect(() => {
    void initBilling();
  }, [initBilling]);

  const purchasePlan = useCallback(async (plan: ProPlanId) => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Purchases are available on Android devices only.');
    }

    const store = getStore();
    const productId = getProductIdForPlan(plan);
    const product = store.get(productId, CdvPurchase.Platform.GOOGLE_PLAY) ?? store.get(productId);
    const offer = product?.getOffer();

    if (!product || !offer) {
      throw new Error('This plan is not available yet.');
    }

    const orderError = await offer.order();
    if (orderError) {
      if ((orderError as any)?.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
        return;
      }

      throw new Error((orderError as { message?: string } | null)?.message || 'Purchase failed.');
    }

    await store.update();
  }, []);

  const purchaseMonthly = useCallback(() => purchasePlan('monthly'), [purchasePlan]);
  const purchaseYearly = useCallback(() => purchasePlan('yearly'), [purchasePlan]);
  const purchaseLifetime = useCallback(() => purchasePlan('lifetime'), [purchasePlan]);

  const restorePurchases = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Restore purchases is available on Android devices only.');
    }

    const store = getStore();
    await store.restorePurchases();
    await store.update();
    syncProducts();

    const restoredFromVerified = await syncBestVerifiedPurchase(new Date().toISOString());
    const restoredFromLocal = restoredFromVerified ? null : await syncBestLocalTransactionPurchase();
    const restoredRecord = restoredFromVerified || restoredFromLocal;
    const restored = Boolean(restoredRecord);

    if (restored) {
      setProStatusCache(true, restoredRecord!.plan, restoredRecord!.endDate);
      notifyProSubscriptionChanged();
    } else {
      clearProStatusCache();
      notifyProSubscriptionChanged();
    }

    return restored;
  }, [syncBestLocalTransactionPurchase, syncBestVerifiedPurchase, syncProducts]);

  return useMemo(() => ({
    products,
    purchaseMonthly,
    purchaseYearly,
    purchaseLifetime,
    restorePurchases,
    loading,
    error,
  }), [error, loading, products, purchaseLifetime, purchaseMonthly, purchaseYearly, restorePurchases]);
}
