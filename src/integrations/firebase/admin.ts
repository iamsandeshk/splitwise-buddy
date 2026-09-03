import {
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  getFirestore,
  serverTimestamp,
  query,
} from 'firebase/firestore';
import { getFirebaseApp, getCurrentGoogleUser } from './auth';

const ADMIN_EMAILS = ['sandeshkullolli4@gmail.com', 'try.sandeshk@gmail.com'];

/**
 * Check if the given email matches the designated admin emails (used for showing UI entry points).
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Verify admin password dynamically against Firebase Firestore (`config/admin` or `admins/{email}`).
 * No passwords or emails are hardcoded in the client application code.
 */
export async function verifyAdminPasswordWithFirebase(password: string, email?: string | null): Promise<boolean> {
  const entered = (password || '').trim();
  if (!entered) return false;

  const db = getFirestore(getFirebaseApp());

  try {
    // 1. Check top-level config/admin document in Firestore
    const configSnap = await getDoc(doc(db, 'config', 'admin'));
    if (configSnap.exists()) {
      const data = configSnap.data();
      if (data?.password && String(data.password).trim() === entered) {
        return true;
      }
    }
  } catch (err) {
    console.warn('[Admin] config/admin check failed:', err);
  }

  // 2. If an email is provided or logged in, check user's admin document in admins/{email}
  const userEmail = (email || getCurrentGoogleUser()?.email || '').trim().toLowerCase();
  if (userEmail) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', userEmail));
      if (adminDoc.exists()) {
        const data = adminDoc.data();
        if (data.active !== false) {
          if (!data.password || String(data.password).trim() === entered) {
            return true;
          }
        }
      }
    } catch (err) {
      console.warn('[Admin] admins/{email} check failed:', err);
    }
  }

  return false;
}

/**
 * Check if the currently signed-in Google user exists in Firestore `admins` collection.
 */
export async function checkIsAdminInFirebase(email?: string | null): Promise<boolean> {
  const userEmail = (email || getCurrentGoogleUser()?.email || '').trim().toLowerCase();
  if (!userEmail) return false;

  try {
    const db = getFirestore(getFirebaseApp());
    const adminDoc = await getDoc(doc(db, 'admins', userEmail));
    return adminDoc.exists() && adminDoc.data()?.active !== false;
  } catch {
    return false;
  }
}

export interface ProUserEntry {
  uid: string;
  name: string;
  email: string;
  orderId: string;
  isPro: boolean;
  plan: string;
  purchaseToken: string;
  productId: string;
  isExpired: boolean;
  isTestPurchase: boolean;
  purchaseType: string;
  startDate: string | null;
  subscriptionState: string;
  lastVerifiedAt: string | null;
}

export interface BannedUserEntry {
  id: string;
  identifier: string;
  email: string;
  uid: string;
  reason: string;
  bannedAt: string | null;
  bannedBy: string;
}

/**
 * Reads all Pro subscription documents across all users from Firebase.
 * Queries `/pro_users`, `/pro_emails`, and collectionGroup('subscription').
 */
export async function fetchAllProUsers(): Promise<ProUserEntry[]> {
  const db = getFirestore(getFirebaseApp());
  const entriesMap = new Map<string, ProUserEntry>();

  const readTimestamp = (val: unknown): string | null => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof (val as { toDate?: () => Date })?.toDate === 'function') {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    return null;
  };

  // 1. Try querying the dedicated top-level `pro_users` collection
  try {
    const proUsersSnap = await getDocs(collection(db, 'pro_users'));
    for (const docSnap of proUsersSnap.docs) {
      const data = docSnap.data();
      const uid = docSnap.id || data.uid || data.email || '';
      entriesMap.set(uid, {
        uid,
        name: String(data.name || data.displayName || 'User'),
        email: String(data.email || data.gmailId || ''),
        orderId: String(data.orderId || ''),
        isPro: Boolean(data.isPro),
        plan: String(data.plan ?? 'lifetime'),
        purchaseToken: String(data.purchaseToken || data.orderId || ''),
        productId: String(data.productId ?? 'pro_lifetime'),
        isExpired: Boolean(data.isExpired),
        isTestPurchase: Boolean(data.isTestPurchase),
        purchaseType: String(data.purchaseType ?? 'paid'),
        startDate: readTimestamp(data.startDate),
        subscriptionState: String(data.subscriptionState ?? 'active'),
        lastVerifiedAt: readTimestamp(data.lastVerifiedAt),
      });
    }
  } catch (err) {
    console.warn('[Admin] pro_users collection fetch warning:', err);
  }

  // 2. Query `pro_emails` collection (manual grants by Gmail ID)
  try {
    const proEmailsSnap = await getDocs(collection(db, 'pro_emails'));
    for (const docSnap of proEmailsSnap.docs) {
      const data = docSnap.data();
      const emailKey = docSnap.id || data.email || '';
      if (!entriesMap.has(emailKey)) {
        entriesMap.set(emailKey, {
          uid: data.uid || emailKey,
          name: String(data.name || data.displayName || emailKey.split('@')[0] || 'User'),
          email: String(data.email || emailKey),
          orderId: String(data.orderId || 'MANUAL_GRANT'),
          isPro: Boolean(data.isPro),
          plan: String(data.plan ?? 'lifetime'),
          purchaseToken: String(data.purchaseToken || `manual_${emailKey}`),
          productId: String(data.productId ?? 'pro_lifetime'),
          isExpired: Boolean(data.isExpired),
          isTestPurchase: false,
          purchaseType: 'manual_grant',
          startDate: readTimestamp(data.startDate || data.grantedAt),
          subscriptionState: String(data.subscriptionState ?? 'active'),
          lastVerifiedAt: readTimestamp(data.lastVerifiedAt || data.grantedAt),
        });
      }
    }
  } catch (err) {
    console.warn('[Admin] pro_emails collection fetch warning:', err);
  }

  // 3. Also query collectionGroup('subscription') for any legacy subscription docs
  try {
    const subsQuery = query(collectionGroup(db, 'subscription'));
    const snapshot = await getDocs(subsQuery);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const pathSegments = docSnap.ref.path.split('/');
      const uid = pathSegments[1] ?? docSnap.id;

      if (!entriesMap.has(uid)) {
        entriesMap.set(uid, {
          uid,
          name: String(data.name || data.displayName || 'User'),
          email: String(data.email || data.gmailId || ''),
          orderId: String(data.orderId || ''),
          isPro: Boolean(data.isPro),
          plan: String(data.plan ?? 'lifetime'),
          purchaseToken: String(data.purchaseToken || data.orderId || ''),
          productId: String(data.productId ?? 'pro_lifetime'),
          isExpired: Boolean(data.isExpired),
          isTestPurchase: Boolean(data.isTestPurchase),
          purchaseType: String(data.purchaseType ?? 'paid'),
          startDate: readTimestamp(data.startDate),
          subscriptionState: String(data.subscriptionState ?? 'active'),
          lastVerifiedAt: readTimestamp(data.lastVerifiedAt),
        });
      }
    }
  } catch (err) {
    console.warn('[Admin] collectionGroup subscription fetch warning:', err);
  }

  return Array.from(entriesMap.values());
}

/**
 * Grants Pro access to a user directly by their Gmail ID.
 * Writes to `/pro_emails/{email}` and `/pro_users/{email}`.
 */
export async function grantProByEmail(email: string, name?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  const adminUser = getCurrentGoogleUser();
  const adminEmail = adminUser?.email || 'admin';
  const displayName = (name || '').trim() || cleanEmail.split('@')[0] || 'User';

  const db = getFirestore(getFirebaseApp());
  const grantData = {
    email: cleanEmail,
    name: displayName,
    displayName: displayName,
    isPro: true,
    plan: 'lifetime',
    orderId: `ADMIN_GRANT_${Date.now()}`,
    purchaseToken: `admin_grant_${cleanEmail}_${Date.now()}`,
    productId: 'pro_lifetime',
    isExpired: false,
    isRevoked: false,
    isTestPurchase: false,
    purchaseType: 'manual_grant',
    subscriptionState: 'active',
    grantedBy: adminEmail,
    grantedAt: serverTimestamp(),
    startDate: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp(),
  };

  // Write to pro_emails collection (keyed by email)
  await setDoc(doc(db, 'pro_emails', cleanEmail), grantData, { merge: true });

  // Also write to pro_users collection
  try {
    await setDoc(doc(db, 'pro_users', cleanEmail), grantData, { merge: true });
  } catch {
    /* ignore */
  }
}

/**
 * Revoke Pro access for a specific user by UID or Email.
 * Writes isPro: false, isExpired: true, isRevoked: true to subscription, pro_users, and pro_emails.
 */
export async function revokeProForUser(uidOrEmail: string, knownEmail?: string): Promise<void> {
  const key = uidOrEmail.trim().toLowerCase();
  const adminUser = getCurrentGoogleUser();
  const adminEmail = adminUser?.email || 'admin';

  const db = getFirestore(getFirebaseApp());
  const revokeData = {
    isPro: false,
    isExpired: true,
    isRevoked: true,
    subscriptionState: 'expired',
    revokedBy: adminEmail,
    revokedAt: serverTimestamp(),
    revocationReason: 'admin_revoked_pending_play_reconciliation',
    updatedAt: serverTimestamp(),
  };

  // Resolve the Gmail ID from the user record so every entitlement mirror is revoked.
  // A device subscribed to its own Firestore record receives this change immediately.
  let email = (knownEmail || '').trim().toLowerCase();
  if (!email && !key.includes('@')) {
    try {
      const [subscriptionSnap, proUserSnap] = await Promise.all([
        getDoc(doc(db, 'users', key, 'subscription', 'main')),
        getDoc(doc(db, 'pro_users', key)),
      ]);
      const data = subscriptionSnap.exists() ? subscriptionSnap.data() : proUserSnap.data();
      email = String(data?.email || data?.gmailId || '').trim().toLowerCase();
    } catch {
      // The UID records are still revoked below even if the profile lookup fails.
    }
  }

  // Update user's personal subscription doc (if UID)
  try {
    await setDoc(doc(db, 'users', key, 'subscription', 'main'), revokeData, { merge: true });
  } catch {
    /* ignore */
  }

  // Update pro_users collection doc
  try {
    await setDoc(doc(db, 'pro_users', key), revokeData, { merge: true });
  } catch {
    /* ignore */
  }

  // Update pro_emails collection doc (if email)
  const emailKey = key.includes('@') ? key : email;
  if (emailKey) {
    try {
      await setDoc(doc(db, 'pro_emails', emailKey), revokeData, { merge: true });
    } catch {
      /* ignore */
    }
  }
}

// ─────────────────────────────────────────────────────────────
// BANNED USERS SYSTEM
// ─────────────────────────────────────────────────────────────

/**
 * Fetches all banned users from `/banned_users` collection.
 */
export async function fetchBannedUsers(): Promise<BannedUserEntry[]> {
  const db = getFirestore(getFirebaseApp());
  const readTimestamp = (val: unknown): string | null => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (typeof (val as { toDate?: () => Date })?.toDate === 'function') {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    return null;
  };

  try {
    const snap = await getDocs(collection(db, 'banned_users'));
    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        identifier: String(data.identifier || docSnap.id),
        email: String(data.email || ''),
        uid: String(data.uid || ''),
        reason: String(data.reason || 'Violation of terms / App modification'),
        bannedAt: readTimestamp(data.bannedAt),
        bannedBy: String(data.bannedBy || 'Admin'),
      };
    });
  } catch (err) {
    console.warn('[Admin] fetchBannedUsers error:', err);
    return [];
  }
}

/**
 * Bans a user by their Gmail ID or UID.
 * Stores record in `/banned_users/{identifier}` and automatically revokes Pro access.
 */
export async function banUser(identifier: string, reason?: string): Promise<void> {
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId) {
    throw new Error('Please enter a valid Gmail ID or User ID.');
  }

  const adminUser = getCurrentGoogleUser();
  const adminEmail = adminUser?.email || 'admin';
  const isEmail = cleanId.includes('@');

  const db = getFirestore(getFirebaseApp());
  const banPayload = {
    identifier: cleanId,
    email: isEmail ? cleanId : '',
    uid: !isEmail ? cleanId : '',
    reason: (reason || '').trim() || 'App modification or unauthorized activity detected.',
    bannedAt: serverTimestamp(),
    bannedBy: adminEmail,
  };

  // 1. Write to banned_users collection
  await setDoc(doc(db, 'banned_users', cleanId), banPayload, { merge: true });

  // 2. Also revoke Pro access if they had Pro
  await revokeProForUser(cleanId);

  // 3. Update ban sync timestamp in config/bans to trigger 60s/instant event check
  try {
    await setDoc(doc(db, 'config', 'bans'), {
      lastBanAddedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      latestBannedId: cleanId,
    }, { merge: true });
  } catch {
    /* ignore */
  }
}

/**
 * Unbans a user by removing their record from `/banned_users`.
 */
export async function unbanUser(identifier: string): Promise<void> {
  const cleanId = identifier.trim().toLowerCase();
  if (!cleanId) return;

  const db = getFirestore(getFirebaseApp());
  await deleteDoc(doc(db, 'banned_users', cleanId));

  try {
    await setDoc(doc(db, 'config', 'bans'), {
      lastBanAddedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch {
    /* ignore */
  }
}

/**
 * Checks if the given email or UID is banned in Firestore.
 */
export async function checkIsUserBanned(email?: string | null, uid?: string | null): Promise<{ isBanned: boolean; reason?: string }> {
  const db = getFirestore(getFirebaseApp());

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanUid = (uid || '').trim();

  try {
    // 1. Check by email
    if (cleanEmail) {
      const emailDoc = await getDoc(doc(db, 'banned_users', cleanEmail));
      if (emailDoc.exists()) {
        const data = emailDoc.data();
        return { isBanned: true, reason: data.reason || 'Your account has been suspended by the administrator.' };
      }
    }

    // 2. Check by UID
    if (cleanUid) {
      const uidDoc = await getDoc(doc(db, 'banned_users', cleanUid));
      if (uidDoc.exists()) {
        const data = uidDoc.data();
        return { isBanned: true, reason: data.reason || 'Your account has been suspended by the administrator.' };
      }
    }
  } catch (err) {
    console.warn('[Admin] checkIsUserBanned error:', err);
  }

  return { isBanned: false };
}
