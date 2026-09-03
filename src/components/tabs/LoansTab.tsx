import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { 
  Landmark, Plus, Trash2, X, Info, ChevronRight, ChevronLeft, 
  History, CreditCard, Receipt, Clock, Save, Lock, ArrowUpRight, ArrowDownRight, 
  CheckCircle2, Calendar, Percent, User, ArrowRightLeft, Sparkles, Check
} from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { 
  generateId, 
  getLoans, 
  saveLoans, 
  getAccountSummaries, 
  getDefaultAccountId, 
  savePersonalExpense, 
  consumePendingOpenItem, 
  type LoanItem, 
  type LoanTransaction, 
  type PersonalExpense,
  FREE_LIMITS 
} from '@/lib/storage';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useBackHandler } from '@/hooks/useBackHandler';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';

interface LoansTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function LoansTab({ onOpenAccount, onBack, bannerAdActive = true, onScroll }: LoansTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const currency = useCurrency();
  const { toast } = useToast();

  const formatMoney = (amount: number) => {
    const formatted = Math.abs(amount).toLocaleString(currency.locale, { maximumFractionDigits: 2 });
    return `${currency.symbol}${formatted}`;
  };

  const getInterestStats = (loan: LoanItem) => {
    const start = new Date(loan.interestStartsOn);
    const end = new Date(loan.dueDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const rawDayDiff = Math.floor((end.getTime() - start.getTime()) / msPerDay);
    const days = Math.max(1, rawDayDiff + 1);
    const rateDecimal = (loan.interestRate || 0) / 100;

    const interest = loan.durationType === 'year'
      ? loan.outstandingPrincipal * rateDecimal * (days / 365)
      : loan.outstandingPrincipal * rateDecimal * (days / 30);

    const monthly = loan.durationType === 'year'
      ? (loan.outstandingPrincipal * rateDecimal) / 12
      : loan.outstandingPrincipal * rateDecimal;

    return { days, monthlyInterest: monthly, totalInterest: interest };
  };

  const normalizeLoan = (raw: LoanItem): LoanItem => {
    const loanName = raw.loanName || raw.personName || 'Loan';
    const direction = raw.direction === 'you-borrowed' ? 'you-borrowed' : 'you-gave';
    const principal = Number(raw.principal) || 0;
    const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
    const outstanding = Number(raw.outstandingPrincipal);
    return {
      ...raw,
      loanName,
      direction,
      principal,
      outstandingPrincipal: Number.isFinite(outstanding) ? outstanding : principal,
      transactions,
    };
  };

  const [loans, setLoans] = useState<LoanItem[]>(() => getLoans().map(normalizeLoan));
  const [filter, setFilter] = useState<'all' | 'you-gave' | 'you-borrowed' | 'settled'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [pendingDeleteLoan, setPendingDeleteLoan] = useState<LoanItem | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionType, setActionType] = useState<'add-principal' | 'payment'>('payment');
  const accounts = useMemo(() => getAccountSummaries(), []);
  const defaultAccountId = useMemo(() => getDefaultAccountId(), []);

  useBackHandler(showAdd, () => setShowAdd(false));
  useBackHandler(!!activeLoanId, () => setActiveLoanId(null));
  useBackHandler(!!pendingDeleteLoan, () => setPendingDeleteLoan(null));
  
  useEffect(() => {
    const handleTriggerAdd = (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId === 'loans') setShowAdd(true);
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    return () => window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
  }, []);

  useEffect(() => {
    const checkPending = () => {
      const pendingId = consumePendingOpenItem('loans');
      if (pendingId) {
        setActiveLoanId(pendingId);
      }
    };
    checkPending();

    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string; id?: string }>).detail;
      if (detail?.tab === 'loans' && detail.id) {
        setActiveLoanId(detail.id);
      }
    };
    window.addEventListener('splitmate_open_item', handleOpen);
    return () => window.removeEventListener('splitmate_open_item', handleOpen);
  }, []);

  const [form, setForm] = useState({
    loanName: '',
    counterpartyName: '',
    direction: 'you-gave' as 'you-gave' | 'you-borrowed',
    principal: '',
    interestRate: '',
    interestStartsOn: new Date().toISOString().split('T')[0],
    dueDate: '',
    durationType: 'year' as 'month' | 'year',
    notes: '',
    accountId: '',
  });

  const totals = useMemo(() => {
    let totalPrincipalLent = 0;
    let totalPrincipalBorrowed = 0;
    let totalOutstandingLent = 0;
    let totalOutstandingBorrowed = 0;
    let activeLentCount = 0;
    let activeBorrowedCount = 0;
    let settledCount = 0;

    for (const loan of loans) {
      const isClosed = Boolean(loan.closedAt);
      if (isClosed) {
        settledCount++;
      } else {
        if (loan.direction === 'you-gave') {
          totalOutstandingLent += loan.outstandingPrincipal;
          activeLentCount++;
        } else {
          totalOutstandingBorrowed += loan.outstandingPrincipal;
          activeBorrowedCount++;
        }
      }

      if (loan.direction === 'you-gave') {
        totalPrincipalLent += loan.principal;
      } else {
        totalPrincipalBorrowed += loan.principal;
      }
    }

    const netOutstanding = totalOutstandingLent - totalOutstandingBorrowed;
    const totalActiveLoans = activeLentCount + activeBorrowedCount;

    return {
      totalPrincipalLent,
      totalPrincipalBorrowed,
      totalOutstandingLent,
      totalOutstandingBorrowed,
      netOutstanding,
      activeLentCount,
      activeBorrowedCount,
      totalActiveLoans,
      settledCount,
    };
  }, [loans]);

  const filteredLoans = useMemo(() => {
    return loans.filter((loan) => {
      const isClosed = Boolean(loan.closedAt);
      if (filter === 'settled') return isClosed;
      if (filter === 'you-gave') return !isClosed && loan.direction === 'you-gave';
      if (filter === 'you-borrowed') return !isClosed && loan.direction === 'you-borrowed';
      return true; // 'all'
    });
  }, [loans, filter]);

  const activeLoan = useMemo(() => loans.find((loan) => loan.id === activeLoanId) || null, [loans, activeLoanId]);

  const persistLoans = (next: LoanItem[]) => {
    const saved = saveLoans(next);
    if (!saved) return false;
    setLoans(next);
    return true;
  };

  const handleCreate = () => {
    const principal = Number(form.principal);
    const interestRate = Number(form.interestRate);
    if (!form.loanName.trim() || !Number.isFinite(principal) || principal <= 0 || !Number.isFinite(interestRate) || interestRate < 0 || !form.interestStartsOn || !form.dueDate) {
      toast({ title: "Incomplete details", description: "Please enter a loan name, principal, rate, and dates." });
      return;
    }

    const selectedAccountId = form.accountId || defaultAccountId || accounts[0]?.id;

    const item: LoanItem = {
      id: generateId(),
      loanName: form.loanName.trim(),
      counterpartyName: form.counterpartyName.trim() || undefined,
      direction: form.direction,
      principal,
      outstandingPrincipal: principal,
      interestRate,
      interestStartsOn: form.interestStartsOn,
      dueDate: form.dueDate,
      durationType: form.durationType,
      transactions: [],
      notes: form.notes.trim() || undefined,
      accountId: selectedAccountId,
      createdAt: new Date().toISOString(),
    };

    const saved = persistLoans([item, ...loans]);
    if (!saved) return;

    if (principal > 0) {
      const isLent = form.direction === 'you-gave';
      savePersonalExpense({
        id: generateId(),
        amount: principal,
        reason: isLent ? `Loan Given: ${form.loanName.trim()}` : `Loan Borrowed: ${form.loanName.trim()}`,
        category: 'Other',
        date: form.interestStartsOn || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        isIncome: !isLent,
        isMirror: true,
        mirrorFromId: item.id,
        accountId: selectedAccountId || undefined,
      });
    }

    setForm({ 
      loanName: '', 
      counterpartyName: '', 
      direction: 'you-gave', 
      principal: '', 
      interestRate: '', 
      interestStartsOn: new Date().toISOString().split('T')[0], 
      dueDate: '', 
      durationType: 'year', 
      notes: '', 
      accountId: '' 
    });
    setShowAdd(false);
    toast({ title: "Loan added", description: `"${item.loanName}" is now being tracked.` });
  };

  const handleDelete = (id: string) => {
    const loan = loans.find(l => l.id === id);
    if (loan) {
      const txIds = [loan.id, ...loan.transactions.map(tx => tx.id)];
      const pExpenses = JSON.parse(localStorage.getItem('splitmate_personal_expenses') || '[]');
      const nextPExpenses = pExpenses.filter((pe: PersonalExpense) => !txIds.includes(pe.mirrorFromId || ''));
      localStorage.setItem('splitmate_personal_expenses', JSON.stringify(nextPExpenses));
    }

    const next = loans.filter((loan) => loan.id !== id);
    persistLoans(next);
    if (activeLoanId === id) setActiveLoanId(null);
    toast({ title: "Loan deleted", description: "The loan record has been removed." });
  };

  const handleAddTransaction = () => {
    if (!activeLoan) return;
    const amount = Number(actionAmount);
    if (!Number.isFinite(amount) || amount <= 0 || activeLoan.closedAt) return;

    const tx: LoanTransaction = {
      id: generateId(),
      type: actionType,
      amount,
      createdAt: new Date().toISOString(),
    };

    const isIncome = (activeLoan.direction === 'you-borrowed' && actionType === 'add-principal') ||
                     (activeLoan.direction === 'you-gave' && actionType === 'payment');

    savePersonalExpense({
      id: generateId(),
      amount,
      reason: actionType === 'payment'
        ? (activeLoan.direction === 'you-borrowed' ? `Loan Repayment: ${activeLoan.loanName}` : `Loan Receipt: ${activeLoan.loanName}`)
        : (activeLoan.direction === 'you-borrowed' ? `Additional Loan Borrowed: ${activeLoan.loanName}` : `Additional Loan Lent: ${activeLoan.loanName}`),
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      isIncome,
      isMirror: true,
      mirrorFromId: tx.id,
      accountId: activeLoan.accountId || undefined,
    });

    const next = loans.map((loan) => {
      if (loan.id !== activeLoan.id) return loan;
      const change = actionType === 'payment' ? -amount : amount;
      return {
        ...loan,
        outstandingPrincipal: Math.max(0, loan.outstandingPrincipal + change),
        transactions: [tx, ...loan.transactions],
      };
    });

    const saved = persistLoans(next);
    if (!saved) return;
    setActionAmount('');
    toast({ 
      title: actionType === 'payment' ? "Payment recorded" : "Principal updated", 
      description: `Added ${currency.symbol}${amount.toLocaleString()} to ledger.` 
    });
  };

  const handleToggleCloseLoan = (targetLoan?: LoanItem | null) => {
    const loanToToggle = targetLoan || activeLoan;
    if (!loanToToggle) return;
    const isCurrentlyClosed = Boolean(loanToToggle.closedAt);

    const next = loans.map((loan) =>
      loan.id === loanToToggle.id
        ? { 
            ...loan, 
            closedAt: isCurrentlyClosed ? undefined : new Date().toISOString(), 
            outstandingPrincipal: isCurrentlyClosed ? loan.principal : 0 
          }
        : loan
    );
    const saved = persistLoans(next);
    if (!saved) return;
    toast({ 
      title: isCurrentlyClosed ? "Loan reopened" : "Loan settled", 
      description: isCurrentlyClosed 
        ? `"${loanToToggle.loanName}" has been reopened.` 
        : `"${loanToToggle.loanName}" marked as settled.` 
    });
  };

  const previewInterest = useMemo(() => {
    const p = Number(form.principal) || 0;
    const r = Number(form.interestRate) || 0;
    if (p <= 0 || r <= 0 || !form.interestStartsOn || !form.dueDate) return null;
    const start = new Date(form.interestStartsOn);
    const end = new Date(form.dueDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
    const rateDecimal = r / 100;
    const interest = form.durationType === 'year'
      ? p * rateDecimal * (days / 365)
      : p * rateDecimal * (days / 30);
    return { days, interest, total: p + interest };
  }, [form.principal, form.interestRate, form.interestStartsOn, form.dueDate, form.durationType]);

  const getDueStatus = (dueDateStr: string) => {
    const due = new Date(dueDateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    }
    if (diffDays === 0) {
      return { text: 'Due today', isOverdue: false };
    }
    return { text: `${diffDays}d left`, isOverdue: false };
  };

  return (
    <div onScroll={onScroll} className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col">
      {/* Header — sticky fixed position */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-5 pt-5 pb-3 flex items-center justify-between gap-3 border-b border-border/10">
        <div className="flex items-center gap-3.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-2xl bg-secondary/40 border border-border/15 flex items-center justify-center active:scale-90 transition-all shrink-0"
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 mt-0.5">
              <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.035em] leading-none text-foreground">
                Loans<span className="text-primary">.</span>
              </h1>
            </div>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      {/* Main Content Area */}
      <div className="px-5 pt-4 space-y-6 flex-1">

      {/* Summary Card — Home Tab Balance Slab */}
      <div
        className="relative px-5 py-6 overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border) / 0.15)',
          borderRadius: '1.75rem',
          boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
        }}
      >
        <div className="absolute right-[-15px] top-[20%] -translate-y-[15%] pointer-events-none opacity-[0.035]">
          <Landmark size={120} className="text-foreground" strokeWidth={1} />
        </div>

        {/* Corner tag */}
        <div className="absolute top-3 right-4 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
          OVERVIEW · {new Date().toLocaleDateString('en', { month: 'short', year: '2-digit' }).toUpperCase()}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Net Outstanding
        </p>

        <div className="flex items-baseline gap-1">
          <MoneyDisplay
            amount={totals.netOutstanding}
            size="xl"
            showSign={true}
            className="font-heading tracking-[-0.04em]"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: totals.netOutstanding > 0 ? 'hsl(var(--success))'
                : totals.netOutstanding < 0 ? 'hsl(var(--danger))'
                  : 'hsl(var(--muted-foreground))'
            }}
          />
          <p className="text-xs text-muted-foreground">
            {totals.netOutstanding > 0
              ? `You are owed ${formatMoney(totals.netOutstanding)} net across active loans`
              : totals.netOutstanding < 0
                ? `You owe ${formatMoney(Math.abs(totals.netOutstanding))} net to counterparties`
                : totals.totalActiveLoans > 0
                  ? 'All active loans currently offset each other'
                  : 'All loan accounts are settled'}
          </p>
        </div>

        {/* Divider & Breakdown */}
        <div
          className="mt-5 pt-4 grid grid-cols-2 gap-0 divide-x"
          style={{ borderTop: '1px dashed hsl(var(--border) / 0.5)', borderColor: 'hsl(var(--border) / 0.4)' }}
        >
          <div className="pr-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Lent</p>
              <span className="text-[10px] font-medium text-muted-foreground/70">
                {totals.activeLentCount} active
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpRight size={15} className="text-success shrink-0" />
              <p className="font-heading text-lg font-bold text-success tabular-nums tracking-tight">
                {currency.symbol}{totals.totalOutstandingLent.toLocaleString(currency.locale)}
              </p>
            </div>
          </div>

          <div className="pl-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Borrowed</p>
              <span className="text-[10px] font-medium text-muted-foreground/70">
                {totals.activeBorrowedCount} active
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowDownRight size={15} className="text-warning shrink-0" />
              <p className="font-heading text-lg font-bold text-warning tabular-nums tracking-tight">
                {currency.symbol}{totals.totalOutstandingBorrowed.toLocaleString(currency.locale)}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 -mx-5 px-5">
        {[
          { key: 'all', label: 'All', count: loans.length },
          { key: 'you-gave', label: 'Lent', count: totals.activeLentCount },
          { key: 'you-borrowed', label: 'Borrowed', count: totals.activeBorrowedCount },
          { key: 'settled', label: 'Settled', count: totals.settledCount },
        ].map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap flex items-center gap-1.5",
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50 border border-border/10"
              )}
            >
              <span>{tab.label}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.2 rounded-full",
                isActive ? "bg-background/20 text-background" : "bg-muted/40 text-muted-foreground"
              )}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loans List */}
      {filteredLoans.length === 0 ? (
        <div className="p-12 text-center rounded-[2rem] bg-secondary/15 border border-dashed border-border/40">
          <Landmark className="mx-auto mb-3 text-muted-foreground/30" size={44} strokeWidth={1.5} />
          <p className="text-sm font-semibold text-foreground mb-1">No loans in this view</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto mb-4">
            {filter === 'settled'
              ? 'No completed loans yet. Completed loans will appear here.'
              : filter === 'all'
                ? 'Track money you have lent or borrowed with automated interest cycles.'
                : `No active ${filter === 'you-gave' ? 'lent' : 'borrowed'} loans found.`}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add First Loan
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredLoans.map((loan, idx) => {
            const isLockedLoan = !isPro && idx >= FREE_LIMITS.MAX_LOANS;
            const stats = getInterestStats(loan);
            const dueAmount = loan.outstandingPrincipal + stats.totalInterest;
            const isClosed = Boolean(loan.closedAt);
            const isYouGave = loan.direction === 'you-gave';
            const dueStatus = getDueStatus(loan.dueDate);
            const repaidAmount = Math.max(0, loan.principal - loan.outstandingPrincipal);
            const repaidPercent = loan.principal > 0 ? Math.round((repaidAmount / loan.principal) * 100) : 0;

            return (
              <div key={loan.id} className="contents">
                <div
                  onClick={() => {
                    if (isLockedLoan) {
                      requestProUpgrade('loans', 'Free users can track 1 loan. Upgrade to Pro for unlimited loans.');
                      return;
                    }
                    setActiveLoanId(loan.id);
                  }}
                  className={cn(
                    "group relative p-5 rounded-[1.75rem] bg-card border transition-all duration-200 active:scale-[0.99] text-left overflow-hidden cursor-pointer",
                    isLockedLoan && "opacity-50",
                    isClosed
                      ? "border-border/30 bg-card/60"
                      : "border-border/30 hover:border-border/70 shadow-sm hover:shadow-md"
                  )}
                >
                  {isLockedLoan && (
                    <div className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center">
                      <Lock size={12} className="text-white" />
                    </div>
                  )}

                  {/* Top Row: Icon + Title + Direction Badge + Outstanding Amount */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 duration-300",
                        isClosed 
                          ? "bg-secondary text-muted-foreground"
                          : isYouGave 
                            ? "bg-success/10 text-success" 
                            : "bg-warning/10 text-warning"
                      )}>
                        {isClosed ? (
                          <CheckCircle2 size={20} strokeWidth={2.2} />
                        ) : isYouGave ? (
                          <ArrowUpRight size={20} strokeWidth={2.5} />
                        ) : (
                          <ArrowDownRight size={20} strokeWidth={2.5} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-heading text-[15px] font-bold text-foreground truncate leading-tight">
                          {loan.loanName}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
                            isClosed
                              ? "bg-secondary text-muted-foreground"
                              : isYouGave
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-warning"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", isClosed ? "bg-muted-foreground" : isYouGave ? "bg-success" : "bg-warning")} />
                            {isClosed ? 'Settled' : isYouGave ? 'Lent' : 'Borrowed'}
                          </span>
                          {loan.counterpartyName && (
                            <span className="text-xs text-muted-foreground truncate font-medium">
                              w/ {loan.counterpartyName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end shrink-0">
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-0.5">
                        {isClosed ? 'Settled' : 'Outstanding'}
                      </span>
                      <MoneyDisplay
                        amount={isClosed ? 0 : loan.outstandingPrincipal}
                        size="md"
                        className={cn(
                          "font-heading font-bold tracking-tight tabular-nums",
                          isClosed ? "text-muted-foreground" : isYouGave ? "text-success" : "text-foreground"
                        )}
                      />
                    </div>
                  </div>

                  {/* Repayment Progress bar if active */}
                  {!isClosed && loan.principal > 0 && repaidAmount > 0 && (
                    <div className="mt-3.5 space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium">
                        <span>{repaidPercent}% repaid</span>
                        <span className="tabular-nums">{formatMoney(repaidAmount)} of {formatMoney(loan.principal)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary/60 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", isYouGave ? "bg-success" : "bg-primary")}
                          style={{ width: `${Math.min(100, Math.max(0, repaidPercent))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Micro Specs Row */}
                  <div className="mt-3.5 pt-3 grid grid-cols-3 gap-2 border-t border-dashed border-border/40 text-left">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Principal</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums">
                        {formatMoney(loan.principal)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Interest</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums">
                        {loan.interestRate}% <span className="text-[10px] text-muted-foreground font-normal">/{loan.durationType === 'year' ? 'yr' : 'mo'}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Est. Total</p>
                      <p className="text-xs font-bold text-foreground mt-0.5 tabular-nums">
                        {formatMoney(dueAmount)}
                      </p>
                    </div>
                  </div>

                  {/* Footer Row */}
                  <div className="mt-3 pt-2.5 flex items-center justify-between border-t border-border/10 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-muted-foreground/70 shrink-0" />
                      <span className="font-medium text-[11px]">
                        {isClosed
                          ? `Closed ${new Date(loan.closedAt!).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
                          : `Due ${new Date(loan.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </span>
                      {!isClosed && (
                        <span className={cn(
                          "text-[9px] font-semibold px-1.5 py-0.2 rounded-md ml-1",
                          dueStatus.isOverdue ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground"
                        )}>
                          {dueStatus.text}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                      <span>Ledger</span>
                      <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>

                {idx === 0 && <NativeAdCard />}
              </div>
            );
          })}
        </div>
      )}

      {/* Modern Information Note */}
      <div className="p-4 rounded-2xl bg-secondary/20 border border-border/15 flex items-start gap-3 text-muted-foreground">
        <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground mt-0.5">
          <Info size={14} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground/80 font-normal">
          Interest is calculated using simple term interest from start date to due date. Recorded payments immediately reduce the outstanding principal.
        </p>
      </div>
      </div>

      {/* CREATE LOAN MODAL */}
      {showAdd && accounts.length === 0 ? (
        <AddFirstAccountModal
          isOpen={showAdd}
          onClose={() => setShowAdd(false)}
          onAccountCreated={() => {}}
        />
      ) : showAdd && createPortal(
        <div
          className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="w-full max-w-md bg-card rounded-[2rem] border border-border/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-border/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Landmark size={18} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-foreground leading-none">Add Loan</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Track lent or borrowed funds</p>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center active:scale-90 transition-all text-muted-foreground hover:text-foreground"
                onClick={() => setShowAdd(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Direction Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/40 rounded-2xl border border-border/10">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, direction: 'you-gave' }))}
                  className={cn(
                    "h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                    form.direction === 'you-gave'
                      ? "bg-success text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowUpRight size={15} />
                  You Lent (Gave)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, direction: 'you-borrowed' }))}
                  className={cn(
                    "h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                    form.direction === 'you-borrowed'
                      ? "bg-warning text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ArrowDownRight size={15} />
                  You Borrowed
                </button>
              </div>

              {/* Title & Counterparty */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Loan Purpose / Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={form.loanName}
                    onChange={(e) => setForm((prev) => ({ ...prev, loanName: e.target.value }))}
                    placeholder="e.g. University Fees, Car Advance"
                    className="w-full h-12 px-4 rounded-xl text-sm font-medium bg-secondary/30 border border-border/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground/50 transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Counterparty (Optional)
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      value={form.counterpartyName}
                      onChange={(e) => setForm((prev) => ({ ...prev, counterpartyName: e.target.value }))}
                      placeholder="e.g. Bank of Baroda, John, Sarita"
                      className="w-full h-12 pl-10 pr-4 rounded-xl text-sm font-medium bg-secondary/30 border border-border/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Principal & Interest */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Principal <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm">
                      {currency.symbol}
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={form.principal}
                      onChange={(e) => setForm((prev) => ({ ...prev, principal: e.target.value }))}
                      placeholder="0.00"
                      className="w-full h-12 pl-8 pr-3 rounded-xl text-sm font-bold bg-secondary/30 border border-border/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none tabular-nums placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Interest Rate <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-xs">
                      %
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={form.interestRate}
                      onChange={(e) => setForm((prev) => ({ ...prev, interestRate: e.target.value }))}
                      placeholder="0"
                      className="w-full h-12 pl-3 pr-8 rounded-xl text-sm font-bold bg-secondary/30 border border-border/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none tabular-nums placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
              </div>

              {/* Rate Duration Type */}
              <div className="flex gap-2 p-1 bg-secondary/30 rounded-xl border border-border/10">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, durationType: 'year' }))}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-semibold transition-all",
                    form.durationType === 'year' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  Per Year (% p.a.)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, durationType: 'month' }))}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-semibold transition-all",
                    form.durationType === 'month' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  Per Month (% p.m.)
                </button>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={form.interestStartsOn}
                    onChange={(e) => setForm((prev) => ({ ...prev, interestStartsOn: e.target.value }))}
                    className="w-full h-12 px-3 rounded-xl text-xs font-medium bg-secondary/30 border border-border/20 focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Date</label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full h-12 px-3 rounded-xl text-xs font-medium bg-secondary/30 border border-border/20 focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>

              {/* Account Selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  {form.direction === 'you-gave' ? 'Deduct from Account' : 'Deposit into Account'}
                </label>
                <select
                  value={form.accountId || defaultAccountId || accounts[0]?.id || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}
                  className="w-full h-12 px-3 rounded-xl text-xs font-medium bg-secondary/30 border border-border/20 focus:ring-2 focus:ring-primary/20 outline-none capitalize"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({currency.symbol}{acc.available.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Calculation Preview */}
              {previewInterest && (
                <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono tracking-wider">Estimated Due</span>
                    <span className="font-bold text-foreground tabular-nums text-sm">
                      {formatMoney(previewInterest.total)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono tracking-wider">Interest Accrual</span>
                    <span className="font-semibold text-primary tabular-nums">
                      +{formatMoney(previewInterest.interest)} ({previewInterest.days} days)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-border/15 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 h-12 rounded-xl bg-secondary/60 text-foreground font-semibold text-xs active:scale-98 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
              >
                <Check size={16} strokeWidth={2.5} />
                Save Loan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* LOAN ACTIONS / LEDGER MODAL */}
      {activeLoan && createPortal(
        <div
          className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setActiveLoanId(null)}
        >
          <div
            className="w-full max-w-md bg-card rounded-[2rem] border border-border/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ledger Header */}
            <div className="p-5 border-b border-border/15">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    activeLoan.direction === 'you-gave' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    <History size={18} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold text-base text-foreground truncate leading-tight">
                      {activeLoan.loanName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeLoan.counterpartyName ? `with ${activeLoan.counterpartyName}` : 'Loan Ledger'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setPendingDeleteLoan(activeLoan)}
                    className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition-all"
                    title="Delete Loan"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => setActiveLoanId(null)}
                    className="w-9 h-9 rounded-xl bg-secondary/60 flex items-center justify-center active:scale-90 transition-all text-muted-foreground"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div className="p-4 rounded-2xl bg-secondary/30 border border-border/15 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">
                    Current Outstanding
                  </span>
                  <MoneyDisplay
                    amount={activeLoan.closedAt ? 0 : activeLoan.outstandingPrincipal}
                    size="md"
                    className="font-heading font-bold tabular-nums"
                  />
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                    Status
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1",
                    activeLoan.closedAt
                      ? "bg-secondary text-muted-foreground"
                      : "bg-primary/15 text-primary"
                  )}>
                    {activeLoan.closedAt ? (
                      <>
                        <CheckCircle2 size={11} /> Settled
                      </>
                    ) : (
                      <>
                        <Clock size={11} /> Active Cycle
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Ledger Content */}
            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Actions for Active Loans */}
              {!activeLoan.closedAt && (
                <div className="space-y-3.5 p-4 rounded-2xl bg-secondary/20 border border-border/15">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">Record Activity</span>
                    <span className="text-[10px] text-muted-foreground font-mono uppercase">
                      {actionType === 'payment' ? 'Reducing Principal' : 'Increasing Principal'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/50 rounded-xl border border-border/10">
                    <button
                      onClick={() => setActionType('payment')}
                      className={cn(
                        "h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                        actionType === 'payment'
                          ? "bg-success text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <ArrowDownRight size={14} />
                      {activeLoan.direction === 'you-gave' ? 'Payment In' : 'Payment Out'}
                    </button>

                    <button
                      onClick={() => setActionType('add-principal')}
                      className={cn(
                        "h-9 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                        actionType === 'add-principal'
                          ? "bg-warning text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Plus size={14} />
                      Add Principal
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-xs">
                        {currency.symbol}
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={actionAmount}
                        onChange={(e) => setActionAmount(e.target.value)}
                        placeholder="Amount"
                        className="w-full h-11 pl-8 pr-3 rounded-xl text-sm font-bold bg-secondary/40 border border-border/20 focus:ring-2 focus:ring-primary/20 outline-none tabular-nums"
                      />
                    </div>
                    <button
                      onClick={handleAddTransaction}
                      className="px-5 h-11 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md active:scale-95 transition-all"
                    >
                      Confirm
                    </button>
                  </div>

                  <button
                    onClick={() => handleToggleCloseLoan(activeLoan)}
                    className="w-full py-2.5 rounded-xl border border-dashed border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    Mark Loan as Settled
                  </button>
                </div>
              )}

              {activeLoan.closedAt && (
                <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/15 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">This loan is settled.</span>
                  <button
                    onClick={() => handleToggleCloseLoan(activeLoan)}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    Reopen Loan
                  </button>
                </div>
              )}

              {/* Transactions Timeline */}
              <div className="space-y-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  History ({activeLoan.transactions.length})
                </p>

                {activeLoan.transactions.length === 0 ? (
                  <div className="py-8 text-center bg-secondary/15 rounded-2xl border border-border/10">
                    <Receipt size={28} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No payments recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {activeLoan.transactions.map((tx) => {
                      const isPayment = tx.type === 'payment';
                      return (
                        <div
                          key={tx.id}
                          className="p-3 rounded-xl bg-secondary/20 border border-border/10 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center",
                              isPayment ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                            )}>
                              {isPayment ? <ArrowDownRight size={14} /> : <Plus size={14} />}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-foreground">
                                {isPayment ? 'Payment' : 'Principal Increase'}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(tx.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>

                          <span className={cn(
                            "text-xs font-bold tabular-nums",
                            isPayment ? "text-success" : "text-warning"
                          )}>
                            {isPayment ? '-' : '+'}{formatMoney(tx.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {pendingDeleteLoan && createPortal(
        <div
          className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPendingDeleteLoan(null)}
        >
          <div
            className="w-full max-w-sm bg-card rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95 border border-border/20 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>

            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">Delete Loan?</h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-foreground">"{pendingDeleteLoan.loanName}"</span>? This will also remove any linked personal expense records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => setPendingDeleteLoan(null)}
                className="h-11 rounded-xl bg-secondary/70 font-semibold text-xs active:scale-98 transition-all text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(pendingDeleteLoan.id);
                  setPendingDeleteLoan(null);
                }}
                className="h-11 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md active:scale-98 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
