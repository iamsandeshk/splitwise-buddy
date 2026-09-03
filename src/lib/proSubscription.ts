import { ProPurchaseType, toIsoDate, inferPurchaseClassification, extractGooglePlayOrderId, extractGooglePlayPurchaseToken } from '@/lib/billingUtils';

export type ProPlanId = 'lifetime';

export type SubscriptionState =
  | 'active'
  | 'grace_period'
  | 'on_hold'
  | 'paused'
  | 'expired'
  | 'canceled'
  | 'unknown';

export interface ProSubscriptionRecord {
  isPro: boolean;
  plan: ProPlanId;
  startDate: string;
  endDate: string | null;
  /**
   * True when `endDate` came directly from Google Play / the server validator.
   * For Lifetime Pro, endDate is null (or 30min for license test purchases) and endDateConfirmed is true.
   */
  endDateConfirmed?: boolean;
  purchaseToken: string;
  orderId?: string | null;
  productId: string;
  isExpired: boolean;
  restoredAt: string | null;
  isTestPurchase: boolean;
  purchaseType: ProPurchaseType;
  expireAt?: string; // Used for Firestore TTL
  updatedAt?: string; // Track freshness to handle race conditions
  subscriptionState?: SubscriptionState;
  lastVerifiedAt?: string;
}

export interface BillingProductState {
  plan: ProPlanId;
  productId: string;
  name: string;
  localizedPrice: string | null;
  loading: boolean;
  product?: CdvPurchase.Product;
}

export interface GooglePlayPurchaseContext {
  purchaseToken?: string | null;
  orderId?: string | null;
  nativePurchase?: unknown;
}

export const PRO_PLAN_PRODUCTS: Record<ProPlanId, string> = {
  lifetime: 'pro_lifetime',
};

export const PRO_PLAN_LABELS: Record<ProPlanId, string> = {
  lifetime: 'Lifetime',
};

export const PRO_PLAN_DESCRIPTIONS: Record<ProPlanId, string> = {
  lifetime: 'One purchase, forever unlocked.',
};

export function getPlanIdFromProductId(productId: string): ProPlanId | null {
  if (productId === PRO_PLAN_PRODUCTS.lifetime) return 'lifetime';
  return null;
}

export function getProductIdForPlan(planId: ProPlanId): string {
  return PRO_PLAN_PRODUCTS[planId] || PRO_PLAN_PRODUCTS.lifetime;
}

export function getPlanLabel(planId?: string | null): string {
  if (planId === 'lifetime') return PRO_PLAN_LABELS.lifetime;
  return 'Lifetime';
}

export function getPlanDescription(planId?: string | null): string {
  if (planId === 'lifetime') return PRO_PLAN_DESCRIPTIONS.lifetime;
  return PRO_PLAN_DESCRIPTIONS.lifetime;
}

/**
 * Single source of truth for checking if a Pro record is active.
 * Only Lifetime Pro is supported.
 * For Play Store license test purchases, access expires strictly after 30 minutes.
 */
export function isProSubscriptionActive(record: ProSubscriptionRecord | null | undefined): boolean {
  if (!record) return false;
  if (record.plan !== 'lifetime') return false;
  if (record.productId !== PRO_PLAN_PRODUCTS.lifetime) return false;
  if (record.isPro !== true) return false;
  if (record.isExpired === true) return false;
  if (!record.purchaseToken) return false;

  return true;
}

export function normalizeProSubscription(record: Partial<ProSubscriptionRecord> | null | undefined): ProSubscriptionRecord | null {
  if (record?.plan !== 'lifetime' || !record.productId || !record.startDate || !record.purchaseToken) {
    return null;
  }

  const startDate = new Date(record.startDate);
  const normalizedStartDate = Number.isFinite(startDate.getTime()) ? startDate.toISOString() : new Date().toISOString();

  const isTest = Boolean(record.isTestPurchase || record.purchaseType === 'test');
  const endDate = record.endDate ?? null;
  const isExpired = Boolean(record.isExpired);

  const normalized: ProSubscriptionRecord = {
    isPro: record.isPro === true && !isExpired,
    plan: 'lifetime',
    startDate: normalizedStartDate,
    endDate,
    endDateConfirmed: Boolean(record.endDate),
    purchaseToken: record.purchaseToken,
    orderId: record.orderId ?? null,
    productId: PRO_PLAN_PRODUCTS.lifetime,
    isExpired,
    restoredAt: record.restoredAt ?? null,
    isTestPurchase: isTest,
    purchaseType: isTest ? 'test' : (record.purchaseType ?? 'paid'),
    expireAt: record.expireAt,
    updatedAt: record.updatedAt,
    subscriptionState: isExpired ? 'expired' : (record.subscriptionState ?? 'active'),
    lastVerifiedAt: record.lastVerifiedAt ?? new Date().toISOString(),
  };

  return normalized;
}

export function buildSubscriptionRecordFromVerifiedPurchase(
  purchase: CdvPurchase.VerifiedPurchase,
  restoredAt: string | null = null,
  context?: GooglePlayPurchaseContext | null,
): ProSubscriptionRecord | null {
  const plan = getPlanIdFromProductId(purchase.id);
  if (!plan || plan !== 'lifetime') return null;

  const purchaseAny = purchase as unknown as Record<string, unknown>;
  const startDate = toIsoDate(purchase.purchaseDate) || new Date().toISOString();

  const extractedToken = extractGooglePlayPurchaseToken(purchaseAny);
  const purchaseToken =
    context?.purchaseToken ??
    extractGooglePlayPurchaseToken(context?.nativePurchase) ??
    extractedToken ??
    (purchaseAny.purchaseToken as string | undefined) ??
    (purchaseAny.token as string | undefined) ??
    null;

  if (!purchaseToken) {
    console.error('[Billing] Verified purchase has no Google Play purchase token');
    return null;
  }

  const orderId =
    context?.orderId ??
    extractGooglePlayOrderId(context?.nativePurchase) ??
    extractGooglePlayOrderId(purchaseAny) ??
    null;
  const { isTestPurchase, purchaseType } = inferPurchaseClassification(
    { ...purchaseAny, nativePurchase: context?.nativePurchase },
    purchaseToken,
  );

  if (purchaseType !== 'paid' && purchaseType !== 'test') {
    console.error('[Billing] Unsupported purchase type. Rejecting entitlement:', purchaseType);
    return null;
  }

  const isExpired = Boolean(purchase.isExpired);

  return normalizeProSubscription({
    isPro: !isExpired,
    plan: 'lifetime',
    startDate,
    endDate: null,
    purchaseToken,
    orderId,
    productId: PRO_PLAN_PRODUCTS.lifetime,
    isExpired,
    restoredAt,
    isTestPurchase,
    purchaseType,
    subscriptionState: 'active',
    lastVerifiedAt: new Date().toISOString(),
  });
}

export function pickBestVerifiedPurchase(purchases: CdvPurchase.VerifiedPurchase[]) {
  return purchases
    .filter((purchase) => getPlanIdFromProductId(purchase.id) === 'lifetime')
    .sort((left, right) => (right.purchaseDate ?? 0) - (left.purchaseDate ?? 0))[0] ?? null;
}
