import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  X,
  Check,
  Clock,
  Send,
  Inbox,
  AlertCircle,
  MessageSquare,
  Trash2,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Mail,
  Users,
  ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  getPendingSyncUpdates,
  removePendingSyncUpdate,
  addRejectionUpdate,
  getRejectionUpdates,
  removeRejectionUpdate,
  getAccountProfile,
  generateId,
  savePersonProfile,
  applySyncUpdate,
  getPersonProfiles,
  type PendingSyncUpdate,
  type RejectionUpdate,
  type SharedExpense,
  type PersonProfile,
} from '@/lib/storage';
import {
  fetchMySyncUpdates,
  fetchSentSyncUpdates,
  resendSyncUpdate,
  cancelSentSyncUpdate,
  acknowledgeUpdate,
  type SyncUpdate,
} from '@/integrations/firebase/sync';
import { getCurrentGoogleUser } from '@/integrations/firebase/auth';
import { MoneyDisplay } from '../MoneyDisplay';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface IncomingSyncItem extends PendingSyncUpdate {
  syncDocId?: string;
  syncCollection?: string;
  isCloudUpdate?: boolean;
  createdAt?: number;
  fromEmail?: string;
  targetEmail?: string;
  reason?: string;
  amount?: number;
}

export interface SentSyncItem extends SyncUpdate {
  id?: string;
  syncDocId?: string;
  syncCollection?: string;
  fromEmail?: string;
  targetEmail?: string;
  fromName?: string;
  reason?: string;
  amount?: number;
  groupName?: string;
  expense?: SharedExpense;
  createdAt?: number;
  timestamp?: string;
  isSentUpdate?: boolean;
}

interface SyncCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyncCenterModal({ isOpen, onClose }: SyncCenterModalProps) {
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [incomingUpdates, setIncomingUpdates] = useState<IncomingSyncItem[]>([]);
  const [sentUpdates, setSentUpdates] = useState<SentSyncItem[]>([]);
  const [rejections, setRejections] = useState<RejectionUpdate[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Rejection State
  const [rejectingUpdate, setRejectingUpdate] = useState<IncomingSyncItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadAllSyncData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);

    const localPending = getPendingSyncUpdates() as IncomingSyncItem[];
    const localRejections = getRejectionUpdates();
    const profiles = getPersonProfiles() as Record<string, PersonProfile>;

    // Map pending updates to use local profile names if email matches
    const mappedPending: IncomingSyncItem[] = localPending.map(update => {
      if (update.fromEmail) {
        const emailLower = update.fromEmail.toLowerCase();
        const existing = Object.values(profiles).find((p) => p.email?.toLowerCase() === emailLower);
        if (existing) {
          return { ...update, fromName: existing.name };
        }
      }
      return update;
    });

    setIncomingUpdates(mappedPending);
    setRejections(localRejections);

    // Fetch live from Firestore if signed in
    const user = getCurrentGoogleUser();
    if (user?.email) {
      try {
        const [cloudIncoming, cloudSent] = await Promise.all([
          fetchMySyncUpdates() as unknown as Promise<IncomingSyncItem[]>,
          fetchSentSyncUpdates() as unknown as Promise<SentSyncItem[]>,
        ]);

        // Merge cloud incoming with local
        if (cloudIncoming.length > 0) {
          const mergedIncoming = [...mappedPending];
          for (const item of cloudIncoming) {
            const hasMatch = mergedIncoming.some(
              u => (item.id && u.id === item.id) || (item.syncDocId && u.syncDocId === item.syncDocId)
            );
            if (!hasMatch) {
              mergedIncoming.push(item);
            }
          }
          setIncomingUpdates(mergedIncoming);
        }

        setSentUpdates(cloudSent);
      } catch (err) {
        console.warn('[SyncCenter] Cloud sync fetch warning:', err);
      }
    }

    if (isManualRefresh) {
      setRefreshing(false);
      toast.success('Sync Center updated.');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadAllSyncData();
    }
  }, [isOpen, loadAllSyncData]);

  // Handle Accept
  const handleAccept = async (update: IncomingSyncItem) => {
    try {
      let targetName = update.fromName || 'Friend';
      const profiles = getPersonProfiles() as Record<string, PersonProfile>;

      if (update.fromEmail) {
        const emailLower = update.fromEmail.toLowerCase();
        const existing = Object.values(profiles).find((p) => p.email?.toLowerCase() === emailLower);
        if (existing) {
          targetName = existing.name;
        }
        savePersonProfile({ name: targetName, email: update.fromEmail });
      }

      update.fromName = targetName;
      if (update.expense) {
        update.expense.personName = targetName;
      }

      // 1. Apply to local state
      applySyncUpdate(update);
      removePendingSyncUpdate(update.id);

      // 2. Acknowledge from Firestore cloud inbox
      if (update.syncDocId) {
        await acknowledgeUpdate(update.syncDocId, update.syncCollection || 'sync_inbox');
      }

      toast.success(`Accepted "${update.expense?.reason || 'Expense'}"`);
      setIncomingUpdates(prev => prev.filter(u => u.id !== update.id && u.syncDocId !== update.syncDocId));
    } catch {
      toast.error('Failed to accept update.');
    }
  };

  // Start Reject
  const startReject = (update: IncomingSyncItem) => {
    setRejectingUpdate(update);
    setRejectionReason('');
  };

  // Submit Reject
  const submitReject = async () => {
    if (!rejectingUpdate) return;
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason.');
      return;
    }

    try {
      if (rejectingUpdate.fromEmail) {
        const myProfile = getAccountProfile();
        addRejectionUpdate({
          id: generateId(),
          recipientName: myProfile.name || 'Friend',
          senderEmail: myProfile.email || '',
          reason: rejectionReason.trim(),
          originalExpense: rejectingUpdate.expense,
          timestamp: new Date().toISOString(),
        }, rejectingUpdate.fromEmail);
      }

      removePendingSyncUpdate(rejectingUpdate.id);

      if (rejectingUpdate.syncDocId) {
        await acknowledgeUpdate(rejectingUpdate.syncDocId, rejectingUpdate.syncCollection || 'sync_inbox');
      }

      setIncomingUpdates(prev => prev.filter(u => u.id !== rejectingUpdate.id && u.syncDocId !== rejectingUpdate.syncDocId));
      setRejectingUpdate(null);
      toast.info('Update declined.');
    } catch {
      toast.error('Failed to decline update.');
    }
  };

  // Resend Sent Sync
  const handleResend = async (item: SentSyncItem) => {
    const key = item.syncDocId || item.id;
    if (!key) return;
    setResendingId(key);
    try {
      await resendSyncUpdate(item);
      toast.success(`Resent sync request to ${item.targetEmail || 'recipient'}!`);
    } catch {
      toast.error('Could not resend sync request.');
    } finally {
      setResendingId(null);
    }
  };

  // Cancel Sent Sync
  const handleCancelSent = async (item: SentSyncItem) => {
    const key = item.syncDocId || item.id;
    if (!key) return;
    setCancellingId(key);
    try {
      if (item.syncDocId) {
        await cancelSentSyncUpdate(item.syncDocId, item.syncCollection || 'sync_inbox');
      }
      setSentUpdates(prev => prev.filter(u => (item.syncDocId && u.syncDocId !== item.syncDocId) && u.id !== item.id));
      toast.info('Sync request cancelled.');
    } catch {
      toast.error('Could not cancel sync request.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleClearRejections = () => {
    rejections.forEach(r => removeRejectionUpdate(r.id));
    setRejections([]);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] bg-background text-foreground flex flex-col overflow-hidden"
      >
        {/* Full Page Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-2xl slab flex items-center justify-center text-foreground active:scale-90 transition-all shadow-sm"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div>
              <h1 className="text-base font-black uppercase tracking-tight text-foreground flex items-center gap-2">
                Sync Center
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  P2P LEDGER
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {incomingUpdates.length} Received · {sentUpdates.length} Sent Pending
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAllSyncData(true)}
              disabled={refreshing}
              className="w-10 h-10 rounded-2xl slab flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all shadow-sm"
              title="Refresh syncs"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-primary' : ''} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="p-4 pb-2 max-w-xl mx-auto w-full">
          <div className="flex rounded-2xl bg-muted/40 p-1 border border-border/20">
            <button
              type="button"
              onClick={() => setActiveTab('received')}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                activeTab === 'received'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ArrowDownLeft size={15} className={activeTab === 'received' ? 'text-primary' : ''} />
              Received ({incomingUpdates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sent')}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                activeTab === 'sent'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ArrowUpRight size={15} className={activeTab === 'sent' ? 'text-primary' : ''} />
              Sent Pending ({sentUpdates.length})
            </button>
          </div>
        </div>

        {/* Scrollable List Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-20 custom-scrollbar max-w-xl mx-auto w-full space-y-4">
          {/* Disputed / Rejections Section */}
          {rejections.length > 0 && activeTab === 'received' && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-destructive/90 flex items-center gap-1.5">
                  <AlertCircle size={13} />
                  Declined Requests ({rejections.length})
                </h3>
                <button
                  onClick={handleClearRejections}
                  className="text-[10px] font-bold text-muted-foreground hover:text-destructive active:scale-95 transition-all"
                >
                  CLEAR ALL
                </button>
              </div>

              <div className="space-y-2">
                {rejections.map((rej) => (
                  <div key={rej.id} className="p-4 bg-destructive/5 rounded-2xl border border-destructive/15 relative group">
                    <button
                      onClick={() => { removeRejectionUpdate(rej.id); setRejections(prev => prev.filter(r => r.id !== rej.id)); }}
                      className="absolute top-3.5 right-3.5 text-muted-foreground/30 hover:text-destructive transition-colors"
                    >
                      <X size={14} />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-black text-xs">
                        {rej.recipientName?.charAt(0) || 'U'}
                      </div>
                      <p className="text-xs font-bold text-foreground">{rej.recipientName} declined your record</p>
                    </div>
                    <div className="bg-background/50 rounded-xl p-3 mb-2 italic text-xs text-muted-foreground border border-border/10">
                      "{rej.reason}"
                    </div>
                    <div className="flex justify-between items-center px-1 text-xs opacity-60">
                      <span>{rej.originalExpense?.reason}</span>
                      <MoneyDisplay amount={rej.originalExpense?.amount || 0} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: RECEIVED */}
          {activeTab === 'received' && (
            <div className="space-y-3 pt-2">
              {incomingUpdates.length === 0 && rejections.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <div className="w-14 h-14 rounded-3xl bg-muted/30 flex items-center justify-center mx-auto text-muted-foreground border border-border/20">
                    <Inbox size={26} />
                  </div>
                  <p className="text-sm font-bold text-foreground">No Incoming Syncs</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    When friends add or update shared expenses with your Gmail, they will appear here for confirmation.
                  </p>
                </div>
              ) : (
                incomingUpdates.map((update) => (
                  <div
                    key={update.id || update.syncDocId}
                    className="p-4 bg-card rounded-2xl border border-border/40 space-y-3.5 shadow-sm"
                  >
                    {/* Sender Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-sm border border-primary/20 shrink-0">
                          {update.fromName?.charAt(0)?.toUpperCase() || 'F'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-sm text-foreground truncate">{update.fromName || 'Friend'}</h4>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{update.fromEmail}</p>
                        </div>
                      </div>

                      <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                        {update.timestamp || update.createdAt
                          ? new Date(update.timestamp || update.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </div>

                    {/* Expense Card */}
                    <div className="p-3.5 rounded-xl bg-muted/30 border border-border/20 flex justify-between items-center">
                      <div className="min-w-0 pr-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Description</p>
                        <p className="text-sm font-bold text-foreground truncate">
                          "{update.expense?.reason || update.reason || 'Shared Expense'}"
                        </p>
                        {update.groupName && (
                          <p className="text-[10px] text-primary font-semibold flex items-center gap-1 mt-0.5">
                            <Users size={10} /> Group: {update.groupName}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Amount</p>
                        <MoneyDisplay amount={update.expense?.amount || update.amount || 0} size="md" className="font-black text-foreground" />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startReject(update)}
                        className="h-10 rounded-xl font-bold text-xs border-border/40 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        Decline
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleAccept(update)}
                        className="h-10 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 text-white shadow-sm"
                      >
                        <Check size={14} className="mr-1.5" />
                        Accept & Add
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: SENT */}
          {activeTab === 'sent' && (
            <div className="space-y-3 pt-2">
              {sentUpdates.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <div className="w-14 h-14 rounded-3xl bg-muted/30 flex items-center justify-center mx-auto text-muted-foreground border border-border/20">
                    <Send size={26} />
                  </div>
                  <p className="text-sm font-bold text-foreground">No Pending Sent Syncs</p>
                  <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                    When you add shared expenses linked to friends' emails, any requests awaiting their acceptance will be listed here.
                  </p>
                </div>
              ) : (
                sentUpdates.map((item) => {
                  const key = item.syncDocId || item.id || 'sent-item';
                  const isResending = resendingId === key;
                  const isCancelling = cancellingId === key;

                  return (
                    <div
                      key={key}
                      className="p-4 bg-card rounded-2xl border border-border/40 space-y-3.5 shadow-sm"
                    >
                      {/* Recipient info & status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-black text-sm border border-amber-500/20 shrink-0">
                            <Mail size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground truncate">
                              Sent to: <span className="text-primary font-mono">{item.targetEmail}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                            </p>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0 flex items-center gap-1">
                          <Clock size={10} /> Pending
                        </span>
                      </div>

                      {/* Expense details */}
                      <div className="p-3.5 rounded-xl bg-muted/30 border border-border/20 flex justify-between items-center">
                        <div className="min-w-0 pr-3">
                          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Description</p>
                          <p className="text-sm font-bold text-foreground truncate">
                            "{item.expense?.reason || item.reason || 'Shared Expense'}"
                          </p>
                          {item.groupName && (
                            <p className="text-[10px] text-primary font-semibold flex items-center gap-1 mt-0.5">
                              <Users size={10} /> Group: {item.groupName}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">Amount</p>
                          <MoneyDisplay amount={item.expense?.amount || item.amount || 0} size="md" className="font-black text-foreground" />
                        </div>
                      </div>

                      {/* Actions: Resend & Cancel */}
                      <div className="flex gap-2 pt-0.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCancelSent(item)}
                          disabled={isCancelling || isResending}
                          className="h-10 rounded-xl font-bold text-xs border-border/40 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          {isCancelling ? <RefreshCw size={13} className="animate-spin mr-1" /> : <Trash2 size={13} className="mr-1" />}
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleResend(item)}
                          disabled={isCancelling || isResending}
                          className="flex-1 h-10 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-black shadow-sm"
                        >
                          {isResending ? (
                            <RefreshCw size={14} className="animate-spin mr-1.5" />
                          ) : (
                            <Send size={14} className="mr-1.5" />
                          )}
                          Resend Request
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Rejection Modal Overlay */}
        <AnimatePresence>
          {rejectingUpdate && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm p-6 flex items-center justify-center"
            >
              <div className="bg-card rounded-3xl border border-border/40 p-6 space-y-5 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
                <div className="text-center">
                  <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-destructive/20 text-destructive">
                    <MessageSquare size={26} />
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-foreground">Decline Update</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Explain why this record is incorrect so <span className="font-semibold text-foreground">{rejectingUpdate.fromName}</span> can adjust it.
                  </p>
                </div>

                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Already settled in cash, wrong share amount..."
                  className="w-full bg-muted/40 border border-border/40 rounded-2xl p-4 text-xs font-medium focus:ring-2 ring-primary/20 outline-none h-28 resize-none text-foreground"
                  autoFocus
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRejectingUpdate(null)}
                    className="flex-1 h-11 rounded-xl text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void submitReject()}
                    className="flex-1 h-11 rounded-xl text-xs font-bold"
                  >
                    Send & Decline
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
