import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, MessageSquare, Pencil, Send, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useToast } from '@/hooks/use-toast';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAdFree } from '@/hooks/useAdFree';
import { cn } from '@/lib/utils';
import {
  generateId,
  getAccountProfile,
  getFriendGroups,
  getPersonalExpenses,
  getSmsTransactions,
  getUniquePersonNames,
  removeSmsTransaction,
  savePersonalExpense,
  saveSharedExpense,
  getDefaultAccountId,
  getAccounts,
  isDemoMode,
  syncDemoTransactions,
  DEMO_SMS_TRANSACTIONS,
  type SmsTargetTab,
  type SmsTransactionCandidate,
} from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';
import { SmsTransactions } from '@/plugins/SmsTransactionPlugin';

interface SmsTransactionsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

const SMS_CAPTURE_ENABLED_KEY = 'splitmate_sms_capture_enabled';
const SMS_AUTO_APPROVE_KEY = 'splitmate_sms_auto_approve_enabled';
const SMS_DEMO_EMAIL = 'sandeshkullolli4@gmail.com';

import {
  extractAmount,
  inferDirection,
  extractCounterparty,
  getTransactionTitle,
  getPaymentAppLabel,
  getMerchantIcon,
  getTransactionCategory,
  type TransactionDirection,
  type SmsCategory,
} from '@/lib/smsParser';

type PermissionStatus = 'unknown' | 'granted' | 'denied';

const CATEGORY_STYLES: Record<SmsCategory, string> = {
  Food: 'bg-orange-500/10 text-orange-600 border-orange-500/15',
  Transport: 'bg-sky-500/10 text-sky-600 border-sky-500/15',
  Shopping: 'bg-pink-500/10 text-pink-600 border-pink-500/15',
  Utilities: 'bg-amber-500/10 text-amber-700 border-amber-500/15',
  Entertainment: 'bg-violet-500/10 text-violet-600 border-violet-500/15',
  Income: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/15',
  Cash: 'bg-lime-500/10 text-lime-700 border-lime-500/15',
  Transfer: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/15',
  Other: 'bg-secondary/60 text-muted-foreground border-border/20',
};

const CATEGORY_BADGE_LABELS: Record<SmsCategory, string> = {
  Food: 'Food 🍕',
  Transport: 'Transport 🚗',
  Shopping: 'Shopping 🛍️',
  Utilities: 'Utilities ⚡',
  Entertainment: 'Entertainment 🎬',
  Income: 'Income 💼',
  Cash: 'Cash 💵',
  Transfer: 'Transfer 💸',
  Other: 'Other 📋',
};

const formatCurrencyAmount = (amount: number) => new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
}).format(amount);


const getEditableTransactionName = (item: SmsTransactionCandidate) => {
  const direction = inferDirection(item.body);
  const counterparty = extractCounterparty(item.body, direction, item.sourceAddress, item.name);
  const title = getTransactionTitle(item.body, direction, counterparty);
  return title.replace(/^(From|To)\s+/i, '');
};

const getTransactionDisplayMeta = (item: SmsTransactionCandidate) => {
  const direction = inferDirection(item.body);
  const counterparty = extractCounterparty(item.body, direction, item.sourceAddress, item.name);
  const category = getTransactionCategory(item.body, counterparty, item.reason, item.name, item.sourceAddress);
  const paymentApp = getPaymentAppLabel(item.body, item.reason, item.name, item.sourceAddress);
  const merchantIcon = getMerchantIcon(counterparty, paymentApp);
  const amountPrefix = direction === 'credit' ? '+' : '-';
  const amountClassName = direction === 'credit' ? 'text-green-500' : 'text-red-500';

  return {
    title: getTransactionTitle(item.body, direction, counterparty),
    category,
    categoryLabel: CATEGORY_BADGE_LABELS[category],
    categoryClassName: CATEGORY_STYLES[category],
    paymentApp,
    merchantIcon,
    amountLabel: `${amountPrefix}₹${formatCurrencyAmount(Math.abs(item.amount))}`,
    amountClassName,
    direction,
    counterparty,
  };
};

const getAutoApprovedPersonalExpense = (item: SmsTransactionCandidate) => {
  const direction = inferDirection(item.body);
  const counterparty = extractCounterparty(item.body, direction, item.sourceAddress, item.name);
  const category = direction === 'credit' ? 'Income' : getTransactionCategory(item.body, counterparty, item.reason, item.name, item.sourceAddress);

  return {
    reason: getTransactionTitle(item.body, direction, counterparty),
    category,
    isIncome: direction === 'credit',
  };
};

const isDuplicateAutoApprovedPersonal = (
  item: SmsTransactionCandidate & { timestamp: number },
  approved: ReturnType<typeof getAutoApprovedPersonalExpense>,
): boolean => {
  const existingPersonal = getPersonalExpenses();

  return existingPersonal.some((expense) => {
    if (expense.source !== 'sms') return false;

    if (expense.smsExternalId && expense.smsExternalId === item.externalId) {
      return true;
    }

    const expenseTime = new Date(expense.createdAt || expense.date).getTime();
    if (!Number.isFinite(expenseTime)) return false;

    const closeInTime = Math.abs(expenseTime - item.timestamp) <= 60_000;
    const sameAmount = Math.abs(expense.amount - item.amount) < 0.01;
    const sameDirection = Boolean(expense.isIncome) === approved.isIncome;
    const sameReason = (expense.reason || '').trim().toLowerCase() === approved.reason.trim().toLowerCase();

    return closeInTime && sameAmount && sameDirection && sameReason;
  });
};

const parseLocalDate = (dateValue: string) => {
  const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatTransactionDate = (dateValue: string) => {
  const date = parseLocalDate(dateValue);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfTransaction = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfTransaction.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfTransaction.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};


export function SmsTransactionsTab({ onOpenAccount, onBack, bannerAdActive = true }: SmsTransactionsTabProps) {
  useBannerAd(bannerAdActive);
  const { isAdFree } = useAdFree();
  const { toast } = useToast();

  const [items, setItems] = useState<SmsTransactionCandidate[]>(getSmsTransactions());
  const [editing, setEditing] = useState<SmsTransactionCandidate | null>(null);
  const [smsCaptureEnabled, setSmsCaptureEnabled] = useState(() => {
    const storedValue = localStorage.getItem(SMS_CAPTURE_ENABLED_KEY);
    return storedValue === null ? true : storedValue === 'true';
  });
  const [smsAutoApproveEnabled, setSmsAutoApproveEnabled] = useState(() => {
    const storedValue = localStorage.getItem(SMS_AUTO_APPROVE_KEY);
    return storedValue === null ? true : storedValue === 'true';
  });
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [targetTab, setTargetTab] = useState<SmsTargetTab>('personal');
  const [targetPersonName, setTargetPersonName] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDirection, setDraftDirection] = useState<TransactionDirection>('debit');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const visibleItems = items;

  const groups = useMemo(() => getFriendGroups(), []);
  const persons = useMemo(() => getUniquePersonNames().filter((name) => name !== 'me'), []);

  const openEditor = useCallback((item: SmsTransactionCandidate) => {
    setEditing(item);
    setDraftReason(item.reason);
    setDraftName(getEditableTransactionName(item));
    setDraftDirection(inferDirection([item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ')));
    setDraftAmount(String(item.amount));
    setDraftDate(item.date);
    setTargetTab(item.targetTab || 'personal');
    setTargetPersonName(item.targetPersonName || persons[0] || '');
    setTargetGroupId(item.targetGroupId || groups[0]?.id || '');
  }, [persons, groups]);
  useBackHandler(!!editing, () => setEditing(null));
  useBackHandler(showDisclosure, () => setShowDisclosure(false));

  const refresh = () => setItems(getSmsTransactions());

  const normalizeSmsReason = (body: string): string => {
    const compact = body.replace(/\s+/g, ' ').trim();
    if (!compact) return 'SMS Transaction';
    return compact.length > 60 ? `${compact.slice(0, 60)}...` : compact;
  };

  const normalizeSmsName = (address: string): string => {
    const cleaned = address.replace(/[^a-zA-Z0-9]/g, '').trim();
    if (!cleaned) return 'SMS';
    return cleaned.length > 24 ? cleaned.slice(0, 24) : cleaned;
  };

  useEffect(() => {
    const sync = () => refresh();
    const handleOpenTransaction = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string; transactionId?: string }>).detail;
      if (!detail || detail.tabId !== 'sms-transactions' || !detail.transactionId) return;
      const target = getSmsTransactions().find((item) => item.id === detail.transactionId);
      if (!target) return;
      openEditor(target);
    };

    const syncPermissionState = async () => {
      if (!Capacitor.isNativePlatform()) {
        setPermissionStatus('denied');
        return;
      }

      try {
        const status = await SmsTransactions.checkSmsPermissions();
        setPermissionStatus(status.granted ? 'granted' : 'denied');
      } catch {
        setPermissionStatus('denied');
      }
    };

    window.addEventListener('splitmate_sms_transactions_changed', sync);
    window.addEventListener('splitmate_open_transaction', handleOpenTransaction);
    void syncPermissionState();

    return () => {
      window.removeEventListener('splitmate_sms_transactions_changed', sync);
      window.removeEventListener('splitmate_open_transaction', handleOpenTransaction);
    };
  }, [openEditor]);

  useEffect(() => {
    localStorage.setItem(SMS_CAPTURE_ENABLED_KEY, String(smsCaptureEnabled));
    window.dispatchEvent(new Event('splitmate_sms_capture_changed'));

    if (!smsCaptureEnabled) {
      window.dispatchEvent(new Event('splitmate_sms_capture_disabled'));
    }
  }, [smsCaptureEnabled]);

  useEffect(() => {
    localStorage.setItem(SMS_AUTO_APPROVE_KEY, String(smsAutoApproveEnabled));
    window.dispatchEvent(new Event('splitmate_sms_auto_approve_changed'));
    syncDemoTransactions(smsAutoApproveEnabled);
  }, [smsAutoApproveEnabled]);

  const requestPermissionAndEnable = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: 'SMS capture unavailable',
        description: 'SMS permissions are only available on Android native builds.',
        variant: 'destructive',
      });
      setShowDisclosure(false);
      return;
    }

    try {
      const result = await SmsTransactions.requestSmsPermissions();
      if (!result.granted) {
        setPermissionStatus('denied');
        toast({
          title: 'Permission not granted',
          description: 'Enable SMS permission in system settings to use auto capture.',
          variant: 'destructive',
        });
        return;
      }

      setPermissionStatus('granted');
      setSmsCaptureEnabled(true);
      window.dispatchEvent(new Event('splitmate_sms_permission_granted'));
      toast({
        title: 'SMS capture enabled',
        description: 'Only financial transaction SMS are processed and stored as minimal records on this device.',
      });
    } catch {
      setPermissionStatus('denied');
      toast({
        title: 'SMS permission failed',
        description: 'Could not enable SMS permission right now.',
        variant: 'destructive',
      });
    } finally {
      setShowDisclosure(false);
    }
  };

  const handleSmsCaptureToggle = () => {
    if (smsCaptureEnabled) {
      setSmsCaptureEnabled(false);
      return;
    }

    if (permissionStatus === 'granted') {
      setSmsCaptureEnabled(true);
      window.dispatchEvent(new Event('splitmate_sms_permission_granted'));
      return;
    }

    setShowDisclosure(true);
  };


  const discardItem = () => {
    if (!editing) return;

    if (editing.id.startsWith('demo-sms-')) {
      try {
        const stored = localStorage.getItem('splitmate_processed_demo_sms_ids');
        const ids = stored ? JSON.parse(stored) : [];
        if (!ids.includes(editing.id)) {
          ids.push(editing.id);
          localStorage.setItem('splitmate_processed_demo_sms_ids', JSON.stringify(ids));
        }
      } catch (e) {
        console.error(e);
      }
    }

    removeSmsTransaction(editing.id);
    setEditing(null);
    refresh();
  };

  const approveItem = () => {
    if (!editing) return;

    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a valid amount before approving.',
        variant: 'destructive',
      });
      return;
    }

    const finalReason = draftReason.trim() || draftName.trim() || 'SMS Transaction';
    const finalDate = draftDate || new Date().toISOString().split('T')[0];

    if (targetTab === 'personal') {
      savePersonalExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        date: finalDate,
        createdAt: new Date().toISOString(),
        isIncome: draftDirection === 'credit',
        source: 'sms',
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (targetTab === 'split') {
      if (!targetPersonName) {
        toast({
          title: 'Choose person',
          description: 'Select an existing person to move this transaction.',
          variant: 'destructive',
        });
        return;
      }

      saveSharedExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        paidBy: 'me',
        forPerson: targetPersonName,
        personName: targetPersonName,
        date: finalDate,
        createdAt: new Date().toISOString(),
        settled: false,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (targetTab === 'group') {
      const group = groups.find((item) => item.id === targetGroupId);
      if (!group) {
        toast({
          title: 'Choose group',
          description: 'Select an existing group to move this transaction.',
          variant: 'destructive',
        });
        return;
      }

      saveSharedExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        paidBy: 'me',
        forPerson: 'all',
        personName: group.members.find((member) => member !== 'me') || group.name,
        date: finalDate,
        createdAt: new Date().toISOString(),
        settled: false,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        groupId: group.id,
        splitParticipants: group.members,
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (editing.id.startsWith('demo-sms-')) {
      try {
        const stored = localStorage.getItem('splitmate_processed_demo_sms_ids');
        const ids = stored ? JSON.parse(stored) : [];
        if (!ids.includes(editing.id)) {
          ids.push(editing.id);
          localStorage.setItem('splitmate_processed_demo_sms_ids', JSON.stringify(ids));
        }
      } catch (e) {
        console.error(e);
      }
    }
    removeSmsTransaction(editing.id);

    setEditing(null);
    refresh();
    toast({ title: 'Moved', description: 'SMS transaction was moved successfully.' });
  };

  return (
    <div className="p-4 pb-40 space-y-5 font-sans">
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl flex items-center justify-center mt-1 bg-secondary/80 border border-border/10 active:scale-95 transition-all shadow-sm"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight leading-none">SMS Transactions</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80 max-w-[300px] leading-tight">
              Auto-added SMS debits appear here. Review and move each one manually.
            </p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      <div className="ios-card-modern p-3.5 space-y-4">
        {/* SMS Capture Row */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-3.5">
            <MessageSquare size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                SMS capture
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-medium leading-tight">
                {smsCaptureEnabled
                  ? 'On now. Only financial SMS are parsed on-device and queued in SMS Transactions.'
                  : 'Off now. Turn on to explicitly grant permission and capture financial SMS.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={smsCaptureEnabled}
            onClick={handleSmsCaptureToggle}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition-all duration-200',
              smsCaptureEnabled
                ? 'border-white/25 bg-white/20'
                : 'border-border/15 bg-background/70',
            )}
          >
            <span
              className={cn(
                'relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform duration-200',
                smsCaptureEnabled
                  ? 'translate-x-5 bg-white'
                  : 'translate-x-0 bg-muted-foreground/70',
              )}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/5 my-1" />

        {/* Auto Approve Row */}
        <div className={cn(
          'flex items-center justify-between gap-2.5 transition-all duration-200',
          !smsCaptureEnabled && 'opacity-50'
        )}>
          <div className="flex min-w-0 items-center gap-3.5">
            <Check size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                Auto approve transactions
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-medium leading-tight">
                {smsCaptureEnabled
                  ? 'Send captured SMS entries straight to Personal. Credits are counted as income.'
                  : 'Enable SMS capture first to use auto approval.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={smsAutoApproveEnabled}
            disabled={!smsCaptureEnabled}
            onClick={() => {
              if (!smsCaptureEnabled) return;
              setSmsAutoApproveEnabled((value) => !value);
            }}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition-all duration-200',
              !smsCaptureEnabled
                ? 'cursor-not-allowed border-border/10 bg-background/40'
                : smsAutoApproveEnabled
                  ? 'border-white/25 bg-white/20'
                  : 'border-border/15 bg-background/70',
            )}
          >
            <span
              className={cn(
                'relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform duration-200',
                smsAutoApproveEnabled
                  ? 'translate-x-5 bg-white'
                  : 'translate-x-0 bg-muted-foreground/70',
              )}
            />
          </button>
        </div>
      </div>

      {!smsCaptureEnabled && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Prominent Disclosure</p>
          <p className="text-xs text-foreground font-medium leading-relaxed">
            SplitMate requests READ_SMS only to detect financial transaction SMS (for example bank debit/credit and UPI alerts) and queue them in SMS Transactions for your manual review.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We process messages on-device, keep minimal derived details (amount, date, sender, short masked snippet), and do not use non-financial SMS.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-primary" />
            Pending Transactions
          </h3>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            {visibleItems.length} pending
          </span>
        </div>

        {visibleItems.length === 0 ? (
          <div className="space-y-1 py-2">
            <p className="text-sm font-medium text-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground">We&apos;ll automatically detect your SMS payments here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item, idx) => {
              const meta = getTransactionDisplayMeta(item);

              return (
                <div key={item.id} className="flex flex-col gap-2">
                  <div className="relative overflow-hidden rounded-2xl bg-card px-3 py-3 shadow-sm transition-all duration-200 border border-border/10">
                    <div className="relative flex items-start gap-3">
                      <div className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                        meta.direction === 'credit'
                          ? 'border-emerald-500/10 bg-emerald-500/5 text-emerald-500'
                          : 'border-rose-500/10 bg-rose-500/5 text-rose-500',
                      )}>
                        {meta.direction === 'credit' ? <Send size={14} strokeWidth={2.2} className="rotate-180" /> : <Send size={14} strokeWidth={2.2} />}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-1.5">
                            <span className="text-sm leading-none" aria-hidden="true">{meta.merchantIcon}</span>
                            <p className="text-[15px] font-semibold text-foreground truncate">
                              {meta.title}
                            </p>
                          </div>
                        </div>

                        {/* From & To analysis */}
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground/80 font-medium">
                          <span>From:</span>
                          <span className="text-foreground font-semibold">
                            {meta.direction === 'credit' ? meta.counterparty : (meta.paymentApp !== 'SMS' ? meta.paymentApp : (item.name || 'My Account'))}
                          </span>
                          <span className="text-muted-foreground/30 mx-0.5">➔</span>
                          <span>To:</span>
                          <span className="text-foreground font-semibold">
                            {meta.direction === 'debit' ? meta.counterparty : (meta.paymentApp !== 'SMS' ? meta.paymentApp : (item.name || 'My Account'))}
                          </span>
                        </div>

                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
                            meta.direction === 'credit'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/15'
                              : 'bg-rose-500/10 text-rose-500 border border-rose-500/15'
                          )}>
                            {meta.direction === 'credit' ? 'Received' : 'Sent'}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-border/10 bg-background/70 px-2 py-0.5 text-[9px] font-bold text-muted-foreground/95">
                            {meta.paymentApp}
                          </span>
                          {item.id.startsWith('demo-sms-') && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-500">
                              Demo SMS
                            </span>
                          )}
                        </div>

                        {/* Original SMS text preview */}
                        <div className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70 italic border-l border-border/20 pl-2 py-0.5 bg-secondary/20 rounded-r-md pr-1.5">
                          "{item.body}"
                        </div>
                      </div>

                      <div className="relative flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                        <span className={cn('text-[15px] font-bold tracking-tight tabular-nums', meta.amountClassName)}>
                          {meta.amountLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground/70">
                            {formatTransactionDate(item.date)}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditor(item)}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-border/20 bg-transparent text-foreground/70 opacity-70 transition-opacity hover:opacity-100"
                          >
                            <Pencil size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!isAdFree && idx % 5 === 0 && (
                    <div className="pt-1">
                      <NativeAdCard />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>


      {editing && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 pb-8 space-y-4 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight">Edit SMS Transaction</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Name</label>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Amount</label>
                <input type="number" value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Date</label>
                <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Reason</label>
              <input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'debit', label: 'Debit', tone: 'rose' },
                  { id: 'credit', label: 'Credit', tone: 'emerald' },
                ] as Array<{ id: TransactionDirection; label: string; tone: 'rose' | 'emerald' }>).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraftDirection(option.id)}
                    className={cn(
                      'h-11 rounded-2xl border text-[10px] font-black uppercase tracking-wider transition-all',
                      draftDirection === option.id
                        ? option.tone === 'emerald'
                          ? 'bg-emerald-500/12 text-emerald-600 border-emerald-500/25 shadow-sm'
                          : 'bg-rose-500/12 text-rose-500 border-rose-500/25 shadow-sm'
                        : 'bg-secondary/20 border-border/10 text-muted-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Move To</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'personal', label: 'Personal' },
                  { id: 'split', label: 'Split' },
                  { id: 'group', label: 'Group' },
                ] as Array<{ id: SmsTargetTab; label: string }>).map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setTargetTab(target.id)}
                    className={cn(
                      'h-10 rounded-xl border text-[10px] font-black uppercase tracking-wider',
                      targetTab === target.id ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary/20 border-border/10 text-muted-foreground',
                    )}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            </div>

            {targetTab === 'split' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">For Person</label>
                <div className="max-h-48 overflow-y-auto rounded-3xl border border-border/15 bg-secondary/20 p-2 space-y-2">
                  {persons.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-muted-foreground text-center">
                      No people available
                    </div>
                  ) : (
                    persons.map((name) => {
                      const selected = targetPersonName === name;
                      const initial = name.trim().charAt(0).toUpperCase() || '?';

                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setTargetPersonName(name)}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.99]',
                            selected
                              ? 'border-primary/30 bg-primary/10 shadow-sm'
                              : 'border-transparent bg-background/40 hover:bg-background/60',
                          )}
                        >
                          <span className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black',
                            selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                          )}>
                            {initial}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                            <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {selected ? 'Selected' : 'Tap to choose'}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {targetTab === 'group' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">For Group</label>
                <select
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold"
                >
                  <option value="">Select group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={discardItem}
                className="h-11 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[10px] font-black uppercase tracking-wider"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={approveItem}
                className="h-11 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2"
              >
                <Check size={14} />
                Approve
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showDisclosure && createPortal(
        <div className="fixed inset-0 z-[10004] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDisclosure(false)}>
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 pb-8 space-y-4 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold tracking-tight">Enable SMS Capture</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                SplitMate needs SMS permission to detect financial transaction alerts and place them in SMS Transactions for review.
              </p>
              <p>
                Stored location: local app storage on this device. Stored fields: amount, date, sender, and a short masked message snippet.
              </p>
              <p>
                We only process bank/payment transaction SMS and ignore unrelated messages.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDisclosure(false)}
                className="h-11 rounded-2xl bg-secondary/60 border border-border/20 text-[10px] font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestPermissionAndEnable}
                className="h-11 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider"
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
