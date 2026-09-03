import {
  onSnapshot,
  query,
  where,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getFirestore,
  type DocumentData,
  type QueryDocumentSnapshot,
  type DocumentChange,
  type QuerySnapshot,
} from 'firebase/firestore';

import type { SharedExpense } from '@/lib/storage';
import { getCurrentGoogleUser, getFirebaseApp } from './auth';

const db = getFirestore(getFirebaseApp());

/** Shape of a sync update document stored in Firestore */
export interface SyncUpdate {
  id?: string;
  type?: string;
  expense?: SharedExpense | { id?: string; groupId?: string; [key: string]: unknown };
  groupName?: string;
  groupMembers?: string[];
  memberEmails?: Record<string, string>;
  syncEmails?: string[];
  fromEmail?: string;
  fromName?: string;
  targetEmail?: string;
  reason?: string;
  amount?: number;
  timestamp?: string;
  createdAt?: number;
  ttlExpireAt?: Date;
  syncDocId?: string;
  syncCollection?: string;
  isCloudUpdate?: boolean;
  isSentUpdate?: boolean;
  [key: string]: unknown;
}

/**
 * 🚀 PUSH UPDATE TO CLOUD
 */
export async function pushUpdateToCloud(update: SyncUpdate, targetEmail: string) {
  const user = getCurrentGoogleUser();
  if (!user?.email) return;

  const targetEmailLower = targetEmail.toLowerCase().trim();
  const senderEmailLower = user.email.toLowerCase().trim();

  try {
    // Deterministic ID → prevents duplicates, uniquely tagged per target
    const docId = `${senderEmailLower}_${update.expense?.id || update.id}_${targetEmailLower}_${update.type || 'added'}`;
    const collectionName = (update.groupName || update.expense?.groupId) ? 'sync_group' : 'sync_inbox';

    await setDoc(doc(db, collectionName, docId), {
      ...update,
      targetEmail: targetEmailLower,
      fromEmail: senderEmailLower,
      fromName: user.displayName || update.fromName || 'Friend',
      createdAt: Date.now(), // ✅ stable ordering locally
      ttlExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // ✅ 30-day auto-expiry (User can map TTL to this field)
    });

  } catch (error) {
    console.error('❌ Failed to push sync update:', error);
  }
}


/**
 * 📡 REAL-TIME LISTENER
 */
export function subscribeToMySyncUpdates(
  callback: (updates: SyncUpdate[]) => void
) {
  const user = getCurrentGoogleUser();
  if (!user?.email) return () => { };

  const myEmail = user.email.toLowerCase().trim();

  const qInbox = query(
    collection(db, 'sync_inbox'),
    where('targetEmail', '==', myEmail)
  );

  const qGroup = query(
    collection(db, 'sync_group'),
    where('targetEmail', '==', myEmail)
  );

  const handleSnapshot = (snapshot: QuerySnapshot<DocumentData>, colName: string) => {
    console.log(`✅ SNAPSHOT SIZE [${colName}]:`, snapshot.size);

    const updates = snapshot.docChanges()
      .filter((change: DocumentChange<DocumentData>) => {
        const data = change.doc.data() as SyncUpdate;
        if (!data?.expense || !data?.fromEmail) return false;
        if (data.fromEmail === myEmail) return false;
        return change.type === 'added';
      })
      .map((change: DocumentChange<DocumentData>): SyncUpdate => ({
        ...(change.doc.data() as SyncUpdate),
        id: (change.doc.data() as SyncUpdate).id,
        syncDocId: change.doc.id,
        syncCollection: colName,
        isCloudUpdate: true
      }))
      .sort((a: SyncUpdate, b: SyncUpdate) => (a.createdAt || 0) - (b.createdAt || 0));

    if (updates.length > 0) {
      console.log(`🔥 RECEIVED [${colName}]:`, updates);
      callback(updates);
    }
  };

  const unsubInbox = onSnapshot(qInbox, s => handleSnapshot(s, 'sync_inbox'), e => console.error("❌ INBOX ERROR:", e));
  const unsubGroup = onSnapshot(qGroup, s => handleSnapshot(s, 'sync_group'), e => console.error("❌ GROUP ERROR:", e));

  return () => { unsubInbox(); unsubGroup(); };
}


/**
 * 📥 MANUAL FETCH (ONE-SHOT)
 */
export async function fetchMySyncUpdates(): Promise<SyncUpdate[]> {
  const user = getCurrentGoogleUser();
  if (!user?.email) return [];

  const myEmail = user.email.toLowerCase().trim();
  const { getDocs } = await import('firebase/firestore');

  const qInbox = query(
    collection(db, 'sync_inbox'),
    where('targetEmail', '==', myEmail)
  );

  const qGroup = query(
    collection(db, 'sync_group'),
    where('targetEmail', '==', myEmail)
  );

  try {
    const [snapInbox, snapGroup] = await Promise.all([
      getDocs(qInbox),
      getDocs(qGroup)
    ]);

    const docsIn = snapInbox.docs.map((d: QueryDocumentSnapshot<DocumentData>): SyncUpdate => ({
      ...(d.data() as SyncUpdate),
      id: (d.data() as SyncUpdate).id,
      syncDocId: d.id,
      syncCollection: 'sync_inbox',
      isCloudUpdate: true
    }));

    const docsGrp = snapGroup.docs.map((d: QueryDocumentSnapshot<DocumentData>): SyncUpdate => ({
      ...(d.data() as SyncUpdate),
      id: (d.data() as SyncUpdate).id,
      syncDocId: d.id,
      syncCollection: 'sync_group',
      isCloudUpdate: true
    }));

    return [...docsIn, ...docsGrp]
      .sort((a: SyncUpdate, b: SyncUpdate) => (a.createdAt || 0) - (b.createdAt || 0))
      .filter((data: SyncUpdate) => data.fromEmail !== myEmail);
  } catch (error) {
    console.error('❌ Failed to fetch sync updates:', error);
    return [];
  }
}

/**
 * 📤 FETCH SENT SYNC UPDATES (Sent by me, awaiting target user acceptance)
 */
export async function fetchSentSyncUpdates(): Promise<SyncUpdate[]> {
  const user = getCurrentGoogleUser();
  if (!user?.email) return [];

  const myEmail = user.email.toLowerCase().trim();
  const { getDocs } = await import('firebase/firestore');

  const qInbox = query(
    collection(db, 'sync_inbox'),
    where('fromEmail', '==', myEmail)
  );

  const qGroup = query(
    collection(db, 'sync_group'),
    where('fromEmail', '==', myEmail)
  );

  try {
    const [snapInbox, snapGroup] = await Promise.all([
      getDocs(qInbox),
      getDocs(qGroup)
    ]);

    const docsIn = snapInbox.docs.map((d: QueryDocumentSnapshot<DocumentData>): SyncUpdate => ({
      ...(d.data() as SyncUpdate),
      id: (d.data() as SyncUpdate).id || d.id,
      syncDocId: d.id,
      syncCollection: 'sync_inbox',
      isSentUpdate: true
    }));

    const docsGrp = snapGroup.docs.map((d: QueryDocumentSnapshot<DocumentData>): SyncUpdate => ({
      ...(d.data() as SyncUpdate),
      id: (d.data() as SyncUpdate).id || d.id,
      syncDocId: d.id,
      syncCollection: 'sync_group',
      isSentUpdate: true
    }));

    return [...docsIn, ...docsGrp]
      .sort((a: SyncUpdate, b: SyncUpdate) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (error) {
    console.error('❌ Failed to fetch sent sync updates:', error);
    return [];
  }
}

/**
 * 🔄 RESEND SYNC UPDATE (Pushes fresh createdAt to wake up recipient)
 */
export async function resendSyncUpdate(update: SyncUpdate): Promise<void> {
  if (!update.targetEmail) return;
  await pushUpdateToCloud({
    ...update,
    createdAt: Date.now()
  }, update.targetEmail);
}

/**
 * 🗑️ CANCEL SENT SYNC UPDATE
 */
export async function cancelSentSyncUpdate(syncDocId: string, syncCollection: string = 'sync_inbox'): Promise<void> {
  try {
    await deleteDoc(doc(db, syncCollection, syncDocId));
  } catch (error) {
    console.error('❌ Failed to cancel sent sync update:', error);
  }
}

/**
 * ✅ ACKNOWLEDGE (DELETE FROM INBOX)
 */
export async function acknowledgeUpdate(docId: string, collectionName: string = 'sync_inbox') {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (error) {
    console.error(`❌ Failed to acknowledge update in ${collectionName}:`, error);
  }
}