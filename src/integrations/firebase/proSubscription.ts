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
  type DocumentData,
} from 'firebase/firestore';
import { getCurrentGoogleUser, getFirebaseApp } from './auth';
import {
  normalizeProSubscription,
  type ProSubscriptionRecord,
} from '@/lib/proSubscription';

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
  return value ? value.toDate().toISOString() : null;
}

function toTimestamp(value: string | null) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

function fromSnapshot(snapshotData: DocumentData, uid: string): ProSubscriptionRecord | null {
  return normalizeProSubscription({
    isPro: snapshotData.isPro,
    plan: snapshotData.plan,
    startDate: readTimestamp(snapshotData.startDate),
    endDate: readTimestamp(snapshotData.endDate),
    purchaseToken: snapshotData.purchaseToken,
    productId: snapshotData.productId,
    isExpired: snapshotData.isExpired,
    restoredAt: readTimestamp(snapshotData.restoredAt),
    isTestPurchase: Boolean(snapshotData.isTestPurchase),
    purchaseType: snapshotData.purchaseType,
  } as Partial<ProSubscriptionRecord> & { uid?: string }) ?? null;
}

export function toFirestoreSubscription(record: ProSubscriptionRecord) {
  return {
    isPro: record.isPro,
    plan: record.plan,
    startDate: Timestamp.fromDate(new Date(record.startDate)),
    endDate: toTimestamp(record.endDate),
    purchaseToken: record.purchaseToken,
    productId: record.productId,
    isExpired: record.isExpired,
    restoredAt: toTimestamp(record.restoredAt),
    isTestPurchase: record.isTestPurchase,
    purchaseType: record.purchaseType,
  };
}

export async function saveProSubscriptionForCurrentUser(record: ProSubscriptionRecord) {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(user.uid);
  const payload = normalizeProSubscription(record);

  if (!payload) {
    throw new Error('Invalid subscription payload.');
  }

  try {
    await retryOnce(() =>
      withTimeout(
        setDoc(
          ref,
          toFirestoreSubscription(payload),
          { merge: true },
        ),
        'Pro subscription save',
      ),
    );
  } catch (error) {
    throw toActionableError(error, 'Pro subscription save failed.');
  }
}

export async function loadProSubscriptionForCurrentUser(): Promise<ProSubscriptionRecord | null> {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(user.uid);
  let snapshot;
  try {
    snapshot = await retryOnce(() => withTimeout(getDoc(ref), 'Pro subscription fetch'));
  } catch (error) {
    throw toActionableError(error, 'Pro subscription fetch failed.');
  }

  if (!snapshot.exists()) return null;

  return fromSnapshot(snapshot.data(), user.uid);
}

export function subscribeToProSubscriptionForCurrentUser(uid: string, callback: (record: ProSubscriptionRecord | null) => void) {
  const ref = getSubscriptionRef(uid);

  return onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }

    callback(fromSnapshot(snapshot.data(), uid));
  }, (error) => {
    console.error('Pro subscription listener failed:', error);
  });
}

export async function expireProSubscriptionForCurrentUser() {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(user.uid);
  try {
    await retryOnce(() => withTimeout(setDoc(ref, { isPro: false, isExpired: true }, { merge: true }), 'Pro subscription expire'));
  } catch (error) {
    throw toActionableError(error, 'Pro subscription expire failed.');
  }
}

export async function deleteProSubscriptionForCurrentUser() {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getSubscriptionRef(user.uid);
  try {
    await retryOnce(() => withTimeout(deleteDoc(ref), 'Pro subscription delete'));
  } catch (error) {
    throw toActionableError(error, 'Pro subscription delete failed.');
  }
}
