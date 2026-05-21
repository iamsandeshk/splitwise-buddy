export type ProPlanId = 'monthly' | 'yearly' | 'lifetime';
export type ProPurchaseType = 'trial' | 'test' | 'paid';

export interface ProSubscriptionRecord {
  isPro: boolean;
  plan: ProPlanId;
  startDate: string;
  endDate: string | null;
  purchaseToken: string;
  productId: string;
  isExpired: boolean;
  restoredAt: string | null;
  isTestPurchase: boolean;
  purchaseType: ProPurchaseType;
}

export interface BillingProductState {
  plan: ProPlanId;
  productId: string;
  name: string;
  localizedPrice: string | null;
  loading: boolean;
  product?: CdvPurchase.Product;
}

export const PRO_PLAN_PRODUCTS: Record<ProPlanId, string> = {
  monthly: 'pro_monthly',
  yearly: 'pro_yearly',
  lifetime: 'pro_lifetime',
};

export const PRO_PLAN_LABELS: Record<ProPlanId, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

export const PRO_PLAN_DESCRIPTIONS: Record<ProPlanId, string> = {
  monthly: 'A flexible month-to-month subscription.',
  yearly: 'Best value for long-term access.',
  lifetime: 'One purchase, forever unlocked.',
};

export const PRO_PLAN_DURATION_DAYS: Record<Exclude<ProPlanId, 'lifetime'>, number> = {
  monthly: 30,
  yearly: 365,
};

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
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

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + (days * 24 * 60 * 60 * 1000));
}

function inferPurchaseClassification(purchase: any, purchaseToken: string): { isTestPurchase: boolean; purchaseType: ProPurchaseType } {
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

export function getPlanIdFromProductId(productId: string): ProPlanId | null {
  if (productId === PRO_PLAN_PRODUCTS.monthly) return 'monthly';
  if (productId === PRO_PLAN_PRODUCTS.yearly) return 'yearly';
  if (productId === PRO_PLAN_PRODUCTS.lifetime) return 'lifetime';
  return null;
}

export function getProductIdForPlan(planId: ProPlanId): string {
  return PRO_PLAN_PRODUCTS[planId];
}

export function getPlanLabel(planId: ProPlanId): string {
  return PRO_PLAN_LABELS[planId];
}

export function getPlanDescription(planId: ProPlanId): string {
  return PRO_PLAN_DESCRIPTIONS[planId];
}

export function getPlanDurationDays(planId: ProPlanId): number | null {
  if (planId === 'lifetime') return null;
  return PRO_PLAN_DURATION_DAYS[planId];
}

export function getPlanEndDate(planId: ProPlanId, startDate: Date) {
  const durationDays = getPlanDurationDays(planId);
  return durationDays === null ? null : addDays(startDate, durationDays).toISOString();
}

export function isProSubscriptionActive(record: ProSubscriptionRecord | null | undefined, now = Date.now()): boolean {
  if (!record) return false;
  if (!record.isPro || record.isExpired) return false;
  const endDate = parseDate(record.endDate);

  // FIX: For non-lifetime plans, a null/missing endDate means we don't know
  // when it expires — treat as expired to force a fresh verify from Play Store.
  // Only lifetime plans are allowed to have a null endDate and still be active.
  if (endDate === null) {
    return record.plan === 'lifetime';
  }

  return endDate > now;
}

export function normalizeProSubscription(record: Partial<ProSubscriptionRecord> | null | undefined): ProSubscriptionRecord | null {
  if (!record?.plan || !record.productId || !record.startDate || !record.purchaseToken) return null;

  const startDate = new Date(record.startDate);
  const normalizedStartDate = Number.isFinite(startDate.getTime()) ? startDate.toISOString() : new Date().toISOString();
  const explicitEndDate = toIsoDate(record.endDate);

  // FIX: Do NOT fall back to computed duration for non-lifetime plans.
  // If the Play Store didn't give us an explicit expiry date, store null.
  // isProSubscriptionActive() will treat null endDate for non-lifetime as expired,
  // forcing the app to re-verify with the store on next launch.
  const endDate = explicitEndDate ?? (record.plan === 'lifetime' ? null : null);
  const purchaseMeta = inferPurchaseClassification(record, record.purchaseToken);

  const normalized: ProSubscriptionRecord = {
    isPro: record.isPro ?? true,
    plan: record.plan,
    startDate: normalizedStartDate,
    endDate,
    purchaseToken: record.purchaseToken,
    productId: record.productId,
    isExpired: record.isExpired ?? false,
    restoredAt: record.restoredAt ?? null,
    isTestPurchase: record.isTestPurchase ?? purchaseMeta.isTestPurchase,
    purchaseType: record.purchaseType ?? purchaseMeta.purchaseType,
  };

  if (normalized.endDate) {
    const endTime = parseDate(normalized.endDate);
    if (endTime !== null && endTime <= Date.now()) {
      normalized.isPro = false;
      normalized.isExpired = true;
    }
  } else if (normalized.plan !== 'lifetime') {
    // No endDate and not lifetime — cannot confirm active, mark expired.
    normalized.isPro = false;
    normalized.isExpired = true;
  }

  return normalized;
}

export function buildSubscriptionRecordFromVerifiedPurchase(purchase: CdvPurchase.VerifiedPurchase, restoredAt: string | null = null): ProSubscriptionRecord | null {
  const plan = getPlanIdFromProductId(purchase.id);
  if (!plan) return null;

  const purchaseAny = purchase as any;
  const startDate = toIsoDate(purchase.purchaseDate) || new Date().toISOString();

  // FIX: Exhaustively search ALL known field names where Play Store puts the expiry.
  // The verified purchase has more reliable data than the raw transaction.
  const explicitExpiryDate =
    toIsoDate(purchaseAny.expiryDate) ||
    toIsoDate(purchaseAny.expirationDate) ||
    toIsoDate(purchaseAny.expiresDate) ||
    toIsoDate(purchaseAny.expiryTime) ||
    toIsoDate(purchaseAny.expiryTimeMillis) ||
    toIsoDate(purchaseAny.expiryDateMillis) ||
    toIsoDate(purchaseAny.expirationDateMillis) ||
    toIsoDate(purchaseAny.expiryDateMs) ||
    toIsoDate(purchaseAny.expiryDateInMillis) ||
    // Also check nested receipt/latestReceiptInfo structures
    toIsoDate(purchaseAny.latestReceiptInfo?.expiresDateMs) ||
    toIsoDate(purchaseAny.receipt?.expiryDate) ||
    null;

  // FIX: For non-lifetime, if no explicit expiry came from Play Store, store null.
  // Do NOT compute a local fallback — that's what caused the trial-expired-but-still-pro bug.
  const computedEndDate = explicitExpiryDate ?? (plan === 'lifetime' ? null : null);
  const isExpiredByDate = computedEndDate ? new Date(computedEndDate).getTime() <= Date.now() : false;
  const purchaseToken = purchase.purchaseId ?? purchase.transactionId ?? purchase.id;
  const purchaseMeta = inferPurchaseClassification(purchaseAny, purchaseToken);

  // If Play Store says isExpired but gave no date, still honor it.
  const isExpired = Boolean(purchase.isExpired) || isExpiredByDate || (!computedEndDate && plan !== 'lifetime');

  return normalizeProSubscription({
    isPro: !isExpired,
    plan,
    startDate,
    endDate: computedEndDate,
    purchaseToken,
    productId: purchase.id,
    isExpired,
    restoredAt,
    isTestPurchase: purchaseMeta.isTestPurchase,
    purchaseType: purchaseMeta.purchaseType,
  });
}

export function pickBestVerifiedPurchase(purchases: CdvPurchase.VerifiedPurchase[]) {
  const priority: Record<ProPlanId, number> = { lifetime: 3, yearly: 2, monthly: 1 };
  return purchases
    .map((purchase) => ({ purchase, plan: getPlanIdFromProductId(purchase.id) }))
    .filter((entry): entry is { purchase: CdvPurchase.VerifiedPurchase; plan: ProPlanId } => Boolean(entry.plan))
    .sort((left, right) => {
      const planDiff = priority[right.plan] - priority[left.plan];
      if (planDiff !== 0) return planDiff;
      return (right.purchase.purchaseDate ?? 0) - (left.purchase.purchaseDate ?? 0);
    })[0]?.purchase ?? null;
}