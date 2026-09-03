export type ProPurchaseType = 'trial' | 'test' | 'paid' | 'manual_grant';

export function toIsoDate(value: unknown): string | null {
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

export function inferPurchaseClassification(purchase: Record<string, unknown> | null | undefined, purchaseToken: string): { isTestPurchase: boolean; purchaseType: 'trial' | 'test' | 'paid' } {
  const token = (purchaseToken || '').toLowerCase();
  const environment = String(purchase?.environment ?? (purchase?.receipt as Record<string, unknown>)?.environment ?? '').toLowerCase();
  const purchaseState = String(purchase?.purchaseState ?? purchase?.state ?? '').toLowerCase();
  const isAcknowledged = purchase?.isAcknowledged;

  const rawPurchaseType = purchase?.purchaseType ?? (purchase?.receipt as Record<string, unknown>)?.purchaseType;
  const isGooglePlayTestPurchaseType = rawPurchaseType === 0 || rawPurchaseType === '0' || rawPurchaseType === 'test';

  const isTestToken = token.startsWith('test-')
    || token.startsWith('android.test')
    || token.includes('test')
    || token.includes('sandbox')
    || token.includes('fake');

  const isSandbox = Boolean(purchase?.isSandbox)
    || environment.includes('sandbox')
    || environment.includes('test')
    || Boolean(purchase?.isTesting);

  const isTestPurchase = isTestToken || isSandbox || isGooglePlayTestPurchaseType;

  const isTrial = Boolean(
    purchase?.isTrialPeriod
    || purchase?.trialPeriod
    || purchase?.freeTrialPeriod
    || purchase?.introductoryPriceInfo
    || purchase?.offerType === 'trial'
    || purchase?.paymentState === 'free_trial'
    || (purchase?.receipt as Record<string, unknown>)?.isTrialPeriod,
  );

  const isPending = purchaseState === 'pending' || purchaseState === '2';
  const isCanceled = purchaseState === 'canceled' || purchaseState === 'cancelled' || purchaseState === '1';

  if (isCanceled) {
    return { isTestPurchase, purchaseType: isTestPurchase ? 'test' : 'paid' };
  }

  if (isTestPurchase) return { isTestPurchase: true, purchaseType: 'test' };
  if (isTrial) return { isTestPurchase: false, purchaseType: 'trial' };
  return { isTestPurchase: false, purchaseType: 'paid' };
}

export function extractGooglePlayOrderId(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const anyObj = obj as Record<string, unknown>;

  // Priority 1: Check direct GPA.* order ID properties
  const directCandidates: unknown[] = [
    anyObj.orderId,
    anyObj.order_id,
    (anyObj.receipt as Record<string, unknown> | undefined)?.orderId,
    (anyObj.nativePurchase as Record<string, unknown> | undefined)?.orderId,
    (anyObj.originalJson as Record<string, unknown> | undefined)?.orderId,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().startsWith('GPA.')) {
      return candidate.trim();
    }
  }

  // Priority 2: Check if receipt/nativePurchase is a JSON string containing orderId
  const rawReceipt = anyObj.receipt || anyObj.nativePurchase || anyObj.originalJson;
  if (typeof rawReceipt === 'string') {
    try {
      const parsed = JSON.parse(rawReceipt) as { orderId?: string };
      if (typeof parsed.orderId === 'string' && parsed.orderId.startsWith('GPA.')) {
        return parsed.orderId;
      }
    } catch {
      // regex fallback in raw string
      const match = rawReceipt.match(/GPA\.\d{4}-\d{4}-\d{4}-\d{5}/);
      if (match) return match[0];
    }
  }

  // STRICT: Only return real GPA.* order IDs.
  // Do NOT fall back to transactionId, purchaseId, or other identifiers —
  // those are not Google Play Order IDs and will produce garbage data in Firestore.
  return null;
}

export function extractGooglePlayPurchaseToken(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const anyObj = obj as Record<string, unknown>;

  const token =
    anyObj.purchaseToken ||
    anyObj.purchase_token ||
    anyObj.token ||
    (anyObj.receipt as Record<string, unknown> | undefined)?.purchaseToken ||
    (anyObj.nativePurchase as Record<string, unknown> | undefined)?.purchaseToken;

  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }

  return null;
}
