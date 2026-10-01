import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  getFirestore,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseApp } from './auth';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  emoji?: string;
  type?: 'info' | 'warning' | 'success' | 'promo';
  createdAt: string;
  link?: string;
}

function getDb() {
  return getFirestore(getFirebaseApp());
}

/**
 * Subscribe to live notification changes from Firestore.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(
  callback: (notifications: AppNotification[]) => void
): Unsubscribe {
  try {
    const db = getDb();
    const q = query(
      collection(db, 'app_notifications'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        try {
          const notifications: AppNotification[] = snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title || '',
              body: data.body || '',
              emoji: data.emoji || undefined,
              type: data.type || 'info',
              link: data.link || undefined,
              createdAt:
                typeof data.createdAt?.toDate === 'function'
                  ? data.createdAt.toDate().toISOString()
                  : (data.createdAt || new Date().toISOString()),
            };
          });
          callback(notifications);
        } catch (err) {
          console.warn('[Notifications] Failed to parse snapshot:', err);
          callback([]);
        }
      },
      (err) => {
        // Firestore permission denied, missing index, or offline — fail silently
        console.warn('[Notifications] Firestore listener error:', err);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('[Notifications] Failed to initialize listener:', err);
    // Return a no-op unsubscribe
    return () => {};
  }
}

/**
 * Fetch all notifications once (admin panel use).
 */
export async function fetchAllNotifications(): Promise<AppNotification[]> {
  const db = getDb();
  const q = query(
    collection(db, 'app_notifications'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title || '',
      body: data.body || '',
      emoji: data.emoji || undefined,
      type: data.type || 'info',
      link: data.link || undefined,
      createdAt:
        typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : (data.createdAt || new Date().toISOString()),
    };
  });
}

/**
 * Push a new notification to Firestore (admin only).
 */
export async function pushNotification(params: {
  title: string;
  body: string;
  emoji?: string;
  type?: 'info' | 'warning' | 'success' | 'promo';
  link?: string;
}): Promise<string> {
  const db = getDb();
  const ref = await addDoc(collection(db, 'app_notifications'), {
    title: params.title.trim(),
    body: params.body.trim(),
    emoji: params.emoji?.trim() || null,
    type: params.type || 'info',
    link: params.link?.trim() || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Delete a notification by ID (admin only).
 */
export async function deleteNotification(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, 'app_notifications', id));
}

/**
 * Try to fire a local (system) push notification on native Android/iOS.
 * Silently fails on web.
 */
export async function scheduleLocalPush(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 100000),
          title,
          body,
          schedule: { at: new Date(Date.now() + 500) },
          smallIcon: 'ic_launcher_foreground',
          sound: 'default',
        },
      ],
    });
  } catch (err) {
    console.warn('[Notifications] Local push failed:', err);
  }
}
