import 'cordova-plugin-purchase';

import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSubscriptionRecordFromVerifiedPurchase,
  getPlanIdFromProductId,
  getProductIdForPlan,
  normalizeProSubscription,
  pickBestVerifiedPurchase,
  type ProSubscriptionRecord,
  type BillingProductState,
  type ProPlanId,
} from '@/lib/proSubscription';
import { loadProSubscriptionForCurrentUser, saveProSubscriptionForCurrentUser, deleteProSubscriptionForCurrentUser } from '@/integrations/firebase/proSubscription';
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
let silentRevalidationInFlight: Promise<void> | null = null;
let revalidationStoreReady = false;
let revalidationStoreReadyInFlight: Promise<void> | null = null;

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

function inferPurchaseClassification(purchase: any, purchaseToken: string): { isTestPurchase: boolean; purchaseType: 'trial' | 'test' | 'paid' } {
  const token = purchaseToken.toLowerCase();
  const environment = String(purchase?.environment ?? purchase?.receipt?.environment ?? '').toLowerCase();
  const purchaseState = String(purchase?.purchaseState ?? purchase?.state ?? '').toLowerCase();
  const isAcknowledged = purchase?.isAcknowledged;

  const isTestToken = token.startsWith('test-')
    || token.startsWith('android.test')
    || token.includes('test')
    || token.includes('sandbox')
    || token.includes('fake');

  const isSandbox = Boolean(purchase?.isSandbox)
    || environment.includes('sandbox')
    || environment.includes('test');

  const isTestPurchase = isTestToken || isSandbox;

  const isTrial = Boolean(
    purchase?.isTrialPeriod
    || purchase?.trialPeriod
    || purchase?.freeTrialPeriod
    || purchase?.introductoryPriceInfo
    || purchase?.offerType === 'trial'
    || purchase?.paymentState === 'free_trial'
    || purchase?.receipt?.isTrialPeriod,
  );

  const isPending = purchaseState === 'pending' || purchaseState === '0';
  const isCanceled = purchaseState === 'canceled' || purchaseState === 'cancelled' || purchaseState === '1';

  if (isPending || isCanceled || isAcknowledged === false) {
    return { isTestPurchase, purchaseType: isTestPurchase ? 'test' : 'trial' };
  }

  if (isTestPurchase) return { isTestPurchase: true, purchaseType: 'test' };
  if (isTrial) return { isTestPurchase: false, purchaseType: 'trial' };
  return { isTestPurchase: false, purchaseType: 'paid' };
}

async function ensureStoreReadyForRevalidation(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !window.CdvPurchase?.store) {
    return;
  }

  if (revalidationStoreReady) {
    return;
  }

  if (revalidationStoreReadyInFlight) {
    return revalidationStoreReadyInFlight;
  }

  revalidationStoreReadyInFlight = (async () => {
    const store = getStore();

    PRODUCT_META.forEach((item) => {
      store.register({
        id: item.productId,
        type: item.type,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      });
    });

    try {
      await store.initialize([CdvPurchase.Platform.GOOGLE_PLAY]);
    } catch {
      // Ignore re-initialize failures; store may already be initialized.
    }

    revalidationStoreReady = true;
  })().finally(() => {
    revalidationStoreReadyInFlight = null;
  });

  return revalidationStoreReadyInFlight;
}

/**
 * FIX: isTransactionStillValid now also considers the Play Store's own
 * isExpired/acknowledged flags — not just the date fields.
 */
function isTransactionStillValid(transaction: CdvPurchase.Transaction | CdvPurchase.VerifiedPurchase): boolean {
  const txAny = transaction as any;

  // If the store itself says it's expired, trust that immediately.
  if (txAny.isExpired === true) return false;

  // Check every known expiry date field.
  const expiryDate =
    toIsoDate(txAny.expiryDate) ||
    toIsoDate(txAny.expirationDate) ||
    toIsoDate(txAny.expiresDate) ||
    toIsoDate(txAny.expiryTime) ||
    toIsoDate(txAny.expiryTimeMillis) ||
    toIsoDate(txAny.expiryDateMillis) ||
    toIsoDate(txAny.expirationDateMillis) ||
    toIsoDate(txAny.expiryDateMs) ||
    toIsoDate(txAny.expiryDateInMillis);

  if (!expiryDate) {
    // No expiry date found.
    // For non-lifetime plans this is suspicious — could be an expired/cancelled sub
    // where Play Store omits the date. Treat as invalid to force re-verification.
    const productId = getTransactionProductId(transaction as CdvPurchase.Transaction) ?? txAny.id ?? '';
    const plan = getPlanIdFromProductId(productId);
    if (plan && plan !== 'lifetime') return false;
    return true; // lifetime with no expiry is fine
  }

  return new Date(expiryDate).getTime() > Date.now();
}

function buildSubscriptionRecordFromApprovedTransaction(transaction: CdvPurchase.Transaction): ProSubscriptionRecord | null {
  const productId = getTransactionProductId(transaction);
  if (!productId) return null;

  const plan = getPlanIdFromProductId(productId);
  if (!plan) return null;

  const purchasedAt = transaction.lastRenewalDate ?? transaction.purchaseDate ?? new Date();
  const transactionAny = transaction as any;

  // FIX: Search all known expiry field names on the transaction object.
  const explicitExpiryDate =
    toIsoDate(transactionAny.expiryDate) ||
    toIsoDate(transactionAny.expirationDate) ||
    toIsoDate(transactionAny.expiresDate) ||
    toIsoDate(transactionAny.expiryTime) ||
    toIsoDate(transactionAny.expiryTimeMillis) ||
    toIsoDate(transactionAny.expiryDateMillis) ||
    toIsoDate(transactionAny.expirationDateMillis) ||
    toIsoDate(transactionAny.expiryDateMs) ||
    toIsoDate(transactionAny.expiryDateInMillis) ||
    null;

  // FIX: Do NOT fall back to local date computation. If Play Store didn't provide
  // an expiry date, store null — normalizeProSubscription will mark it expired.
  const computedEndDate = explicitExpiryDate ?? (plan === 'lifetime' ? null : null);
  const isExpiredByDate = computedEndDate ? new Date(computedEndDate).getTime() <= Date.now() : false;
  const isExpired = isExpiredByDate || (!computedEndDate && plan !== 'lifetime');
  const purchaseToken = transaction.purchaseId ?? transaction.transactionId ?? `${productId}:${Date.now()}`;
  const purchaseMeta = inferPurchaseClassification(transactionAny, purchaseToken);

  return normalizeProSubscription({
    isPro: !isExpired,
    plan,
    startDate: purchasedAt instanceof Date ? purchasedAt.toISOString() : new Date(purchasedAt).toISOString(),
    endDate: computedEndDate,
    purchaseToken,
    productId,
    isExpired,
    restoredAt: null,
    isTestPurchase: purchaseMeta.isTestPurchase,
    purchaseType: purchaseMeta.purchaseType,
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

export async function silentRevalidateProSubscription(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !window.CdvPurchase?.store) {
    return;
  }

  if (silentRevalidationInFlight) {
    return silentRevalidationInFlight;
  }

  const user = getCurrentGoogleUser();
  if (!user) {
    return;
  }

  silentRevalidationInFlight = (async () => {
    await ensureStoreReadyForRevalidation();
    const store = getStore();

    try {
      await store.restorePurchases();
    } catch {
      // Ignore restore failures and continue with update.
    }

    await store.update();

    const bestVerified = pickBestVerifiedPurchase(store.verifiedPurchases);
    if (bestVerified) {
      const verifiedRecord = buildSubscriptionRecordFromVerifiedPurchase(bestVerified, null);
      if (verifiedRecord && verifiedRecord.isPro && !verifiedRecord.isExpired) {
        await saveProSubscriptionForCurrentUser(verifiedRecord);
        setProStatusCache(true, verifiedRecord.plan, verifiedRecord.endDate);
      } else {
        await deleteProSubscriptionForCurrentUser().catch(() => {});
        clearProStatusCache();
      }
      notifyProSubscriptionChanged();
      return;
    }

    const bestLocal = pickBestLocalTransaction(store.localTransactions);
    if (bestLocal) {
      const localRecord = buildSubscriptionRecordFromApprovedTransaction(bestLocal);
      if (localRecord && localRecord.isPro && !localRecord.isExpired) {
        await saveProSubscriptionForCurrentUser(localRecord);
        setProStatusCache(true, localRecord.plan, localRecord.endDate);
      } else {
        await deleteProSubscriptionForCurrentUser().catch(() => {});
        clearProStatusCache();
      }
      notifyProSubscriptionChanged();
      return;
    }

    await deleteProSubscriptionForCurrentUser().catch(() => {});
    clearProStatusCache();
    notifyProSubscriptionChanged();
  })().finally(() => {
    silentRevalidationInFlight = null;
  });

  return silentRevalidationInFlight;
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

      if (record.isPro && !record.isExpired) {
        setProStatusCache(true, record.plan, record.endDate);
      } else {
        clearProStatusCache();
      }

      setError(null);
      notifyProSubscriptionChanged();
      syncProducts();
    } finally {
      pendingPurchaseTokensRef.current.delete(record.purchaseToken);
    }
  }, [syncProducts]);

  /**
   * FIX: Handles an expired transaction that arrived from Play Store.
   * Clears Firestore and local cache so the user loses Pro access.
   */
  const handleExpiredTransaction = useCallback(async (finish: () => Promise<void>) => {
    try {
      await deleteProSubscriptionForCurrentUser().catch(() => {});
      clearProStatusCache();
      notifyProSubscriptionChanged();
      await finish();
    } catch (e) {
      console.error('handleExpiredTransaction failed:', e);
    }
  }, []);

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
          console.log('[Billing] approved fired, productId:', getTransactionProductId(transaction));
          try {
            // FIX: Always check validity first — even during store init restore.
            // An expired/cancelled subscription still fires approved on app launch.
            if (!isTransactionStillValid(transaction)) {
              console.log('[Billing] Transaction invalid/expired — clearing Pro');
              await handleExpiredTransaction(() => transaction.finish());
              return;
            }

            const existingRecord = await loadProSubscriptionForCurrentUser().catch(() => null);

            const transactionRecord = buildSubscriptionRecordFromApprovedTransaction(transaction);
            if (transactionRecord) {
              // FIX: During store init, only skip if the existing record is still
              // genuinely active AND the new transaction matches. Never skip if expired.
              if (isStoreInitRestoreRef.current && existingRecord?.isPro && !existingRecord.isExpired) {
                const existingEndMs = existingRecord.endDate ? new Date(existingRecord.endDate).getTime() : null;
                const stillActive = existingEndMs === null
                  ? existingRecord.plan === 'lifetime'
                  : existingEndMs > Date.now();

                if (stillActive) {
                  await transaction.finish();
                  return;
                }
              }

              console.log('[Billing] Persisting approved transaction record');
              await persistProRecordAndFinish(transactionRecord, () => transaction.finish());
            } else {
              console.log('[Billing] approved: transaction did not map to a Pro record');
              await transaction.finish();
            }

            void transaction.verify().catch(() => {});
          } catch (purchaseError) {
            console.error('[Billing] approved callback failed:', purchaseError);
            setError(formatPurchaseError(purchaseError));
          }
        })();
      }, 'splitmate_pro_approved')
      .verified((receipt) => {
        void (async () => {
          console.log('[Billing] verified fired');
          try {
            const bestPurchase = pickBestVerifiedPurchase(receipt.collection);
            if (!bestPurchase) {
              console.log('[Billing] verified: no best purchase in receipt collection');
              setError('No verified purchase was found.');
              return;
            }

            // FIX: Check expiry from the verified purchase before persisting.
            if (!isTransactionStillValid(bestPurchase as unknown as CdvPurchase.Transaction)) {
              console.log('[Billing] Verified purchase expired — clearing Pro');
              await handleExpiredTransaction(() => receipt.finish());
              return;
            }

            const existingRecord = await loadProSubscriptionForCurrentUser().catch(() => null);

            const record = buildSubscriptionRecordFromVerifiedPurchase(bestPurchase, null);
            if (!record) {
              console.log('[Billing] verified: purchase did not map to a Pro record');
              setError('Purchase did not match a Pro plan.');
              return;
            }

            // FIX: Same init-restore guard, but also re-check expiry on existing record.
            if (isStoreInitRestoreRef.current && existingRecord?.isPro && !existingRecord.isExpired) {
              const existingEndMs = existingRecord.endDate ? new Date(existingRecord.endDate).getTime() : null;
              const stillActive = existingEndMs === null
                ? existingRecord.plan === 'lifetime'
                : existingEndMs > Date.now();

              if (stillActive) {
                await receipt.finish();
                return;
              }
            }

            console.log('[Billing] Persisting verified record');
            await persistProRecordAndFinish(record, () => receipt.finish());
          } catch (purchaseError) {
            console.error('[Billing] verified callback failed:', purchaseError);
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
            // FIX: Even fallback unverified records must be checked for expiry.
            if (!fallbackRecord.isPro || fallbackRecord.isExpired) {
              await handleExpiredTransaction(() => responseData.receipt.finish());
              return;
            }

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
  }, [syncProducts, persistProRecordAndFinish, handleExpiredTransaction]);

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

    // FIX: A restored record that is expired should clear Pro, not restore it.
    const restored = Boolean(restoredRecord) && (restoredRecord?.isPro ?? false) && !(restoredRecord?.isExpired ?? true);

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