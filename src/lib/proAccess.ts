import { toast } from 'sonner';

export const PRO_STATUS_CACHE_KEY = 'splitmate_pro_status_cache';
export const PRO_STATUS_CACHE_USERS_KEY = 'splitmate_pro_status_cache_users';
export const PRO_LIMIT_BLOCKED_EVENT = 'splitmate_pro_limit_blocked';
export const PRO_OVERRIDE_KEY = 'splitmate_pro_override';
export const LAST_AUTH_UID_KEY = 'splitmate_last_auth_uid';

export type ProLimitFeature =
  | 'persons'
  | 'groups'
  | 'transactions'
  | 'accounts'
  | 'links'
  | 'link-groups'
  | 'goals'
  | 'loans'
  | 'subscriptions'
  | 'recurring'
  | 'collaboration'
  | 'backup'
  | 'restore'
  | 'auto-backup'
  | 'customization';

export type ProStatusCache = {
  isPro: boolean;
  plan: 'lifetime' | null;
  endDate: null;
  uid: string | null;
  email: string | null;
  purchaseToken: string | null;
  updatedAt: number;
  lastVerifiedAt: number;
};

type ProOverride = 'force-pro' | 'force-free' | null;
type ProStatusCacheMap = Record<string, ProStatusCache>;

const EMPTY_CACHE: ProStatusCache = {
  isPro: false,
  plan: null,
  endDate: null,
  uid: null,
  email: null,
  purchaseToken: null,
  updatedAt: 0,
  lastVerifiedAt: 0,
};

let proStatusCache: ProStatusCache = { ...EMPTY_CACHE };
let proStatusCacheUsers: ProStatusCacheMap = {};
let proOverride: ProOverride = null;

function emptyCache(): ProStatusCache {
  return { ...EMPTY_CACHE };
}

function isValidLifetimeCache(value: unknown): value is ProStatusCache {
  if (!value || typeof value !== 'object') return false;

  const parsed = value as Partial<ProStatusCache>;

  return (
    parsed.isPro === true &&
    parsed.plan === 'lifetime' &&
    typeof parsed.uid === 'string' &&
    parsed.uid.length > 0
  );
}

function normalizeCache(value: unknown): ProStatusCache {
  if (!isValidLifetimeCache(value)) {
    return emptyCache();
  }

  const parsed = value as Partial<ProStatusCache>;

  return {
    isPro: true,
    plan: 'lifetime',
    endDate: null,
    uid: parsed.uid!,
    email: typeof parsed.email === 'string' ? parsed.email : null,
    purchaseToken:
      typeof parsed.purchaseToken === 'string'
        ? parsed.purchaseToken
        : null,
    updatedAt:
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : 0,
    lastVerifiedAt:
      typeof parsed.lastVerifiedAt === 'number' &&
      Number.isFinite(parsed.lastVerifiedAt)
        ? parsed.lastVerifiedAt
        : 0,
  };
}

export function getLastAuthUid(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LAST_AUTH_UID_KEY);
}

export function setLastAuthUid(uid: string | null): void {
  if (typeof window === 'undefined') return;

  if (uid) {
    window.localStorage.setItem(LAST_AUTH_UID_KEY, uid);
  } else {
    window.localStorage.removeItem(LAST_AUTH_UID_KEY);
  }
}

export function clearLastAuthUid(): void {
  setLastAuthUid(null);
}

function readLegacyCache(): ProStatusCache {
  if (typeof window === 'undefined') {
    return emptyCache();
  }

  try {
    const raw = window.localStorage.getItem(PRO_STATUS_CACHE_KEY);
    if (!raw) return emptyCache();

    return normalizeCache(JSON.parse(raw));
  } catch {
    return emptyCache();
  }
}

function readUserCaches(): ProStatusCacheMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PRO_STATUS_CACHE_USERS_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};

    const result: ProStatusCacheMap = {};

    for (const [uid, value] of Object.entries(parsed)) {
      const cache = normalizeCache(value);

      // The map key and the stored UID must agree.
      if (cache.isPro && cache.uid === uid) {
        result[uid] = cache;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function writeUserCachesToStorage(): void {
  if (typeof window === 'undefined') return;

  if (Object.keys(proStatusCacheUsers).length === 0) {
    window.localStorage.removeItem(PRO_STATUS_CACHE_USERS_KEY);
    return;
  }

  window.localStorage.setItem(
    PRO_STATUS_CACHE_USERS_KEY,
    JSON.stringify(proStatusCacheUsers),
  );
}

function writeLegacyCurrentCacheToStorage(cache: ProStatusCache): void {
  if (typeof window === 'undefined') return;

  /*
   * Keep the old key as a compatibility mirror for code that still reads it.
   * It is never used as the authoritative account-bound cache.
   */
  if (cache.isPro && cache.plan === 'lifetime' && cache.uid) {
    window.localStorage.setItem(
      PRO_STATUS_CACHE_KEY,
      JSON.stringify(cache),
    );
  } else {
    window.localStorage.removeItem(PRO_STATUS_CACHE_KEY);
  }
}

function removeLegacyCacheStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PRO_STATUS_CACHE_KEY);
}

function notifyProChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('splitmate_pro_changed'));
  }
}

/*
 * Load the new multi-user cache and migrate the old single-user cache once.
 */
proStatusCacheUsers = readUserCaches();

const legacyCache = readLegacyCache();

if (
  legacyCache.isPro &&
  legacyCache.uid &&
  !proStatusCacheUsers[legacyCache.uid]
) {
  proStatusCacheUsers[legacyCache.uid] = legacyCache;
  writeUserCachesToStorage();
}

removeLegacyCacheStorage();

const lastUidAtStartup = getLastAuthUid();
if (lastUidAtStartup) {
  proStatusCache =
    proStatusCacheUsers[lastUidAtStartup] ?? emptyCache();
} else {
  proStatusCache = { ...EMPTY_CACHE };
}

function readProOverrideFromStorage(): ProOverride {
  if (typeof window === 'undefined') return null;

  const val = window.localStorage.getItem(PRO_OVERRIDE_KEY);

  if (val === 'force-pro') return 'force-pro';
  if (val === 'force-free') return 'force-free';
  if (val === 'on') return 'force-free';

  return null;
}

function writeProOverrideToStorage(override: ProOverride): void {
  if (typeof window === 'undefined') return;

  if (override === 'force-pro' || override === 'force-free') {
    window.localStorage.setItem(PRO_OVERRIDE_KEY, override);
  } else {
    window.localStorage.removeItem(PRO_OVERRIDE_KEY);
  }
}

proOverride = readProOverrideFromStorage();

export function isDevOverrideEmail(email?: string | null): boolean {
  if (!email) return false;

  const devEmailsStr = (import.meta.env.VITE_DEV_EMAILS as string) || '';
  const devEmails = devEmailsStr
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const hardcodedEmails = [
    'try.sandeshk@gmail.com',
    'sandeshkullolli4@gmail.com',
  ];

  return (
    devEmails.includes(email.toLowerCase()) ||
    hardcodedEmails.includes(email.toLowerCase())
  );
}

export function setProStatusCacheForUser(
  uid: string | null,
  email: string | null,
  isPro: boolean,
  purchaseToken: string | null = null,
): void {
  if (!uid) return;

  if (!isPro) {
    clearProStatusCacheForUser(uid);
    return;
  }

  const now = Date.now();

  const cache: ProStatusCache = {
    isPro: true,
    plan: 'lifetime',
    endDate: null,
    uid,
    email,
    purchaseToken,
    updatedAt: now,
    lastVerifiedAt: now,
  };

  proStatusCacheUsers[uid] = cache;

  if (getLastAuthUid() === uid) {
    proStatusCache = { ...cache };
  }

  /*
   * Auth state owns LAST_AUTH_UID_KEY. The Pro cache must never change the
   * authenticated identity itself, otherwise a delayed purchase callback could
   * accidentally make another UID the "current" account.
   */
  writeUserCachesToStorage();

  /*
   * Do not maintain a second authoritative global cache.
   */
  removeLegacyCacheStorage();

  notifyProChanged();
}

export function getProStatusCacheForUser(
  uid: string | null,
): ProStatusCache {
  if (!uid) return emptyCache();

  const cache = proStatusCacheUsers[uid];

  if (!cache || !isValidLifetimeCache(cache) || cache.uid !== uid) {
    return emptyCache();
  }

  return { ...cache };
}

export function clearProStatusCacheForUser(uid: string | null): void {
  if (!uid) return;

  delete proStatusCacheUsers[uid];
  writeUserCachesToStorage();

  if (proStatusCache.uid === uid) {
    proStatusCache = emptyCache();
  }

  notifyProChanged();
}

/*
 * Compatibility API.
 *
 * It now clears ONLY the cache belonging to the current/last authenticated
 * UID instead of deleting another account's cached Pro entitlement.
 */
export function clearProStatusCache(): void {
  const uid = getLastAuthUid();

  if (uid) {
    clearProStatusCacheForUser(uid);
  } else {
    proStatusCache = emptyCache();
    removeLegacyCacheStorage();
    notifyProChanged();
  }
}

export function setProStatusCache(
  isPro: boolean,
  plan?: string | null,
  endDate?: string | null,
): void {
  /*
   * New code should use setProStatusCacheForUser().
   * This compatibility function can only safely operate when an authenticated
   * UID is known.
   */
  const uid = getLastAuthUid();

  if (!uid || !isPro || plan !== 'lifetime') {
    if (uid) {
      clearProStatusCacheForUser(uid);
    }
    return;
  }

  const existing = getProStatusCacheForUser(uid);

  setProStatusCacheForUser(
    uid,
    existing.email,
    true,
    existing.purchaseToken,
  );
}

export function getProStatusCache(): ProStatusCache {
  const uid = getLastAuthUid();

  if (uid) {
    return getProStatusCacheForUser(uid);
  }

  return emptyCache();
}

export function isProUserCached(): boolean {
  if (getProOverride() === 'force-free') return false;

  const uid = getLastAuthUid();

  if (!uid) return false;

  return getProStatusCacheForUser(uid).isPro;
}

export function getProOverride(): ProOverride {
  return proOverride;
}

export function setProOverride(override: ProOverride): void {
  proOverride = override;
  writeProOverrideToStorage(override);
  notifyProChanged();
}

/*
 * Explicitly clear every account's local Pro cache.
 * Use this only for a deliberate full reset/test reset, not normal logout or
 * account switching.
 */
export function clearAllProStatusCaches(): void {
  proStatusCacheUsers = {};
  proStatusCache = emptyCache();

  writeUserCachesToStorage();
  removeLegacyCacheStorage();

  notifyProChanged();
}

export function resetProStatusCache(): void {
  clearAllProStatusCaches();

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(PRO_OVERRIDE_KEY);
  }

  proOverride = null;
  writeProOverrideToStorage(null);
  clearLastAuthUid();

  notifyProChanged();
}

export function requestProUpgrade(
  feature: ProLimitFeature,
  description: string,
): void {
  toast('Pro feature limit reached', {
    description,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PRO_LIMIT_BLOCKED_EVENT, {
        detail: { feature, description },
      }),
    );
  }
}
