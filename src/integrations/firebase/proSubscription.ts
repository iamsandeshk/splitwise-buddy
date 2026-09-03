import { Capacitor } from '@capacitor/core';
import {
  deleteDoc,
  Timestamp,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  setDoc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { getCurrentGoogleUser, getFirebaseApp } from './auth';
import {
  normalizeProSubscription,
  type ProSubscriptionRecord,
} from '@/lib/proSubscription';
import { getAccountProfile } from '@/lib/storage';

const FIREBASE_OP_TIMEOUT_MS = 15000;
let proDb = getFirestore(getFirebaseApp());

if (Capacitor.isNativePlatform()) {
  try {
    proDb = initializeFirestore(getFirebaseApp(), {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    proDb = getFirestore(getFirebaseApp());
  }
}

function toActionableError(error: unknown, fallback: string) {
  const code = (error as { code?: string } | null)?.code ?? '';
  const rawMessage = (error as { message?: string } | null)?.message ?? '';

  if (code === 'permission-denied') {
    return new Error('Firebase rules blocked access. Allow users/{uid}/subscription/main read/write for request.auth.uid == uid.');
  }

  if (code === 'unauthenticated') {
    return new Error('Authentication expired. Please sign in again before syncing Pro access.');
  }

  if (code === 'failed-precondition') {
    return new Error('Cloud Firestore is not ready for this project. Enable Firestore in Firebase console first.');
  }

  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new Error('Firebase is temporarily unavailable. Check internet and try again.');
  }

  if (rawMessage) {
    return new Error(rawMessage);
  }

  return new Error(fallback);
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Check internet and Firebase rules.`));
    }, FIREBASE_OP_TIMEOUT_MS);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function retryOnce<T>(operation: () => Promise<T>) {
  return operation().catch((firstError) => {
    const code = (firstError as { code?: string } | null)?.code ?? '';
    const canRetry = code === 'unavailable' || code === 'deadline-exceeded' || code === 'aborted';
    if (!canRetry) throw firstError;
    return operation();
  });
}

function getSubscriptionRef(uid: string) {
  return doc(proDb, 'users', uid, 'subscription', 'main');
}

function readTimestamp(value?: Timestamp | null) {
  if (!value || typeof value.toDate !== 'function') {
    return null;
  }
  return value.toDate().toISOString();
}

function toTimestamp(value: string | null) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

function fromSnapshot(snapshotData: DocumentData): ProSubscriptionRecord | null {
  // If plan is not lifetime, return null (invalidated)
  if (snapshotData.plan !== 'lifetime') {
    return null;
  }

  const isExplicitlyRevokedOrExpired =
    snapshotData.isRevoked === true ||
    snapshotData.isExpired === true ||
    snapshotData.isPro === false ||
    snapshotData.subscriptionState === 'expired';

  if (isExplicitlyRevokedOrExpired) {
    return {
      isPro: false,
      plan: 'lifetime',
      startDate: readTimestamp(snapshotData.startDate) || new Date().toISOString(),
      endDate: null,
      endDateConfirmed: true,
      purchaseToken: snapshotData.purchaseToken || '',
      orderId: snapshotData.orderId || null,
      productId: snapshotData.productId || 'pro_lifetime',
      isExpired: true,
      restoredAt: readTimestamp(snapshotData.restoredAt),
      isTestPurchase: Boolean(snapshotData.isTestPurchase),
      purchaseType: snapshotData.purchaseType || 'paid',
      subscriptionState: 'expired',
      lastVerifiedAt: readTimestamp(snapshotData.lastVerifiedAt),
    };
  }

  return normalizeProSubscription({
    isPro: snapshotData.isPro,
    plan: 'lifetime',
    startDate: readTimestamp(snapshotData.startDate) || new Date().toISOString(),
    endDate: null,
    endDateConfirmed: true,
    purchaseToken: snapshotData.purchaseToken,
    orderId: snapshotData.orderId || null,
    productId: snapshotData.productId || 'pro_lifetime',
    isExpired: false,
    restoredAt: readTimestamp(snapshotData.restoredAt),
    isTestPurchase: Boolean(snapshotData.isTestPurchase),
    purchaseType: snapshotData.purchaseType || 'paid',
    expireAt: readTimestamp(snapshotData.expireAt),
    updatedAt: readTimestamp(snapshotData.updatedAt),
    subscriptionState: snapshotData.subscriptionState || 'active',
    lastVerifiedAt: readTimestamp(snapshotData.lastVerifiedAt),
  } as Partial<ProSubscriptionRecord>) ?? null;
}

export function toFirestoreSubscription(record: ProSubscriptionRecord) {
  const user = getCurrentGoogleUser();
  const profile = getAccountProfile();
  const email = (user?.email || profile?.email || '').trim();
  const name = (user?.displayName || profile?.name || 'User').trim();

  return {
    isPro: record.isPro,
    plan: 'lifetime',
    startDate: Timestamp.fromDate(new Date(record.startDate)),
    endDate: null,
    endDateConfirmed: Boolean(record.endDate),
    purchaseToken: record.purchaseToken,
    orderId: record.orderId ?? null,  // Only real GPA.* order IDs — never use purchaseToken as fallback
    productId: record.productId,
    isExpired: record.isExpired,
    isRevoked: false,
    revokedAt: null,
    revocationReason: null,
    restoredAt: toTimestamp(record.restoredAt),
    isTestPurchase: record.isTestPurchase,
    purchaseType: record.purchaseType,
    expireAt: null,
    updatedAt: serverTimestamp(),
    subscriptionState: record.subscriptionState ?? 'active',
    lastVerifiedAt: toTimestamp(record.lastVerifiedAt ?? null),
    // Mandatory user details for Lifetime Pro owners
    name: name,
    displayName: name,
    email: email,
    gmailId: email,
    uid: user?.uid ?? '',
  };
}

export async function saveProSubscriptionForCurrentUser(record: ProSubscriptionRecord) {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(user.uid);
  const payload = normalizeProSubscription(record);

  if (!payload || payload.plan !== 'lifetime') {
    throw new Error('Invalid lifetime subscription payload.');
  }

  try {
    const firestoreData = toFirestoreSubscription(payload);
    const didWrite = await retryOnce(() =>
      withTimeout(
        runTransaction(proDb, async (transaction) => {
          // This function is called only after the billing validator confirmed a current
          // Play ownership. A current ownership is allowed to replace a prior admin or
          // refund revocation, so a corrected refund decision can restore Pro.
          transaction.set(ref, firestoreData, { merge: true });
          return true;
        }),
        'Pro subscription save',
      ),
    );

    if (didWrite) {
      console.log('Pro Subscription Save: Successfully committed Lifetime Pro to Firestore.');
      // Also sync to top-level pro_users collection for fast Admin Panel listing
      try {
        const proUserDoc = doc(proDb, 'pro_users', user.uid);
        await setDoc(proUserDoc, firestoreData, { merge: true });
      } catch (err) {
        console.warn('pro_users sync error:', err);
      }
    }
  } catch (error) {
    throw toActionableError(error, 'Pro subscription save failed.');
  }
}

export async function loadProSubscriptionForCurrentUser(): Promise<ProSubscriptionRecord | null> {
  const user = getCurrentGoogleUser();
  const userUid = user?.uid;

  if (!userUid) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(userUid);

  let snapshot;
  try {
    snapshot = await retryOnce(() => withTimeout(getDoc(ref), 'Pro subscription fetch'));
  } catch (error) {
    throw toActionableError(error, 'Pro subscription fetch failed.');
  }

  if (snapshot.exists()) {
    return fromSnapshot(snapshot.data());
  }

  return null;
}

export function subscribeToProSubscriptionForCurrentUser(uid: string, callback: (record: ProSubscriptionRecord | null) => void) {
  const ref = getSubscriptionRef(uid);

  return onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }

    callback(fromSnapshot(snapshot.data()));
  }, (error) => {
    console.error('Pro subscription listener failed:', error);
  });
}

export async function expireProSubscriptionForCurrentUser() {
  const user = getCurrentGoogleUser();
  if (!user) {
    return;
  }

  const ref = getSubscriptionRef(user.uid);
  const expireData = {
    isPro: false,
    isExpired: true,
    isRevoked: true,
    plan: 'lifetime',
    subscriptionState: 'expired',
    revocationReason: 'google_play_no_active_purchase',
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVerifiedAt: serverTimestamp(),
  };

  try {
    await retryOnce(() =>
      withTimeout(
        setDoc(ref, expireData, { merge: true }),
        'Pro subscription expire',
      ),
    );
    console.log('Pro Subscription Expire: Successfully wrote revocation/expired status to Firestore.');

    try {
      const proUserDoc = doc(proDb, 'pro_users', user.uid);
      await setDoc(proUserDoc, expireData, { merge: true });
    } catch {
      /* ignore */
    }
  } catch (error) {
    console.warn('Pro subscription expire warning:', error);
  }
}

export async function deleteProSubscriptionForCurrentUser() {
  const user = getCurrentGoogleUser();
  if (!user) {
    return;
  }

  const ref = getSubscriptionRef(user.uid);
  try {
    await retryOnce(() => withTimeout(deleteDoc(ref), 'Pro subscription delete'));
    await deleteDoc(doc(proDb, 'pro_users', user.uid));
  } catch (error) {
    console.warn('Pro subscription delete warning:', error);
  }
}
