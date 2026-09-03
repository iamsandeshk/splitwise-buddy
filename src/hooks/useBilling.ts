import 'cordova-plugin-purchase';

import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSubscriptionRecordFromVerifiedPurchase,
  getPlanIdFromProductId,
  getProductIdForPlan,
  normalizeProSubscription,
  pickBestVerifiedPurchase,
  isProSubscriptionActive,
  type ProSubscriptionRecord,
  type BillingProductState,
  type ProPlanId,
  type GooglePlayPurchaseContext,
} from '@/lib/proSubscription';
import {
  toIsoDate,
  inferPurchaseClassification,
  extractGooglePlayOrderId,
  extractGooglePlayPurchaseToken,
} from '@/lib/billingUtils';
import {
  saveProSubscriptionForCurrentUser,
  expireProSubscriptionForCurrentUser,
  deleteProSubscriptionForCurrentUser,
  loadProSubscriptionForCurrentUser,
} from '@/integrations/firebase/proSubscription';
import { getCurrentGoogleUser } from '@/integrations/firebase/auth';
import {
  clearProStatusCache,
  setProStatusCache,
  setProStatusCacheForUser,
} from '@/lib/proAccess';

const PRODUCT_META: Array<{
  plan: ProPlanId;
  productId: string;
  name: string;
  type: CdvPurchase.ProductType;
}> = [
    {
      plan: 'lifetime',
      productId: 'pro_lifetime',
      name: 'SplitMate Pro - Lifetime',
      type: CdvPurchase.ProductType.NON_CONSUMABLE,
    },
  ];

type BillingProduct = BillingProductState;

const PRO_SUBSCRIPTION_REFRESH_EVENT = 'splitmate-pro-subscription-updated';

export type RevalidationResult = 'active' | 'revoked' | 'unavailable';

export async function removeTestProAccess(): Promise<void> {
  clearProStatusCache();
  await deleteProSubscriptionForCurrentUser();
  notifyProSubscriptionChanged(true);
}

let silentRevalidationInFlight: Promise<RevalidationResult> | null = null;
let revalidationStoreReadyInFlight: Promise<void> | null = null;

// Ensures the store callbacks + initialize run once per app session
let billingStoreInitialized = false;
let billingStoreInitInFlight: Promise<void> | null = null;

// In-memory optimization only. Durable recovery comes from inspecting
// Google Play/local verified transactions on startup, resume, and revalidation.
const pendingFinishReceiptIds = new Set<string>();

let delayedApprovalPollTimer: number | null = null;

function getStore() {
  const store = window.CdvPurchase?.store;

  if (!store) {
    throw new Error('In-app purchase store is not available yet.');
  }

  return store as typeof CdvPurchase.store;
}

/**
 * Get the real localized Google Play price.
 *
 * NEVER use a hardcoded price here.
 */
function getLocalizedPrice(product?: CdvPurchase.Product): string | null {
  if (!product) return null;

  const pricing = product.pricing;

  if (pricing?.price) {
    return pricing.price;
  }

  const offer = product.getOffer?.();
  const phase = offer?.pricingPhases?.[0];

  if (phase?.price) {
    return phase.price;
  }

  return null;
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

function notifyProSubscriptionChanged(playStoreVerified = false) {
  window.dispatchEvent(
    new CustomEvent(PRO_SUBSCRIPTION_REFRESH_EVENT, {
      detail: { playStoreVerified },
    }),
  );
}

function getTransactionProductId(
  transaction: CdvPurchase.Transaction,
) {
  return transaction.products?.[0]?.id ?? null;
}

function getNativePurchaseFromTransaction(
  transaction: CdvPurchase.Transaction | null | undefined,
): unknown {
  if (!transaction) return undefined;

  return (
    transaction as unknown as {
      nativePurchase?: unknown;
    }
  ).nativePurchase;
}

function getPurchaseContextFromTransaction(
  transaction: CdvPurchase.Transaction | null | undefined,
): GooglePlayPurchaseContext | null {
  if (!transaction) return null;

  const nativePurchase = getNativePurchaseFromTransaction(transaction);

  return {
    purchaseToken:
      transaction.purchaseId ??
      extractGooglePlayPurchaseToken(nativePurchase),
    orderId: extractGooglePlayOrderId(nativePurchase),
    nativePurchase,
  };
}

function getPurchaseContextFromReceipt(
  receipt: CdvPurchase.VerifiedReceipt,
  purchase: CdvPurchase.VerifiedPurchase,
): GooglePlayPurchaseContext | null {
  const sourceReceipt = receipt.sourceReceipt as unknown as {
    purchaseToken?: string;
    orderId?: string;
    transactions?: CdvPurchase.Transaction[];
  };

  const matchingTransaction = sourceReceipt.transactions?.find(
    (transaction) =>
      transaction.products?.some(
        (product) => product.id === purchase.id,
      ),
  );

  return {
    purchaseToken:
      sourceReceipt.purchaseToken ??
      matchingTransaction?.purchaseId ??
      extractGooglePlayPurchaseToken(
        getNativePurchaseFromTransaction(matchingTransaction),
      ),
    orderId:
      extractGooglePlayOrderId(sourceReceipt) ??
      extractGooglePlayOrderId(
        getNativePurchaseFromTransaction(matchingTransaction),
      ),
    nativePurchase:
      getNativePurchaseFromTransaction(matchingTransaction),
  };
}

function getPurchaseContextFromStore(
  store: typeof CdvPurchase.store,
  purchase: CdvPurchase.VerifiedPurchase,
): GooglePlayPurchaseContext | null {
  const matchingTransaction = store.localTransactions.find(
    (transaction) =>
      transaction.products?.some(
        (product) => product.id === purchase.id,
      ),
  );

  return getPurchaseContextFromTransaction(matchingTransaction);
}

function buildSubscriptionRecordFromTransaction(
  transaction: CdvPurchase.Transaction,
  restoredAt: string | null = null,
): ProSubscriptionRecord | null {
  const productId = getTransactionProductId(transaction);
  if (productId !== 'pro_lifetime') return null;

  const transactionData = transaction as unknown as Record<string, unknown>;
  const purchase = {
    ...transactionData,
    id: productId,
    purchaseDate: transactionData.purchaseDate ?? Date.now(),
    nativePurchase: getNativePurchaseFromTransaction(transaction),
  } as unknown as CdvPurchase.VerifiedPurchase;

  return buildSubscriptionRecordFromVerifiedPurchase(
    purchase,
    restoredAt,
    getPurchaseContextFromTransaction(transaction),
  );
}

async function grantApprovedTransaction(
  transaction: CdvPurchase.Transaction,
  restoredAt: string | null = null,
): Promise<boolean> {
  const record = buildSubscriptionRecordFromTransaction(transaction, restoredAt);
  if (!record || !isProSubscriptionActive(record)) return false;

  // A Google Play purchase must never be granted to an unknown Firebase account.
  // If Firebase Auth is still restoring, leave the transaction recoverable and
  // let the normal startup/resume revalidation process it again.
  const user = getCurrentGoogleUser();
  if (!user) {
    console.warn(
      '[Billing] Cannot grant approved purchase because Firebase user is not ready.',
    );
    return false;
  }

  // 1. Grant the account-bound local entitlement immediately.
  setProStatusCacheForUser(
    user.uid,
    user.email,
    true,
    record.purchaseToken,
  );
  notifyProSubscriptionChanged(true);

  // 2. Google Play acknowledgement FIRST.
  try {
    await transaction.finish();
  } catch (error) {
    console.error('[Billing] Google Play acknowledgement failed:', error);
    startDelayedApprovalPolling();
    return false;
  }

  // 3. Firestore synchronization SECOND.
  // Firestore failure must never revoke the already-granted local Pro.
  try {
    await saveProSubscriptionForCurrentUser(record);
  } catch (error) {
    console.error(
      '[Billing] Firestore sync failed after acknowledgement (non-fatal):',
      error,
    );
  }

  return true;
}

async function finishTransactionsForPurchaseToken(
  store: typeof CdvPurchase.store,
  purchaseToken: string,
): Promise<boolean> {
  const matchingTransactions = store.localTransactions.filter(
    (transaction) => transaction.purchaseId === purchaseToken,
  );

  if (matchingTransactions.length === 0) {
    return true;
  }

  const results = await Promise.all(
    matchingTransactions.map(async (transaction) => {
      try {
        await transaction.finish();
        return true;
      } catch (err) {
        const retryId =
          transaction.purchaseId ||
          transaction.transactionId ||
          '';

        if (retryId) {
          pendingFinishReceiptIds.add(retryId);
        }

        console.warn(
          '[Billing] Failed to finish matching transaction; will retry:',
          err,
        );
        return false;
      }
    }),
  );

  return results.every(Boolean);
}

function cacheVerifiedProForCurrentUser(
  record: ProSubscriptionRecord,
): boolean {
  const user = getCurrentGoogleUser();

  if (!user) {
    console.warn(
      '[Billing] Cannot cache verified Pro because Firebase user is not ready.',
    );
    return false;
  }

  setProStatusCacheForUser(
    user.uid,
    user.email,
    true,
    record.purchaseToken,
  );
  notifyProSubscriptionChanged(true);
  return true;
}

async function recoverUnfinishedVerifiedTransactions(
  store: typeof CdvPurchase.store,
): Promise<void> {
  const verifiedPurchase = getVerifiedLifetimePurchase(store);

  if (!verifiedPurchase || !Array.isArray(store.localTransactions)) {
    return;
  }

  const verifiedToken =
    extractGooglePlayPurchaseToken(verifiedPurchase);
  const verifiedOrderId =
    extractGooglePlayOrderId(verifiedPurchase);

  for (const transaction of store.localTransactions) {
    if (
      getTransactionProductId(transaction) !== 'pro_lifetime' ||
      transaction.state !== CdvPurchase.TransactionState.APPROVED
    ) {
      continue;
    }

    const matchesVerifiedPurchase =
      Boolean(
        verifiedToken &&
        transaction.purchaseId === verifiedToken,
      ) ||
      Boolean(
        verifiedOrderId &&
        transaction.transactionId === verifiedOrderId,
      );

    if (!matchesVerifiedPurchase) {
      continue;
    }

    try {
      await transaction.finish();
      console.log(
        '[Billing] Recovered and finished verified Lifetime transaction:',
        transaction.transactionId,
      );
    } catch (error) {
      console.warn(
        '[Billing] Could not finish verified Lifetime transaction; will retry later:',
        error,
      );
    }
  }
}

function startDelayedApprovalPolling() {
  if (
    !Capacitor.isNativePlatform() ||
    delayedApprovalPollTimer !== null
  ) {
    return;
  }

  const startedAt = Date.now();

  delayedApprovalPollTimer = window.setInterval(() => {
    void silentRevalidateProSubscription().then((result) => {
      if (
        result === 'active' ||
        Date.now() - startedAt > 10 * 60 * 1000
      ) {
        if (delayedApprovalPollTimer !== null) {
          window.clearInterval(delayedApprovalPollTimer);
          delayedApprovalPollTimer = null;
        }
      }
    });
  }, 20 * 1000);
}

export function getVerifiedLifetimePurchase(
  store: typeof CdvPurchase.store,
): CdvPurchase.VerifiedPurchase | null {
  if (!Array.isArray(store.verifiedPurchases)) {
    return null;
  }

  const purchases = store.verifiedPurchases.filter(
    (purchase) =>
      purchase.id === 'pro_lifetime' &&
      !purchase.isConsumed,
  );

  return pickBestVerifiedPurchase(purchases) ?? null;
}

/**
 * Wait for Google Play receipt validation to finish.
 *
 * A purchase can be owned by Google Play before the validator has
 * populated store.verifiedPurchases.
 */
async function waitForVerifiedLifetimePurchase(
  store: typeof CdvPurchase.store,
  timeoutMs = 10000,
): Promise<CdvPurchase.VerifiedPurchase | null> {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const purchase = getVerifiedLifetimePurchase(store);

    if (purchase) {
      console.log(
        '[Billing] Verified Lifetime Pro purchase found while waiting.',
      );

      return purchase;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    attempt++;

    if (
      attempt === 3 ||
      attempt === 8 ||
      attempt === 14
    ) {
      try {
        await store.update();
      } catch (updateErr) {
        console.warn(
          '[Billing] store.update during verification wait failed:',
          updateErr,
        );
      }
    }
  }

  return null;
}

/**
 * Explicitly ask the validator to re-check every local Lifetime Pro receipt.
 * This is important for non-consumables because an already-owned purchase may
 * not emit approved() again after app restart.
 */
async function verifyLocalLifetimeReceipts(
  store: typeof CdvPurchase.store,
): Promise<void> {
  const receipts = Array.isArray(store.localReceipts)
    ? store.localReceipts.filter((receipt) =>
      receipt.transactions?.some((transaction) =>
        getTransactionProductId(transaction) === 'pro_lifetime',
      ),
    )
    : [];

  if (receipts.length === 0) {
    return;
  }

  await Promise.all(
    receipts.map(async (receipt) => {
      try {
        await receipt.verify();
        console.log('[Billing] Explicit Lifetime receipt verification requested.');
      } catch (error) {
        console.warn('[Billing] Explicit Lifetime receipt verification failed:', error);
      }
    }),
  );
}

/**
 * Wait until the validator has had a chance to process the current local
 * receipts. A negative ownership result is only safe when the receipt set has
 * actually been validated. An empty verifiedPurchases array by itself is not
 * enough because validation can still be in flight.
 */
async function waitForVerifiedValidationCycle(
  store: typeof CdvPurchase.store,
  timeoutMs = 15000,
): Promise<{ complete: boolean; purchase: CdvPurchase.VerifiedPurchase | null }> {
  const startedAt = Date.now();

  await verifyLocalLifetimeReceipts(store);

  while (Date.now() - startedAt < timeoutMs) {
    const purchase = getVerifiedLifetimePurchase(store);
    if (purchase) {
      return { complete: true, purchase };
    }

    const localReceipts = Array.isArray(store.localReceipts)
      ? store.localReceipts
      : [];
    const verifiedReceipts = Array.isArray(store.verifiedReceipts)
      ? store.verifiedReceipts
      : [];

    // No local receipts means Google Play has no receipt to validate.
    if (localReceipts.length === 0) {
      return { complete: true, purchase: null };
    }

    // The plugin exposes verifiedReceipts after the validator has processed
    // local receipts. Once every local receipt has a verified counterpart, an
    // empty Lifetime purchase is a meaningful negative result.
    if (verifiedReceipts.length >= localReceipts.length) {
      return { complete: true, purchase: null };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { complete: false, purchase: getVerifiedLifetimePurchase(store) };
}


function configureStoreValidator(
  store: typeof CdvPurchase.store,
) {
  const validatorUrl = (
    import.meta.env.VITE_PRO_SUBSCRIPTION_VALIDATOR_URL as
    | string
    | undefined
  )?.trim();

  if (validatorUrl) {
    store.validator = validatorUrl;
  }
}

async function ensureStoreReadyForRevalidation(): Promise<void> {
  if (
    !Capacitor.isNativePlatform() ||
    !window.CdvPurchase?.store
  ) {
    return;
  }

  if (revalidationStoreReadyInFlight) {
    return revalidationStoreReadyInFlight;
  }

  const initPromise = (async () => {
    const store = getStore();

    configureStoreValidator(store);

    PRODUCT_META.forEach((item) => {
      store.register({
        id: item.productId,
        type: item.type,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      });
    });

    try {
      await store.initialize([
        CdvPurchase.Platform.GOOGLE_PLAY,
      ]);
    } catch {
      // Ignore re-initialize failures; store may already be initialized.
    }
  })();

  revalidationStoreReadyInFlight = initPromise;

  return initPromise;
}

/**
 * Revalidates Pro status against Google Play.
 *
 * Returns:
 *   'active'      — verified lifetime purchase found.
 *   'revoked'     — only returned when a verified validation cycle
 *                   explicitly confirms there is no Lifetime Pro.
 *   'unavailable' — verification/ownership state is not yet known.
 */
export async function silentRevalidateProSubscription(): Promise<RevalidationResult> {
  if (
    !Capacitor.isNativePlatform() ||
    !window.CdvPurchase?.store
  ) {
    return 'unavailable';
  }

  if (silentRevalidationInFlight) {
    return silentRevalidationInFlight;
  }

  silentRevalidationInFlight = (async (): Promise<RevalidationResult> => {
    try {
      await ensureStoreReadyForRevalidation();

      const store = getStore();

      // Recover any verified transaction that is still APPROVED. This is the
      // persistent recovery path; the in-memory pending Set is only an optimization.
      await recoverUnfinishedVerifiedTransactions(store);

      // Retry pending finish() calls from previous failed attempts.
      if (pendingFinishReceiptIds.size > 0) {
        for (const receipt of store.localReceipts) {
          const receiptId =
            (receipt as unknown as { id?: string }).id ?? '';

          if (receiptId && pendingFinishReceiptIds.has(receiptId)) {
            try {
              await receipt.finish();
              pendingFinishReceiptIds.delete(receiptId);
              console.log(
                '[Billing] Retried pending finish() successfully for receipt:',
                receiptId,
              );
            } catch (retryErr) {
              console.warn(
                '[Billing] Pending receipt finish retry failed again:',
                retryErr,
              );
            }
          }
        }

        for (const transaction of store.localTransactions) {
          if (
            getTransactionProductId(transaction) !== 'pro_lifetime' ||
            transaction.state !== CdvPurchase.TransactionState.APPROVED
          ) {
            continue;
          }

          const transactionId =
            transaction.purchaseId ||
            transaction.transactionId ||
            '';

          if (!transactionId || !pendingFinishReceiptIds.has(transactionId)) {
            continue;
          }

          try {
            await transaction.finish();
            pendingFinishReceiptIds.delete(transactionId);
            console.log(
              '[Billing] Retried pending transaction finish successfully:',
              transactionId,
            );
          } catch (retryErr) {
            console.warn(
              '[Billing] Pending transaction finish retry failed again:',
              retryErr,
            );
          }
        }
      }

      let storeUpdated = false;

      try {
        await store.update();
        storeUpdated = true;
      } catch (updateErr) {
        console.warn(
          '[Billing] store.update() failed in revalidation:',
          updateErr,
        );
      }

      if (!storeUpdated) {
        return 'unavailable';
      }

      if (!store.validator) {
        const product =
          store.get('pro_lifetime', CdvPurchase.Platform.GOOGLE_PLAY) ??
          store.get('pro_lifetime');

        const cloudRecord = await loadProSubscriptionForCurrentUser().catch(() => null);

        // A manual/admin grant is not a Google Play purchase and must not be revoked by Play checks
        const isManualGrant = cloudRecord?.purchaseType === 'manual_grant';
        if (cloudRecord?.isPro && !cloudRecord.isExpired && isManualGrant) {
          if (!cacheVerifiedProForCurrentUser(cloudRecord)) {
            return 'unavailable';
          }
          return 'active';
        }

        // 1. If Google Play explicitly reports product is NOT owned (refunded, revoked, or reset test purchase)
        if (product && product.owned === false) {
          console.warn('[Billing] Google Play explicitly confirmed product is NOT owned (refunded/reset). Revoking Pro.');
          if (cloudRecord?.isPro && !cloudRecord.isExpired) {
            await expireProSubscriptionForCurrentUser();
          }
          clearProStatusCache();
          notifyProSubscriptionChanged(true);
          return 'revoked';
        }

        // 2. If Google Play reports product IS owned:
        if (product?.owned) {
          const transaction = store.localTransactions.find(
            (item) => getTransactionProductId(item) === 'pro_lifetime' &&
              (item.state === CdvPurchase.TransactionState.APPROVED ||
                item.state === CdvPurchase.TransactionState.FINISHED),
          );

          if (transaction) {
            const granted = await grantApprovedTransaction(transaction);
            if (granted) return 'active';
          }

          if (cloudRecord && isProSubscriptionActive(cloudRecord)) {
            if (!cacheVerifiedProForCurrentUser(cloudRecord)) {
              return 'unavailable';
            }
            return 'active';
          }
        }

        return 'unavailable';
      }

      /*
       * IMPORTANT:
       *
       * store.update() can complete before receipt validation has
       * populated verifiedPurchases.
       *
       * Therefore we wait before deciding that there is no purchase.
       */
      const bestVerified =
        await waitForVerifiedLifetimePurchase(store, 5000);

      if (bestVerified) {
        console.log(
          '[Billing] Google Play confirmed active verified Lifetime Pro.',
        );

        const record =
          buildSubscriptionRecordFromVerifiedPurchase(
            bestVerified,
            null,
            getPurchaseContextFromStore(
              store,
              bestVerified,
            ),
          );

        if (!record) {
          return 'unavailable';
        }

        // 1. Grant Pro locally, strictly bound to the current Firebase account.
        if (!cacheVerifiedProForCurrentUser(record)) {
          return 'unavailable';
        }

        // 2. Acknowledge with Google Play FIRST
        const acknowledged =
          await finishTransactionsForPurchaseToken(
            store,
            record.purchaseToken,
          );

        if (!acknowledged) {
          startDelayedApprovalPolling();
        }

        // 3. Firestore sync SECOND (non-fatal)
        try {
          await saveProSubscriptionForCurrentUser(record);
        } catch (err) {
          console.warn(
            '[Billing] Failed to save verified purchase to Firestore (non-fatal):',
            err,
          );
        }

        return 'active';
      }

      /*
       * We reached a real validator cycle and still have no Lifetime Pro.
       * This is the point where a previously granted paid entitlement must be
       * revoked. If validation itself is incomplete, return unavailable and
       * leave the entitlement untouched.
       */
      const validation = await waitForVerifiedValidationCycle(store, 10000);

      if (!validation.complete) {
        console.log(
          '[Billing] Receipt validation is still in progress; entitlement state unchanged.',
        );
        return 'unavailable';
      }

      if (validation.purchase) {
        // A verified purchase appeared while waiting. Process it on the next
        // revalidation cycle rather than ever treating the temporary empty
        // state as a refund.
        return 'active';
      }

      const cloudRecord = await loadProSubscriptionForCurrentUser().catch(() => null);
      const isManualGrant = cloudRecord?.purchaseType === 'manual_grant';
      const isVeryRecentPurchase = Boolean(
        cloudRecord?.startDate &&
        Date.now() - new Date(cloudRecord.startDate).getTime() < 5 * 60 * 1000,
      );

      // A manual/admin grant is not a Google Play purchase and must not be
      // revoked by Play ownership checks. A very recent purchase gets a short
      // grace period for slow propagation/approval.
      if (
        cloudRecord?.isPro &&
        !cloudRecord.isExpired &&
        (isManualGrant || isVeryRecentPurchase)
      ) {
        if (!cacheVerifiedProForCurrentUser(cloudRecord)) {
          return 'unavailable';
        }
        return 'active';
      }

      console.warn(
        '[Billing] Validator completed with no active Lifetime Pro. Revoking paid entitlement.',
      );

      clearProStatusCache();
      await expireProSubscriptionForCurrentUser();
      notifyProSubscriptionChanged(true);
      return 'revoked';
    } catch (err) {
      console.warn(
        '[Billing] silentRevalidateProSubscription error:',
        err,
      );

      return 'unavailable';
    }
  })().finally(() => {
    silentRevalidationInFlight = null;
  });

  return silentRevalidationInFlight;
}

export function useBilling() {
  const [products, setProducts] = useState<BillingProduct[]>(
    () => createInitialProducts(),
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const syncProducts = useCallback(() => {
    if (
      !Capacitor.isNativePlatform() ||
      !window.CdvPurchase?.store
    ) {
      setProducts(
        createInitialProducts().map((item) => ({
          ...item,
          loading: false,
          localizedPrice: null,
        })),
      );

      return;
    }

    const store = getStore();

    const lifetimeProd =
      store.get(
        'pro_lifetime',
        CdvPurchase.Platform.GOOGLE_PLAY,
      ) ??
      store.get('pro_lifetime');

    console.log('[Billing] syncProducts - product:', {
      found: Boolean(lifetimeProd),
      owned: lifetimeProd?.owned,
      pricing: lifetimeProd?.pricing,
      offers: lifetimeProd?.offers?.map((o) => ({
        id: o.id,
        phases: o.pricingPhases?.map(
          (p) => p.price,
        ),
      })),
    });

    setProducts(
      PRODUCT_META.map((item) => {
        const product =
          store.get(
            item.productId,
            CdvPurchase.Platform.GOOGLE_PLAY,
          ) ??
          store.get(item.productId);

        const livePrice = getLocalizedPrice(product);

        return {
          plan: item.plan,
          productId: item.productId,
          name: item.name,
          localizedPrice: livePrice ?? null,
          loading: !livePrice,
          product,
        };
      }),
    );
  }, []);

  const syncProductsRef = useRef(syncProducts);

  useEffect(() => {
    syncProductsRef.current = syncProducts;
  }, [syncProducts]);

  const initBilling = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setLoading(false);

      setProducts(
        createInitialProducts().map((item) => ({
          ...item,
          loading: false,
          localizedPrice: null,
        })),
      );

      return;
    }

    // If store is not on window yet, wait for deviceready.
    if (!window.CdvPurchase?.store) {
      await new Promise<void>((resolve) => {
        const onDeviceReady = () => {
          document.removeEventListener(
            'deviceready',
            onDeviceReady,
          );

          resolve();
        };

        document.addEventListener(
          'deviceready',
          onDeviceReady,
        );

        setTimeout(resolve, 1000);
      });
    }

    if (!window.CdvPurchase?.store) {
      console.warn(
        '[Billing] CdvPurchase.store not available after deviceready check',
      );

      setLoading(false);

      return;
    }

    const store = getStore();

    store.minTimeBetweenUpdates = 0;
    store.verbosity = CdvPurchase.LogLevel.INFO;

    if (billingStoreInitialized) {
      syncProductsRef.current();

      setLoading(false);

      const allPriced = PRODUCT_META.every((item) => {
        const product =
          store.get(
            item.productId,
            CdvPurchase.Platform.GOOGLE_PLAY,
          ) ??
          store.get(item.productId);

        return Boolean(getLocalizedPrice(product));
      });

      if (!allPriced) {
        store
          .update()
          .catch((e) =>
            console.warn(
              '[Billing] store.update on remount failed:',
              e,
            ),
          );

        window.setTimeout(() => {
          setProducts((prev) =>
            prev.map((item) =>
              item.loading
                ? {
                  ...item,
                  loading: false,
                  localizedPrice:
                    item.localizedPrice ?? null,
                }
                : item,
            ),
          );
        }, 8000);
      }

      return;
    }

    if (billingStoreInitInFlight) {
      try {
        await billingStoreInitInFlight;
      } finally {
        syncProductsRef.current();
        setLoading(false);
      }

      return;
    }

    configureStoreValidator(store);

    /*
     * Purchase lifecycle.
     *
     * IMPORTANT:
     * The documented plugin flow is:
     *
     * approved -> verify -> verified -> finish
     *
     * We explicitly call transaction.verify().
     */
    store
      .when()
      .approved((transaction) => {
        void (async () => {
          const productId =
            getTransactionProductId(transaction);

          console.log(
            '[Billing] APPROVED — starting verification:',
            {
              productId,
              transactionId:
                transaction.transactionId,
              purchaseId:
                transaction.purchaseId,
              purchaseToken:
                (
                  transaction as unknown as {
                    purchaseToken?: string;
                  }
                ).purchaseToken,
              orderId:
                (
                  transaction as unknown as {
                    nativePurchase?: {
                      orderId?: string;
                    };
                  }
                ).nativePurchase?.orderId,
              isPending:
                (
                  transaction as unknown as {
                    isPending?: boolean;
                  }
                ).isPending,
              isAcknowledged:
                (
                  transaction as unknown as {
                    isAcknowledged?: boolean;
                  }
                ).isAcknowledged,
            },
          );

          /*
           * Unknown products should never be left unfinished.
           */
          if (productId !== 'pro_lifetime') {
            await transaction
              .finish()
              .catch((err) => {
                console.error(
                  '[Billing] Failed to finish unknown product:',
                  err,
                );
              });

            return;
          }

          // Without a server validator, an approved Play transaction is the
          // ownership signal available to the app. Keep it recoverable by
          // syncing the entitlement before acknowledging it.
          if (!store.validator) {
            await grantApprovedTransaction(transaction);
            return;
          }

          /*
           * Explicitly trigger receipt validation.
           *
           * verified() will run after successful validation.
           */
          try {
            await transaction.verify();

            console.log(
              '[Billing] Transaction verification request completed.',
            );
          } catch (verifyErr) {
            console.error(
              '[Billing] Transaction verification failed:',
              verifyErr,
            );
          }
        })();
      }, 'splitmate_pro_approved')
      .verified((receipt) => {
        void (async () => {
          console.log(
            '[Billing] VERIFIED callback fired',
          );

          try {
            const bestPurchase =
              pickBestVerifiedPurchase(
                receipt.collection,
              );

            if (!bestPurchase) {
              console.error(
                '[Billing] VERIFIED but no valid pro_lifetime purchase found in collection',
              );

              return;
            }

            const record =
              buildSubscriptionRecordFromVerifiedPurchase(
                bestPurchase,
                null,
                getPurchaseContextFromReceipt(
                  receipt,
                  bestPurchase,
                ),
              );

            if (!record) {
              console.error(
                '[Billing] Could not build verified subscription record',
              );

              return;
            }

            console.log(
              '[Billing] VERIFIED purchase:',
              {
                productId: record.productId,
                purchaseToken:
                  record.purchaseToken,
                orderId: record.orderId,
              },
            );

            /*
             * Acknowledge the verified purchase with Google Play
             * before granting Pro.
             */
            const receiptId =
              (receipt as unknown as { id?: string })
                .id ?? '';

            /*
             * 1. Grant Pro locally immediately, strictly bound to the
             * authenticated Firebase account.
             */
            if (!cacheVerifiedProForCurrentUser(record)) {
              startDelayedApprovalPolling();
              return;
            }

            /*
             * 2. ACKNOWLEDGE Google Play immediately.
             */
            try {
              await receipt.finish();
              pendingFinishReceiptIds.delete(receiptId);
              console.log('[Billing] Successfully finished verified receipt with Google Play.');
            } catch (finishErr) {
              console.error(
                '[Billing] finish() FAILED — will retry on next revalidation cycle:',
                finishErr,
              );
              if (receiptId) pendingFinishReceiptIds.add(receiptId);
            }

            /*
             * 3. Firestore synchronization SECOND.
             * If Firebase fails or times out, Google has already acknowledged the purchase.
             * We do NOT revoke local Pro.
             */
            try {
              await saveProSubscriptionForCurrentUser(
                record,
              );
            } catch (dbErr) {
              console.error(
                '[Billing] Firebase purchase write failed after acknowledgement (non-fatal):',
                dbErr,
              );
            }

            syncProductsRef.current();
          } catch (error) {
            console.error(
              '[Billing] VERIFIED processing failed:',
              error,
            );
          }
        })();
      }, 'splitmate_pro_verified')
      .unverified((receipt) => {
        console.warn(
          '[Billing] Purchase was unverified by server. Not acknowledging.',
          receipt,
        );

        /*
         * Keep background checking active for delayed
         * verification scenarios.
         */
        startDelayedApprovalPolling();
      }, 'splitmate_pro_unverified');

    PRODUCT_META.forEach((item) => {
      store.register({
        id: item.productId,
        type: item.type,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      });
    });

    /*
     * Product metadata / price updates.
     */
    store.when().productUpdated(() => {
      console.log(
        '[Billing] productUpdated event fired',
      );

      syncProductsRef.current();
    });

    store.when().updated(() => {
      console.log(
        '[Billing] store updated event fired',
      );

      syncProductsRef.current();
    });

    /*
     * Local receipt updates.
     *
     * This is useful when Google Play reports an existing
     * non-consumable purchase.
     */
    store.when().receiptUpdated(() => {
      console.log(
        '[Billing] receiptUpdated event fired',
      );

      syncProductsRef.current();
    });

    billingStoreInitInFlight = (async () => {
      try {
        await store.initialize([
          CdvPurchase.Platform.GOOGLE_PLAY,
        ]);

        await store.update();

        // Explicitly validate existing local receipts on startup. This is what
        // makes an already-owned non-consumable recoverable after reinstall,
        // restart, slow approval, or a previously cleared local cache.
        await verifyLocalLifetimeReceipts(store);

        /*
         * Price metadata is event-driven.
         *
         * Do one immediate read here, then let productUpdated/updated callbacks
         * refresh the localized Google Play price as soon as Play provides it.
         * Do not block billing startup for several seconds waiting for pricing.
         */
        syncProductsRef.current();

        /*
         * Check an already verified Lifetime purchase on launch.
         *
         * Do NOT revoke anything here if verification is not
         * available yet.
         */
        const bestVerified =
          getVerifiedLifetimePurchase(store);

        if (bestVerified) {
          const record =
            buildSubscriptionRecordFromVerifiedPurchase(
              bestVerified,
              null,
              getPurchaseContextFromStore(
                store,
                bestVerified,
              ),
            );

          if (record) {
            // 1. Grant Pro locally immediately, bound to Firebase UID.
            if (!cacheVerifiedProForCurrentUser(record)) {
              console.warn(
                '[Billing] Firebase user is not ready; verified purchase will be recovered later.',
              );
            }

            // 2. Acknowledge with Google Play
            try {
              await finishTransactionsForPurchaseToken(
                store,
                record.purchaseToken,
              );
            } catch (finishErr) {
              console.warn('[Billing] Finish transaction on launch warning:', finishErr);
            }

            // 3. Sync to Firestore (non-fatal)
            try {
              await saveProSubscriptionForCurrentUser(record);
            } catch (err) {
              console.error(
                '[Billing] Failed to save verified purchase at launch (non-fatal):',
                err,
              );
            }
          }
        }

        // Recover verified transactions that are still waiting for finish().
        await recoverUnfinishedVerifiedTransactions(store);

        // Startup transaction recovery adhering to lifecycle:
        // APPROVED -> verify()
        // Never acknowledge an unverified purchase!
        const verifiedPurchase = getVerifiedLifetimePurchase(store);
        const verifiedPurchaseToken = verifiedPurchase ? extractGooglePlayPurchaseToken(verifiedPurchase) : null;
        const verifiedOrderId = verifiedPurchase ? extractGooglePlayOrderId(verifiedPurchase) : null;

        if (Array.isArray(store.localTransactions)) {
          for (const transaction of store.localTransactions) {
            if (getTransactionProductId(transaction) === 'pro_lifetime') {
              const isAlreadyVerified = Boolean(
                verifiedPurchase &&
                ((verifiedPurchaseToken && transaction.purchaseId === verifiedPurchaseToken) ||
                  (verifiedOrderId && transaction.transactionId === verifiedOrderId)),
              );

              if (isAlreadyVerified && transaction.state === CdvPurchase.TransactionState.APPROVED) {
                // Already verified by Google Play -> safe to acknowledge/finish
                try {
                  await transaction.finish();
                  console.log('[Billing] Finished verified local transaction on startup:', transaction.transactionId);
                } catch (finishErr) {
                  console.warn('[Billing] Failed to finish verified transaction on startup:', finishErr);
                }
              } else if (transaction.state === CdvPurchase.TransactionState.APPROVED) {
                // APPROVED but not yet verified -> MUST verify first! NEVER finish unverified!
                try {
                  console.log('[Billing] APPROVED local transaction found on startup; triggering verification:', transaction.transactionId);
                  await transaction.verify();
                } catch (verifyErr) {
                  console.warn('[Billing] Failed to verify APPROVED transaction on startup:', verifyErr);
                }
              }
            }
          }
        }
      } catch (initErr) {
        console.error(
          '[Billing] Store initialize failed:',
          initErr,
        );
      } finally {
        billingStoreInitialized = true;
      }
    })();

    try {
      await billingStoreInitInFlight;

      syncProductsRef.current();
    } finally {
      billingStoreInitInFlight = null;

      setLoading(false);

      /*
       * Safety net only.
       *
       * This does NOT invent a price.
       */
      window.setTimeout(() => {
        setProducts((prev) =>
          prev.map((item) =>
            item.loading
              ? {
                ...item,
                loading: false,
                localizedPrice:
                  item.localizedPrice ?? null,
              }
              : item,
          ),
        );
      }, 8000);
    }
  }, []);

  useEffect(() => {
    void initBilling();
  }, [initBilling]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    let mounted = true;
    let resumeListener: { remove: () => Promise<void> } | null = null;
    let appStateListener: { remove: () => Promise<void> } | null = null;

    const revalidate = () => {
      if (mounted) {
        void silentRevalidateProSubscription();
      }
    };

    void import('@capacitor/app').then(({ App }) =>
      App.addListener('resume', revalidate),
    ).then((listener) => {
      resumeListener = listener;
    }).catch(() => { });

    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) revalidate();
      }),
    ).then((listener) => {
      appStateListener = listener;
    }).catch(() => { });

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') revalidate();
    };

    document.addEventListener('visibilitychange', visibilityHandler);

    const intervalId = window.setInterval(revalidate, 15 * 60 * 1000);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.clearInterval(intervalId);
      if (resumeListener) void resumeListener.remove();
      if (appStateListener) void appStateListener.remove();
    };
  }, []);

  const purchaseLifetime = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Purchases are available on Android devices only.',
      );
    }

    const user = getCurrentGoogleUser();

    if (!user) {
      throw new Error(
        'Please sign in with your Google account before upgrading to SplitMate Pro.',
      );
    }

    const store = getStore();

    const productId =
      getProductIdForPlan('lifetime');

    const product =
      store.get(
        productId,
        CdvPurchase.Platform.GOOGLE_PLAY,
      ) ??
      store.get(productId);

    const offer = product?.getOffer();

    if (!product || !offer) {
      throw new Error(
        'Lifetime Pro is not available yet. Please check your network and retry.',
      );
    }

    const orderError = await offer.order();

    if (orderError) {
      const errCode =
        (orderError as { code?: number })
          ?.code;

      const errMsg = String(
        (
          orderError as {
            message?: string;
          }
        )?.message || '',
      ).toLowerCase();

      if (
        errCode ===
        CdvPurchase.ErrorCode.PAYMENT_CANCELLED
      ) {
        return;
      }

      /*
       * Google Play says the user already owns
       * this non-consumable.
       *
       * Do NOT attempt another purchase.
       * Restore and wait for receipt validation.
       */
      if (
        errCode === 7 ||
        errMsg.includes('already own') ||
        errMsg.includes(
          'item_already_owned',
        ) ||
        errMsg.includes('already_owned') ||
        errMsg.includes('owned')
      ) {
        console.log(
          '[Billing] Google Play reports item is already owned. Restoring and waiting for verification flow.',
        );

        try {
          await store.restorePurchases();
        } catch (restoreErr) {
          console.warn(
            '[Billing] restorePurchases in already-owned:',
            restoreErr,
          );
        }

        try {
          await store.update();
        } catch (updateErr) {
          console.warn(
            '[Billing] store.update in already-owned:',
            updateErr,
          );
        }

        const bestVerified =
          await waitForVerifiedLifetimePurchase(
            store,
            10000,
          );

        if (bestVerified) {
          console.log(
            '[Billing] Already-owned purchase verified successfully.',
          );

          const record =
            buildSubscriptionRecordFromVerifiedPurchase(
              bestVerified,
              new Date().toISOString(),
              getPurchaseContextFromStore(
                store,
                bestVerified,
              ),
            );

          if (
            record &&
            isProSubscriptionActive(record)
          ) {
            try {
              const acknowledged =
                await finishTransactionsForPurchaseToken(
                  store,
                  record.purchaseToken,
                );

              if (!acknowledged) {
                startDelayedApprovalPolling();
                return;
              }

              const restoredForUser =
                cacheVerifiedProForCurrentUser(record);

              if (!restoredForUser) {
                console.warn(
                  '[Billing] Firebase user is not ready; already-owned purchase will be recovered later.',
                );
                startDelayedApprovalPolling();
                return;
              }

              // Firestore is intentionally written only after Google Play acknowledgement.
              try {
                await saveProSubscriptionForCurrentUser(record);
              } catch (firebaseErr) {
                console.warn(
                  '[Billing] Failed to save already-owned purchase to Firestore (non-fatal):',
                  firebaseErr,
                );
              }

              console.log(
                '[Billing] Already-owned Lifetime Pro restored successfully.',
              );
            } catch (restoreErr) {
              console.error(
                '[Billing] Failed to process already-owned Lifetime Pro:',
                restoreErr,
              );

              startDelayedApprovalPolling();
            }
          }
        } else if (!store.validator) {
          const product =
            store.get('pro_lifetime', CdvPurchase.Platform.GOOGLE_PLAY) ??
            store.get('pro_lifetime');

          if (product?.owned) {
            const transaction = store.localTransactions.find(
              (item) => getTransactionProductId(item) === 'pro_lifetime' &&
                (item.state === CdvPurchase.TransactionState.APPROVED ||
                  item.state === CdvPurchase.TransactionState.FINISHED),
            );

            if (transaction) {
              await grantApprovedTransaction(
                transaction,
                new Date().toISOString(),
              );
            }
          }
        } else {
          console.warn(
            '[Billing] Already-owned purchase not verified within 10 seconds. Starting background verification.',
          );

          startDelayedApprovalPolling();
        }

        return;
      }

      throw new Error(
        (
          orderError as {
            message?: string;
          } | null
        )?.message ||
        'Purchase failed.',
      );
    }

    /*
     * Order was successfully initiated.
     *
     * The approved -> verify -> verified flow handles
     * entitlement granting.
     */
    try {
      await store.update();

      startDelayedApprovalPolling();
    } catch (e) {
      console.warn(
        '[Billing] store.update after order:',
        e,
      );
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    /*
     * Web / browser:
     * There is no Google Play purchase to restore.
     */
    if (!Capacitor.isNativePlatform()) {
      clearProStatusCache();
      notifyProSubscriptionChanged(true);

      return false;
    }

    try {
      const store = getStore();

      console.log(
        '[Billing] Starting restore...',
      );

      /*
       * Ask Google Play for the user's purchases.
       */
      try {
        await store.restorePurchases();

        console.log(
          '[Billing] Google Play restore request completed.',
        );
      } catch (restoreErr) {
        console.warn(
          '[Billing] restorePurchases() warning:',
          restoreErr,
        );
      }

      /*
       * Refresh Google Play product and ownership data.
       */
      try {
        await store.update();
      } catch (updateErr) {
        console.warn(
          '[Billing] store.update() warning:',
          updateErr,
        );
      }

      syncProductsRef.current();
      await verifyLocalLifetimeReceipts(store);

      /*
       * IMPORTANT:
       *
       * restorePurchases() can return before receipt
       * validation has completed.
       *
       * Wait for the verified purchase instead of
       * immediately returning "no purchase".
       */
      const bestVerified =
        await waitForVerifiedLifetimePurchase(
          store,
          10000,
        );

      if (bestVerified) {
        console.log(
          '[Billing] Restored verified Lifetime Pro purchase',
        );

        const record =
          buildSubscriptionRecordFromVerifiedPurchase(
            bestVerified,
            new Date().toISOString(),
            getPurchaseContextFromStore(
              store,
              bestVerified,
            ),
          );

        if (!record) {
          console.error(
            '[Billing] Could not build restored Pro subscription record',
          );

          return false;
        }

        /*
         * 1. Grant Pro locally immediately.
         */
        if (!cacheVerifiedProForCurrentUser(record)) {
          console.warn(
            '[Billing] Firebase user is not ready; restored purchase will be recovered later.',
          );
          startDelayedApprovalPolling();
          return false;
        }

        /*
         * 2. Acknowledge / finish the restored purchase with Google Play.
         */
        try {
          const acknowledged =
            await finishTransactionsForPurchaseToken(
              store,
              record.purchaseToken,
            );

          if (!acknowledged) {
            console.warn(
              '[Billing] Restore found purchase but acknowledgement is still pending.',
            );
            startDelayedApprovalPolling();
          }
        } catch (finishErr) {
          console.warn(
            '[Billing] Failed to finish restored transaction:',
            finishErr,
          );
          startDelayedApprovalPolling();
        }

        /*
         * 3. Save to Firestore (non-fatal, does not revoke or fail restore).
         */
        try {
          await saveProSubscriptionForCurrentUser(
            record,
          );
        } catch (firebaseErr) {
          console.warn(
            '[Billing] Failed to save restored purchase to Firestore (non-fatal):',
            firebaseErr,
          );
        }

        console.log(
          '[Billing] Lifetime Pro restored successfully',
        );

        return true;
      }

      const product =
        store.get('pro_lifetime', CdvPurchase.Platform.GOOGLE_PLAY) ??
        store.get('pro_lifetime');

      // If Google Play explicitly reports product is NOT owned (refunded, revoked, or reset):
      if (product && product.owned === false) {
        console.warn('[Billing] Restore: product is NOT owned in Google Play (refunded/reset). Revoking Pro.');
        await expireProSubscriptionForCurrentUser();
        clearProStatusCache();
        notifyProSubscriptionChanged(true);
        return false;
      }

      if (!store.validator) {
        // Only restore if Google Play explicitly confirms product is OWNED
        if (product?.owned) {
          const transaction = store.localTransactions.find(
            (item) => getTransactionProductId(item) === 'pro_lifetime' &&
              (item.state === CdvPurchase.TransactionState.APPROVED ||
                item.state === CdvPurchase.TransactionState.FINISHED),
          );

          if (transaction) {
            const restored = await grantApprovedTransaction(
              transaction,
              new Date().toISOString(),
            );
            if (restored) {
              syncProductsRef.current();
              return true;
            }
          }
        }

        console.log('[Billing] Restore without validator: No active Lifetime Pro purchase found.');
        return false;
      }

      /*
       * Do not claim that the user definitely has no
       * purchase. Google Play may still be processing
       * approval/validation.
       */
      console.warn(
        '[Billing] Restore timed out waiting for verified Lifetime Pro purchase.',
      );

      startDelayedApprovalPolling();

      return false;
    } catch (storeErr) {
      console.error(
        '[Billing] Google Play restore error on native:',
        storeErr,
      );

      startDelayedApprovalPolling();

      return false;
    }
  }, []);

  return useMemo(
    () => ({
      products,
      purchaseLifetime,
      purchaseMonthly: purchaseLifetime,
      purchaseYearly: purchaseLifetime,
      restorePurchases,
      loading,
      error,
    }),
    [
      error,
      loading,
      products,
      purchaseLifetime,
      restorePurchases,
    ],
  );
}