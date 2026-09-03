import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CalendarClock,
  ChevronLeft,
  CircleDot,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import {
  EXPENSE_CATEGORIES,
  FREE_LIMITS,
  generateId,
  getAccountSummaries,
  getRecurringPayments,
  saveRecurringPayment,
  deleteRecurringPayment,
  type RecurringFrequency,
  type RecurringPayment,
  type RecurringType,
  getAccounts,
} from '@/lib/storage';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';
import { cn } from '@/lib/utils';

interface RecurringPaymentsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

interface FormState {
  id?: string;
  name: string;
  amount: string;
  type: RecurringType;
  frequency: RecurringFrequency;
  dayOfPeriod: string;
  monthOfYear: string;
  accountId: string;
  category: string;
  enabled: boolean;
  recurrenceMode: 'infinite' | 'once' | 'custom';
  totalOccurrences: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  amount: '',
  type: 'expense',
  frequency: 'monthly',
  dayOfPeriod: '1',
  monthOfYear: '1',
  accountId: '',
  category: 'General',
  enabled: true,
  recurrenceMode: 'infinite',
  totalOccurrences: '5',
};

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getNextDueLabel(payment: RecurringPayment): string {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const lastDate = payment.lastProcessedDate;

  if (payment.frequency === 'daily') {
    return 'Due Daily';
  }
  if (payment.frequency === 'weekly') {
    const dayName = DAYS_OF_WEEK[payment.dayOfPeriod] ?? 'Day';
    return `Due Every ${dayName}`;
  }
  if (payment.frequency === 'monthly') {
    const d = payment.dayOfPeriod;
    const targetThisMonth = new Date(now.getFullYear(), now.getMonth(), d);
    if (targetThisMonth >= now || lastDate === todayStr) {
      return `Due ${getOrdinal(d)} of month`;
    }
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, d);
    return `Due ${nextMonth.toLocaleDateString('en', { day: '2-digit', month: 'short' })}`;
  }
  if (payment.frequency === 'yearly') {
    const m = payment.monthOfYear ?? 1;
    const d = payment.dayOfPeriod;
    const thisYear = now.getFullYear();
    const targetDate = new Date(thisYear, m - 1, d);
    if (targetDate >= now) return `Due ${targetDate.toLocaleDateString('en', { day: '2-digit', month: 'short' })}`;
    const nextYear = new Date(thisYear + 1, m - 1, d);
    return `Due ${nextYear.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }
  return 'Recurring';
}

export function RecurringPaymentsTab({ onOpenAccount, onBack, bannerAdActive = true }: RecurringPaymentsTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const currency = useCurrency();
  const [payments, setPayments] = useState<RecurringPayment[]>(() => getRecurringPayments());
  const [accounts, setAccounts] = useState(() => getAccountSummaries());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useBackHandler(showForm, () => setShowForm(false));
  useBackHandler(!!deleteId, () => setDeleteId(null));

  useEffect(() => {
    const sync = () => {
      setPayments(getRecurringPayments());
      setAccounts(getAccountSummaries());
    };
    sync();
    window.addEventListener('splitmate_recurring_changed', sync);
    window.addEventListener('splitmate_accounts_changed', sync);
    window.addEventListener('splitmate_data_changed', sync);
    return () => {
      window.removeEventListener('splitmate_recurring_changed', sync);
      window.removeEventListener('splitmate_accounts_changed', sync);
      window.removeEventListener('splitmate_data_changed', sync);
    };
  }, []);

  const [showFirstAccountModal, setShowFirstAccountModal] = useState(false);

  const openCreate = () => {
    if (getAccounts().length === 0) {
      setShowFirstAccountModal(true);
      return;
    }
    if (!isPro && payments.length >= FREE_LIMITS.MAX_RECURRING_PAYMENTS) {
      requestProUpgrade('recurring', 'Free users can add up to 1 recurring payment. Upgrade to Pro for unlimited recurring payments.');
      return;
    }
    const defaultAccount = accounts[0]?.id || '';
    setForm({ ...DEFAULT_FORM, accountId: defaultAccount });
    setShowForm(true);
  };

  const openEdit = (payment: RecurringPayment) => {
    setForm({
      id: payment.id,
      name: payment.name,
      amount: String(payment.amount),
      type: payment.type,
      frequency: payment.frequency,
      dayOfPeriod: String(payment.dayOfPeriod),
      monthOfYear: String(payment.monthOfYear ?? 1),
      accountId: payment.accountId,
      category: payment.category,
      enabled: payment.enabled,
      recurrenceMode: payment.recurrenceMode || 'infinite',
      totalOccurrences: String(payment.totalOccurrences || 5),
    });
    setShowForm(true);
  };

  const toggleEnabled = (payment: RecurringPayment) => {
    saveRecurringPayment({ ...payment, enabled: !payment.enabled });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) return;

    const existing = form.id ? payments.find(p => p.id === form.id) : null;
    const payment: RecurringPayment = {
      id: form.id || generateId(),
      name: form.name.trim(),
      amount,
      type: form.type,
      frequency: form.frequency,
      dayOfPeriod: Number(form.dayOfPeriod) || 1,
      monthOfYear: Number(form.monthOfYear) || 1,
      accountId: form.accountId,
      category: form.category,
      enabled: form.enabled,
      createdAt: existing?.createdAt || new Date().toISOString(),
      recurrenceMode: form.recurrenceMode,
      totalOccurrences: form.recurrenceMode === 'custom' ? Number(form.totalOccurrences) : undefined,
      timesProcessed: existing?.timesProcessed ?? 0,
      lastProcessedDate: existing?.lastProcessedDate,
    };

    saveRecurringPayment(payment);
    setShowForm(false);
    setForm(DEFAULT_FORM);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteRecurringPayment(deleteId);
    setDeleteId(null);
  };

  const promptDeleteFromEdit = () => {
    const id = form.id;
    if (!id) return;
    setShowForm(false);
    setTimeout(() => setDeleteId(id), 200);
  };

  const totalMonthlyIncome = payments
    .filter((p) => p.enabled && p.type === 'income' && p.frequency === 'monthly')
    .reduce((s, p) => s + p.amount, 0);

  const totalMonthlyExpense = payments
    .filter((p) => p.enabled && p.type === 'expense' && p.frequency === 'monthly')
    .reduce((s, p) => s + p.amount, 0);

  const isIncome = form.type === 'income';

  return (
    <div className="p-4 pb-48 space-y-5 font-sans min-h-screen">
      {/* ── HEADER ── */}
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all mt-0.5 flex-shrink-0"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-0.5">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Recurring<span className="text-primary">.</span></h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">Auto-post income &amp; expenses on schedule</p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      {/* ── SUMMARY STATS CARDS ── */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-4 flex flex-col justify-between"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--secondary) / 0.4))',
            border: '1px solid hsl(var(--border) / 0.3)',
            borderRadius: '1.75rem',
          }}
        >
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase font-black">
            01 · Monthly In
          </p>
          <p
            className="text-lg font-heading font-extrabold tracking-tight mt-3 tabular-nums"
            style={{ color: 'hsl(var(--success))' }}
          >
            +{currency.symbol}{totalMonthlyIncome.toLocaleString(currency.locale)}
          </p>
          <div className="h-0.5 w-6 mt-1 rounded-full opacity-40" style={{ background: 'hsl(var(--success))' }} />
        </div>

        <div
          className="p-4 flex flex-col justify-between"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--secondary) / 0.4))',
            border: '1px solid hsl(var(--border) / 0.3)',
            borderRadius: '1.75rem',
          }}
        >
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase font-black">
            02 · Monthly Out
          </p>
          <p
            className="text-lg font-heading font-extrabold tracking-tight mt-3 tabular-nums"
            style={{ color: 'hsl(var(--danger))' }}
          >
            -{currency.symbol}{totalMonthlyExpense.toLocaleString(currency.locale)}
          </p>
          <div className="h-0.5 w-6 mt-1 rounded-full opacity-40" style={{ background: 'hsl(var(--danger))' }} />
        </div>
      </div>

      {/* ── LIST OF PAYMENTS ── */}
      {payments.length === 0 ? (
        <div className="rounded-[2.5rem] border border-dashed border-border/20 p-10 text-center text-muted-foreground/60">
          <p className="text-sm font-semibold">No recurring payments yet</p>
          <p className="text-xs text-muted-foreground/40 mt-1">
            Tap the + button to schedule your salary, subscriptions, EMI, or rent.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((payment, index) => {
            const isLockedPayment = !isPro && index >= FREE_LIMITS.MAX_RECURRING_PAYMENTS;
            const inc = payment.type === 'income';
            const acct = accounts.find((a) => a.id === payment.accountId);
            const nextDue = getNextDueLabel(payment);
            return (
              <div
                key={payment.id}
                onClick={() => {
                  if (isLockedPayment) {
                    requestProUpgrade('recurring', 'Free users can add up to 1 recurring payment. Upgrade to Pro for unlimited recurring payments.');
                    return;
                  }
                  openEdit(payment);
                }}
                className={cn(
                  "relative overflow-hidden flex items-center justify-between p-4 active:scale-[0.97] transition-all duration-200 cursor-pointer",
                  isLockedPayment && "opacity-40"
                )}
                style={{
                  background: 'linear-gradient(to bottom right, hsl(var(--card)), hsl(var(--secondary) / 0.3))',
                  border: '1px solid hsl(var(--border) / 0.25)',
                  borderRadius: '1.75rem',
                  opacity: isLockedPayment ? 0.4 : payment.enabled ? 1 : 0.45,
                }}
              >
                {isLockedPayment && (
                  <>
                    <div className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center">
                      <Lock size={12} className="text-white" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestProUpgrade('recurring', 'Free users can add up to 1 recurring payment. Upgrade to Pro for unlimited recurring payments.');
                      }}
                      className="absolute inset-0 z-40 pointer-events-auto"
                      aria-label="Upgrade to unlock this recurring payment"
                    />
                  </>
                )}

                {/* Left: icon + info */}
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                    style={{
                      background: inc ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--danger) / 0.15)',
                      color: inc ? 'hsl(var(--success))' : 'hsl(var(--danger))',
                    }}
                  >
                    {inc ? <TrendingUp size={17} strokeWidth={2.5} /> : <TrendingDown size={17} strokeWidth={2.5} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm tracking-tight text-foreground">{payment.name}</p>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                      {FREQUENCY_LABELS[payment.frequency]}
                      {acct ? ` · ${acct.name}` : ''}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50 mt-1">
                      {nextDue}
                    </p>
                    {payment.recurrenceMode === 'once' && (
                      <span className="text-[8px] font-black uppercase text-primary tracking-widest mt-1 block">
                        Runs Once · {payment.timesProcessed ?? 0}/1 times
                      </span>
                    )}
                    {payment.recurrenceMode === 'custom' && (
                      <span className="text-[8px] font-black uppercase text-primary tracking-widest mt-1 block">
                        Custom Limit · {payment.timesProcessed ?? 0}/{payment.totalOccurrences ?? 0} times
                      </span>
                    )}
                    {(!payment.recurrenceMode || payment.recurrenceMode === 'infinite') && (
                      <span className="text-[8px] font-black uppercase text-muted-foreground/40 tracking-widest mt-1 block">
                        Until Pause
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: amount + actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right">
                    <p
                      className="font-heading font-extrabold text-base tabular-nums tracking-tight"
                      style={{ color: inc ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}
                    >
                      {inc ? '+' : '-'}{currency.symbol}{payment.amount.toLocaleString(currency.locale)}
                    </p>
                    <div
                      className="h-0.5 w-6 ml-auto mt-1 rounded-full opacity-30"
                      style={{ background: inc ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEnabled(payment);
                      }}
                      className={cn(
                        'w-7 h-7 rounded-xl border flex items-center justify-center transition-all active:scale-90',
                        payment.enabled
                          ? 'bg-primary/10 border-primary/20 text-primary'
                          : 'bg-secondary/30 border-border/10 text-muted-foreground/30',
                      )}
                      title={payment.enabled ? 'Disable' : 'Enable'}
                    >
                      <CircleDot size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(payment);
                      }}
                      className="w-7 h-7 rounded-xl border border-border/10 bg-secondary/50 flex items-center justify-center active:scale-90"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      {createPortal(
        (
          <button
            type="button"
            onClick={openCreate}
            className={cn(
              'fixed right-4 z-[60] w-14 h-14 rounded-2xl text-white shadow-2xl flex items-center justify-center active:scale-90 transition-all',
              onBack ? 'bottom-20' : 'bottom-[176px]',
            )}
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
              boxShadow: '0 8px 24px -6px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.15)',
              border: '1px solid hsl(var(--glass-border))',
            }}
            aria-label="Add Recurring Payment"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        ),
        document.body,
      )}

      {/* ── FULL-SCREEN ADD / EDIT FORM ── */}
      {showForm &&
        createPortal(
          <div className="fixed inset-0 z-[10002] flex flex-col bg-background animate-in slide-in-from-bottom-10 duration-500 font-sans">

            {/* Header bar */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-11 h-11 rounded-[1.5rem] bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
              <h1 className="text-lg font-black tracking-tight uppercase">
                {form.id ? 'Edit Recurring' : 'New Recurring'}
              </h1>
              {form.id ? (
                <button
                  type="button"
                  onClick={promptDeleteFromEdit}
                  className="w-11 h-11 rounded-[1.5rem] bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center active:scale-90 transition-all shadow-sm"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <div className="w-11" />
              )}
            </div>

            {/* Scrollable form content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

              {/* Income vs Expense toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-secondary/40 border border-border/10">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, type: 'expense' }))}
                  className={cn(
                    'h-10 rounded-xl font-bold text-xs transition-all',
                    !isIncome ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, type: 'income' }))}
                  className={cn(
                    'h-10 rounded-xl font-bold text-xs transition-all',
                    isIncome ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  Income
                </button>
              </div>

              {/* Amount hero input */}
              <div className="space-y-1 text-center">
                <p className="text-[10px] font-mono tracking-widest text-muted-foreground/60 uppercase font-black">
                  Amount ({currency.symbol})
                </p>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-3xl font-heading font-extrabold text-muted-foreground">{currency.symbol}</span>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-44 text-4xl font-heading font-extrabold text-center bg-transparent focus:outline-none placeholder:text-muted-foreground/20 tabular-nums"
                  />
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  Description / Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Netflix, Salary, PG Rent, SIP"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full h-12 rounded-2xl border border-border/15 bg-secondary/30 px-4 text-sm font-semibold focus:outline-none focus:border-primary text-foreground"
                />
              </div>

              {/* Frequency */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  Repeat Frequency
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, frequency: freq }))}
                      className={cn(
                        'h-11 rounded-2xl border text-xs font-bold transition-all',
                        form.frequency === freq
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {FREQUENCY_LABELS[freq]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day of period selector */}
              {form.frequency === 'weekly' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                    Day of the Week
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, dayOfPeriod: String(idx) }))}
                        className={cn(
                          'h-10 rounded-xl border text-xs font-bold transition-all',
                          Number(form.dayOfPeriod) === idx
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.frequency === 'monthly' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                    Day of Month (1 – 31)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={31}
                      value={form.dayOfPeriod}
                      onChange={(e) => setForm((prev) => ({ ...prev, dayOfPeriod: e.target.value }))}
                      className="flex-1 accent-primary cursor-pointer"
                    />
                    <span className="w-12 text-center text-sm font-mono font-bold bg-secondary/40 border border-border/15 py-1.5 rounded-xl">
                      {getOrdinal(Number(form.dayOfPeriod) || 1)}
                    </span>
                  </div>
                </div>
              )}

              {form.frequency === 'yearly' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                      Month of Year
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MONTHS.map((month, idx) => (
                        <button
                          key={month}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, monthOfYear: String(idx + 1) }))}
                          className={cn(
                            'h-9 rounded-xl border text-xs font-bold transition-all',
                            Number(form.monthOfYear) === idx + 1
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {month}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                      Day of Month ({getOrdinal(Number(form.dayOfPeriod) || 1)})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={31}
                      value={form.dayOfPeriod}
                      onChange={(e) => setForm((prev) => ({ ...prev, dayOfPeriod: e.target.value }))}
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Recurrence Mode Selector */}
              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  Recurrence Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'infinite', label: 'Until Pause' },
                    { id: 'once', label: '1 Time Only' },
                    { id: 'custom', label: 'Custom Times' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, recurrenceMode: m.id as 'infinite' | 'once' | 'custom' }))}
                      className={cn(
                        'h-11 rounded-2xl border text-xs font-bold transition-all',
                        form.recurrenceMode === m.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {form.recurrenceMode === 'custom' && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in zoom-in-95 duration-200">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                      Total Occurrences
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={form.totalOccurrences}
                      onChange={(e) => setForm((prev) => ({ ...prev, totalOccurrences: e.target.value }))}
                      placeholder="e.g. 5, 12, 36"
                      className="w-full h-11 rounded-2xl border border-border/15 bg-secondary/30 px-4 text-xs font-semibold focus:outline-none focus:border-primary text-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Linked Account */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  Target Account
                </label>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No accounts found. Create an account first.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {accounts.map((acct) => (
                      <button
                        key={acct.id}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, accountId: acct.id }))}
                        className={cn(
                          'h-12 rounded-2xl border px-3 text-left transition-all',
                          form.accountId === acct.id
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <p className="text-xs truncate">{acct.name}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{acct.type}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, category: cat }))}
                      className={cn(
                        'px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all',
                        form.category === cat
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-4 pb-8">
                <button
                  type="submit"
                  className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Save size={18} />
                  {form.id ? 'Save Changes' : 'Create Recurring Payment'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Delete Confirmation Modal */}
      {deleteId &&
        createPortal(
          <div
            className="fixed inset-0 z-[10003] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteId(null)}
          >
            <div
              className="w-full max-w-xs rounded-[2rem] border border-border/10 bg-card p-6 space-y-4 text-center animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Schedule?</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  This recurring rule will be removed. Past posted entries will remain.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="flex-1 h-11 rounded-2xl border border-border/15 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="flex-1 h-11 rounded-2xl bg-destructive text-white font-bold text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Modal to guide users to add an account if none exists */}
      <AddFirstAccountModal
        isOpen={showFirstAccountModal}
        onClose={() => setShowFirstAccountModal(false)}
        onAccountCreated={(acc) => {
          setShowFirstAccountModal(false);
          setAccounts(getAccountSummaries());
          setForm((prev) => ({ ...prev, accountId: acc.id }));
        }}
      />
    </div>
  );
}
