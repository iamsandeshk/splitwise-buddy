import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ChevronLeft, 
  Pencil, 
  Check, 
  Pause, 
  Play, 
  Trash2, 
  Calendar, 
  CreditCard, 
  Clock, 
  Repeat, 
  Plus, 
  X, 
  Receipt,
  Gift,
  Tag,
  FileText,
  AlertCircle,
  Zap
} from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { 
  getPersonalExpenses, 
  savePersonalExpense, 
  deletePersonalExpense, 
  getAccountSummaries, 
  getDefaultAccountId, 
  generateId, 
  saveSubscriptions, 
  getSubscriptions, 
  processSubscriptionBilling, 
  type SubscriptionItem, 
  type SubscriptionCycle, 
  type PersonalExpense 
} from '@/lib/storage';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { SubscriptionFormModal } from './SubscriptionFormModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SubscriptionDetailPageProps {
  subscription: SubscriptionItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updated: SubscriptionItem) => void;
  onDelete: (id: string) => void;
  onTogglePause: (id: string) => void;
}

function formatFullDate(dateStr?: string): string {
  if (!dateStr) return 'Not set';
  const parts = dateStr.split('T')[0].split('-');
  let d: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calculateNextDueDate(
  startDate?: string, 
  cycle: SubscriptionCycle = 'monthly',
  freeTrial?: boolean,
  trialEndDate?: string,
  autoRenew: boolean = true
): { label: string; daysRemaining: number | null; statusText: string } {
  if (cycle === 'lifetime') return { label: 'Lifetime Access', daysRemaining: null, statusText: 'One-time' };

  if (autoRenew === false) {
    return { label: formatFullDate(startDate), daysRemaining: null, statusText: 'Non-recurring' };
  }

  // If free trial is currently active and trial end date is in the future
  if (freeTrial && trialEndDate) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const trialParts = trialEndDate.split('T')[0].split('-').map(Number);
    if (trialParts.length === 3 && !isNaN(trialParts[0])) {
      const trialEnd = new Date(trialParts[0], trialParts[1] - 1, trialParts[2]);
      trialEnd.setHours(0, 0, 0, 0);
      if (trialEnd >= now) {
        const diffMs = trialEnd.getTime() - now.getTime();
        const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return {
          label: formatFullDate(trialEndDate),
          daysRemaining: days,
          statusText: days === 0 ? 'Trial ends today' : `Trial ends in ${days}d`,
        };
      }
    }
  }

  if (!startDate) return { label: 'Not set', daysRemaining: null, statusText: 'No date' };
  
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return { label: 'Invalid date', daysRemaining: null, statusText: 'Invalid date' };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nextDue = new Date(start);
  nextDue.setHours(0, 0, 0, 0);

  while (nextDue <= now) {
    if (cycle === 'daily') nextDue.setDate(nextDue.getDate() + 1);
    else if (cycle === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
    else if (cycle === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
    else if (cycle === 'quarterly') nextDue.setMonth(nextDue.getMonth() + 3);
    else if (cycle === 'yearly') nextDue.setFullYear(nextDue.getFullYear() + 1);
    else break;
  }

  const diffMs = nextDue.getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const formatted = nextDue.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  let statusText = `in ${days} days`;
  if (days === 0) statusText = 'Today';
  else if (days === 1) statusText = 'Tomorrow';

  return { label: formatted, daysRemaining: days, statusText };
}

export function SubscriptionDetailPage({
  subscription: initialSub,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onTogglePause,
}: SubscriptionDetailPageProps) {
  const [sub, setSub] = useState<SubscriptionItem>(initialSub);
  const [dataVersion, setDataVersion] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [manualRecordDate, setManualRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualRecordAmount, setManualRecordAmount] = useState(String(initialSub.amount || ''));

  const currency = useCurrency();
  const accounts = useMemo(() => {
    void dataVersion;
    return getAccountSummaries();
  }, [dataVersion]);
  const defaultAccountId = useMemo(() => getDefaultAccountId(), []);

  // Sync internal state if prop updates
  useEffect(() => {
    setSub(initialSub);
    setManualRecordAmount(String(initialSub.amount || ''));
  }, [initialSub]);

  // Back button handling
  useBackHandler(isOpen && !showEditModal && !showDeleteConfirm && !showRecordModal, onClose);
  useBackHandler(showDeleteConfirm, () => setShowDeleteConfirm(false));
  useBackHandler(showRecordModal, () => setShowRecordModal(false));

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isOpen]);

  // Listen for external storage changes
  useEffect(() => {
    const handleSync = () => setDataVersion(v => v + 1);
    window.addEventListener('splitmate_data_changed', handleSync);
    return () => window.removeEventListener('splitmate_data_changed', handleSync);
  }, []);

  // Find previous payments recorded for this subscription
  const payments = useMemo(() => {
    void dataVersion;
    const allExpenses = getPersonalExpenses();
    const appNameLower = (sub.appName || '').toLowerCase().trim();
    
    return allExpenses
      .filter((e) => {
        if (e.mirrorFromId === sub.id) return true;
        if (e.source === 'subscription') {
          if (e.mirrorFromId === sub.id) return true;
          if (appNameLower && e.reason?.toLowerCase().includes(appNameLower)) return true;
        }
        return false;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sub.id, sub.appName, dataVersion]);

  // Total paid sum
  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments]);

  // Associated account for payment mode
  const currentAccount = useMemo(() => {
    if (!sub.accountId) return null;
    return accounts.find(a => a.id === sub.accountId) || null;
  }, [sub.accountId, accounts]);

  // Equivalents
  const { monthlyEquivalent, yearlyEquivalent } = useMemo(() => {
    const amt = Number(sub.amount) || 0;
    let m = 0;
    if (sub.cycle === 'monthly') m = amt;
    else if (sub.cycle === 'yearly') m = amt / 12;
    else if (sub.cycle === 'weekly') m = (amt * 52) / 12;
    else if (sub.cycle === 'quarterly') m = amt / 3;
    else if (sub.cycle === 'daily') m = amt * 30.4;
    return {
      monthlyEquivalent: m,
      yearlyEquivalent: m * 12,
    };
  }, [sub.amount, sub.cycle]);

  const renewalInfo = useMemo(() => {
    return calculateNextDueDate(
      sub.startDate || sub.createdAt, 
      sub.cycle, 
      sub.freeTrial, 
      sub.trialEndDate, 
      sub.autoRenew !== false
    );
  }, [sub.startDate, sub.createdAt, sub.cycle, sub.freeTrial, sub.trialEndDate, sub.autoRenew]);

  // Action: Mark Paid for current cycle
  const handleMarkPaid = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    const expense: PersonalExpense = {
      id: generateId(),
      amount: Number(sub.amount) || 0,
      reason: `Subscription: ${(sub.appName || 'Subscription').trim()}`,
      category: sub.category || 'Bills & Utilities',
      date: dateStr,
      createdAt: new Date().toISOString(),
      isIncome: false,
      isMirror: true,
      mirrorFromId: sub.id,
      accountId: sub.accountId || defaultAccountId || undefined,
      source: 'subscription',
    };

    savePersonalExpense(expense);
    toast.success(`Payment of ${currency.symbol}${Number(sub.amount).toLocaleString(currency.locale)} recorded`);
    setDataVersion(v => v + 1);
  };

  // Action: Record manual payment with custom date/amount
  const handleRecordManualPayment = () => {
    const amt = Number(manualRecordAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    const expense: PersonalExpense = {
      id: generateId(),
      amount: amt,
      reason: `Subscription: ${(sub.appName || 'Subscription').trim()}`,
      category: sub.category || 'Bills & Utilities',
      date: manualRecordDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      isIncome: false,
      isMirror: true,
      mirrorFromId: sub.id,
      accountId: sub.accountId || defaultAccountId || undefined,
      source: 'subscription',
    };

    savePersonalExpense(expense);
    toast.success('Payment recorded');
    setShowRecordModal(false);
    setDataVersion(v => v + 1);
  };

  // Action: Delete past payment
  const handleDeletePayment = (paymentId: string) => {
    deletePersonalExpense(paymentId);
    toast.success('Payment record deleted');
    setDataVersion(v => v + 1);
  };

  // Save changes from SubscriptionFormModal
  const handleSaveEdit = (updatedData: Omit<SubscriptionItem, 'id' | 'createdAt'>) => {
    const updated: SubscriptionItem = {
      ...sub,
      ...updatedData,
      id: sub.id,
      createdAt: sub.createdAt,
    };

    const allSubs = getSubscriptions();
    const nextSubs = allSubs.map(s => s.id === sub.id ? updated : s);
    saveSubscriptions(nextSubs);
    processSubscriptionBilling();

    setSub(updated);
    onUpdate(updated);
    setShowEditModal(false);
    setDataVersion(v => v + 1);
    toast.success('Subscription updated');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex flex-col bg-background font-sans animate-in slide-in-from-bottom-4 duration-250 overflow-hidden">
      
      {/* ── STICKY TOP APP BAR (NO GLOW) ── */}
      <div className="sticky top-0 z-30 px-5 pt-5 pb-3 flex items-center justify-between border-b border-border/10 bg-background/95 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-secondary/80 hover:bg-secondary border border-border/15 flex items-center justify-center active:scale-95 transition-all"
            aria-label="Back to Subscriptions"
          >
            <ChevronLeft size={22} className="text-foreground" />
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            Subscription Details
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowEditModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-secondary/80 hover:bg-secondary text-xs font-bold border border-border/15 active:scale-95 transition-all text-foreground"
        >
          <Pencil size={13} />
          <span>Edit</span>
        </button>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 pb-36">

        {/* ── HERO BANNER (CLEAN & MATTE — NO GLOW) ── */}
        <div className="flex flex-col items-center text-center">
          {/* Service Icon */}
          <div className="w-20 h-20 rounded-[28%] bg-secondary/30 border border-border/20 overflow-hidden flex items-center justify-center mb-4">
            {sub.logoUrl ? (
              <img src={sub.logoUrl} alt={sub.appName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-secondary/40 flex items-center justify-center">
                <span className="text-3xl font-black text-foreground">{(sub.appName || 'S').charAt(0)}</span>
              </div>
            )}
          </div>

          {/* Name & Status */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground truncate max-w-full">
            {sub.appName}
          </h1>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {sub.paused ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
                <Pause size={12} strokeWidth={2.5} />
                Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-success/15 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Active
              </span>
            )}

            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/10">
              {sub.cycle}
            </span>

            {sub.autoRenew === false && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                One-Time / Non-Recurring
              </span>
            )}

            {sub.autoPay ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Zap size={11} />
                Auto-Pay: {sub.autoPayPlatform || 'Active'}
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border/10">
                Manual Pay
              </span>
            )}

            {sub.category && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border/10">
                {sub.category}
              </span>
            )}
          </div>

          {/* Big Price Display */}
          <div className="mt-4 flex items-baseline justify-center gap-1.5 text-foreground">
            <span className="text-4xl font-black tabular-nums tracking-tight">
              {currency.symbol}{Number(sub.amount).toLocaleString(currency.locale)}
            </span>
            <span className="text-base font-semibold text-muted-foreground">
              / {sub.cycle === 'lifetime' ? 'one-time' : sub.cycle.replace('ly', '').replace('i', 'y')}
            </span>
          </div>

          {/* Monthly / Yearly Equivalent */}
          {sub.cycle !== 'lifetime' && (
            <p className="text-xs text-muted-foreground/80 font-medium mt-1">
              {sub.cycle === 'monthly'
                ? `≈ ${currency.symbol}${yearlyEquivalent.toLocaleString(currency.locale, { maximumFractionDigits: 0 })} / year`
                : `≈ ${currency.symbol}${monthlyEquivalent.toLocaleString(currency.locale, { maximumFractionDigits: 0 })} / month`}
            </p>
          )}

          {/* Free Trial Banner if active */}
          {sub.freeTrial && (
            <div className="mt-4 w-full rounded-2xl bg-primary/10 border border-primary/20 p-3 text-left flex items-start gap-3">
              <Gift size={16} className="text-primary shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-primary">Free Trial Active</p>
                <p className="text-muted-foreground mt-0.5">
                  Ends on {formatFullDate(sub.trialEndDate)} ({renewalInfo.statusText}). First payment starts after trial.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── QUICK ACTION BUTTONS (NO GLOW — CLEAN FLAT) ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleMarkPaid}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-bold border border-primary/30 active:scale-98 transition-all hover:brightness-105"
          >
            <Check size={18} strokeWidth={2.5} />
            <span>Mark Paid</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onTogglePause(sub.id);
              setSub(prev => ({ ...prev, paused: !prev.paused }));
              toast(sub.paused ? 'Subscription resumed' : 'Subscription paused');
            }}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground font-bold border border-border/15 active:scale-98 transition-all"
          >
            {sub.paused ? (
              <>
                <Play size={16} />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause size={16} />
                <span>Pause</span>
              </>
            )}
          </button>
        </div>

        {/* ── DETAILS BREAKDOWN CARD (CLEAN BORDER — NO GLOW) ── */}
        <div className="space-y-2">
          <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground px-1">
            Subscription Details
          </h2>
          
          <div className="rounded-3xl border border-border/15 bg-card overflow-hidden divide-y divide-border/10">
            {/* Next Renewal */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Clock size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Next Renewal</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-foreground">
                  {renewalInfo.label}
                </span>
                {renewalInfo.statusText && sub.cycle !== 'lifetime' && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block bg-secondary text-muted-foreground border border-border/10">
                    {renewalInfo.statusText}
                  </span>
                )}
              </div>
            </div>

            {/* Billing Frequency & Auto-Renew */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Repeat size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Billing Frequency</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-foreground capitalize">
                  {sub.cycle}
                </span>
                {sub.autoRenew === false && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    No recurring renewal
                  </span>
                )}
              </div>
            </div>

            {/* Payment Mode Used */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <CreditCard size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Payment Mode Used</span>
              </div>
              <div className="flex items-center gap-1.5">
                {currentAccount ? (
                  <>
                    <span className="text-xs font-bold text-foreground truncate max-w-[130px]">
                      {currentAccount.name}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground px-2 py-0.5 rounded-md bg-secondary/80 border border-border/10">
                      {currentAccount.type}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">
                    Default Account
                  </span>
                )}
              </div>
            </div>

            {/* Auto-Pay Mandate */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Zap size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Auto-Pay Active</span>
              </div>
              <div className="flex items-center gap-1.5">
                {sub.autoPay ? (
                  <>
                    <span className="text-xs font-bold text-foreground">
                      {sub.autoPayPlatform || 'Active'}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      ON
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">
                    Off (Manual)
                  </span>
                )}
              </div>
            </div>

            {/* Category */}
            {sub.category && (
              <div className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Tag size={16} className="text-primary shrink-0" />
                  <span className="text-xs font-semibold">Category</span>
                </div>
                <span className="text-xs font-bold text-foreground">
                  {sub.category}
                </span>
              </div>
            )}

            {/* Free Trial Status */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Gift size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Free Trial</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {sub.freeTrial 
                  ? `Active (Ends ${formatFullDate(sub.trialEndDate)})` 
                  : 'None'}
              </span>
            </div>

            {/* Total Paid So Far */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Receipt size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Total Paid So Far</span>
              </div>
              <span className="text-xs font-bold text-foreground tabular-nums">
                {currency.symbol}{totalPaid.toLocaleString(currency.locale)}
              </span>
            </div>

            {/* Total Payments Count */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Check size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Payments Recorded</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
              </span>
            </div>

            {/* Started On */}
            <div className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar size={16} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Started On</span>
              </div>
              <span className="text-xs font-bold text-foreground">
                {formatFullDate(sub.startDate || sub.createdAt)}
              </span>
            </div>
          </div>

          {/* Notes Card if present */}
          {sub.notes && (
            <div className="rounded-2xl border border-border/15 bg-card/60 p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText size={12} />
                Notes
              </p>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {sub.notes}
              </p>
            </div>
          )}
        </div>

        {/* ── PREVIOUS PAYMENTS MADE SECTION ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Previous Payments Made
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/80 text-muted-foreground">
                {payments.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setManualRecordDate(new Date().toISOString().split('T')[0]);
                setManualRecordAmount(String(sub.amount || ''));
                setShowRecordModal(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline active:scale-95 transition-all"
            >
              <Plus size={13} />
              <span>Record Payment</span>
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/30 p-8 text-center bg-card/40">
              <div className="w-12 h-12 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-3 text-muted-foreground/60">
                <Receipt size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">No payments recorded yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
                Payments are automatically saved to your expense history when renewals arrive, or you can record one manually.
              </p>
              <button
                type="button"
                onClick={handleMarkPaid}
                className="mt-4 px-4 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-xs font-bold text-foreground transition-all active:scale-95 border border-border/15 inline-flex items-center gap-1.5"
              >
                <Check size={14} className="text-success" />
                Record First Payment
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-border/15 bg-card overflow-hidden divide-y divide-border/10">
              {payments.map((p) => {
                const pAccount = accounts.find(a => a.id === p.accountId);
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0 border border-border/10">
                        <Calendar size={15} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {formatFullDate(p.date)}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {pAccount?.name ? `Via ${pAccount.name}` : 'Subscription renewal'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold text-foreground tabular-nums">
                          {currency.symbol}{Number(p.amount).toLocaleString(currency.locale)}
                        </p>
                        <span className="text-[9px] font-bold text-success uppercase tracking-wider px-1.5 py-0.5 rounded bg-success/15 border border-success/30 inline-block mt-0.5">
                          Paid
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p.id)}
                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all"
                        title="Delete payment record"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── DANGER ZONE / DELETE BUTTON ── */}
        <div className="pt-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full h-12 rounded-2xl bg-destructive/10 hover:bg-destructive/15 text-destructive font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-destructive/20 active:scale-98 transition-all"
          >
            <Trash2 size={15} />
            <span>Delete Subscription</span>
          </button>
        </div>

      </div>

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 z-[10006] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="w-full max-w-sm rounded-[2rem] bg-card p-6 border border-border/15 shadow-xl space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center mx-auto mb-2">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-foreground">Delete {sub.appName}?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                This will remove the subscription from your tracked cycles. Previously recorded expenses will remain in your transaction history.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="h-12 rounded-xl bg-secondary text-foreground font-bold text-xs hover:bg-secondary/80 active:scale-95 transition-all"
              >
                Keep It
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(sub.id);
                  setShowDeleteConfirm(false);
                  onClose();
                  toast.success('Subscription removed');
                }}
                className="h-12 rounded-xl bg-destructive text-white font-bold text-xs uppercase tracking-wider active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD PAYMENT MODAL ── */}
      {showRecordModal && (
        <div 
          className="fixed inset-0 z-[10006] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowRecordModal(false)}
        >
          <div 
            className="w-full max-w-sm rounded-[2rem] bg-card p-6 border border-border/15 shadow-xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 border-b border-border/10">
              <h3 className="text-base font-bold text-foreground">Record Payment</h3>
              <button
                type="button"
                onClick={() => setShowRecordModal(false)}
                className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Amount ({currency.symbol})
                </label>
                <input
                  type="number"
                  step="any"
                  value={manualRecordAmount}
                  onChange={e => setManualRecordAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-12 rounded-xl bg-secondary/50 border border-border/15 px-4 text-sm font-bold text-foreground outline-none focus:border-border/40"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={manualRecordDate}
                  onChange={e => setManualRecordDate(e.target.value)}
                  className="w-full h-12 rounded-xl bg-secondary/50 border border-border/15 px-4 text-sm font-semibold text-foreground outline-none focus:border-border/40"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleRecordManualPayment}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider active:scale-95 transition-all"
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SUBSCRIPTION USING SubscriptionFormModal ── */}
      <SubscriptionFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        initialData={sub}
        title="Edit Subscription"
        onSave={handleSaveEdit}
      />

    </div>,
    document.body
  );
}
