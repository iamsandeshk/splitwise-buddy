import { Capacitor } from '@capacitor/core';
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import { getCurrentGoogleUser, getFirebaseApp } from './auth';
import { isProUserCached } from '@/lib/proAccess';

export interface CloudBackupInfo {
  payload: string;
  updatedAt?: Date;
  appVersion?: string;
  platform?: string;
}

const FIREBASE_OP_TIMEOUT_MS = 15000;
const FREE_BACKUP_DAY_KEY = 'splitmate_free_cloud_backup_day';
const FREE_RESTORE_DAY_KEY = 'splitmate_free_cloud_restore_day';
let backupDb = getFirestore(getFirebaseApp());

if (Capacitor.isNativePlatform()) {
  // Android WebView can be unstable with default streaming transport.
  // Long-polling is slower but much more reliable for mobile app environments.
  try {
    backupDb = initializeFirestore(getFirebaseApp(), {
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    backupDb = getFirestore(getFirebaseApp());
  }
}

function toActionableError(error: unknown, fallback: string) {
  const code = (error as { code?: string } | null)?.code ?? '';
  const rawMessage = (error as { message?: string } | null)?.message ?? '';

  if (code === 'permission-denied') {
    return new Error('Firebase rules blocked access. Allow users/{uid}/backups/main read/write for request.auth.uid == uid.');
  }

  if (code === 'unauthenticated') {
    return new Error('Authentication expired. Please sign out and sign in again.');
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

function getBackupRef(uid: string) {
  return doc(backupDb, 'users', uid, 'backups', 'main');
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

async function enforceFreeCloudAction(kind: 'backup' | 'restore') {
  if (isProUserCached()) return;

  const dayStorageKey = kind === 'backup' ? FREE_BACKUP_DAY_KEY : FREE_RESTORE_DAY_KEY;
  if (localStorage.getItem(dayStorageKey) === todayKey()) {
    throw new Error(
      kind === 'backup'
        ? 'Free cloud backup already used for today.'
        : 'Free cloud restore already used for today.',
    );
  }
}

type CloudLimitOptions = {
  silentIfFree?: boolean;
};

async function enforceCloudActionWithOptions(
  kind: 'backup' | 'restore',
  options?: CloudLimitOptions,
) {
  if (options?.silentIfFree && !isProUserCached()) {
    throw new Error('free-user-skip');
  }

  await enforceFreeCloudAction(kind);
}

async function retryOnce<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (firstError) {
    const code = (firstError as { code?: string } | null)?.code ?? '';
    const canRetry = code === 'unavailable' || code === 'deadline-exceeded' || code === 'aborted';
    if (!canRetry) throw firstError;
    return operation();
  }
}

export async function saveBackupForCurrentUser(payload: string, appVersion: string, options?: CloudLimitOptions) {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getBackupRef(user.uid);
  try {
    await enforceCloudActionWithOptions('backup', options);

    await retryOnce(() =>
      withTimeout(
        setDoc(
          ref,
          {
            payload,
            appVersion,
            platform: Capacitor.getPlatform(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
        'Cloud backup upload',
      ),
    );

    if (!isProUserCached()) {
      localStorage.setItem(FREE_BACKUP_DAY_KEY, todayKey());
    }
  } catch (error) {
    if ((error as { message?: string } | null)?.message === 'free-user-skip') {
      return;
    }
    throw toActionableError(error, 'Cloud backup upload failed.');
  }
}

export async function loadBackupForCurrentUser(options?: { enforceFreeLimit?: boolean }): Promise<CloudBackupInfo | null> {
  const user = getCurrentGoogleUser();
  if (!user) {
    throw new Error('auth/not-signed-in');
  }

  const ref = getBackupRef(user.uid);
  let snapshot;
  try {
    if (options?.enforceFreeLimit !== false) {
      await enforceFreeCloudAction('restore');
    }
    snapshot = await retryOnce(() => withTimeout(getDoc(ref), 'Cloud backup fetch'));

    if (options?.enforceFreeLimit !== false && !isProUserCached()) {
      localStorage.setItem(FREE_RESTORE_DAY_KEY, todayKey());
    }
  } catch (error) {
    throw toActionableError(error, 'Cloud backup fetch failed.');
  }
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as {
    payload?: string;
    updatedAt?: Timestamp;
    appVersion?: string;
    platform?: string;
  };

  if (!data.payload) return null;

  return {
    payload: data.payload,
    updatedAt: data.updatedAt?.toDate(),
    appVersion: data.appVersion,
    platform: data.platform,
  };
}
