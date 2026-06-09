import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Search, Trash2, Calendar, X, Target, Save, AlertCircle, PieChart, CheckCircle2, Pencil, Check, Edit3, SlidersHorizontal, MessageSquare } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { getPersonalExpenses, deletePersonalExpense, updatePersonalExpense, saveSharedExpense, generateId, getUniquePersonNames, type PersonalExpense, type SharedExpense, EXPENSE_CATEGORIES } from '@/lib/storage';
import { AddPersonalExpenseModal } from '@/components/modals/AddPersonalExpenseModal';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { ExpenseChart } from '@/components/ExpenseChart';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useBannerAd } from '@/hooks/useBannerAd';

const CATEGORY_EMOJIS: Record<string, string> = {
  Travel: '✈️',
  Groceries: '🛒',
  Other: '📦',
  Income: '💰',
};

interface PersonalTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

export function PersonalTab({ onOpenAccount, onBack, bannerAdActive = true }: PersonalTabProps) {
  useBannerAd(bannerAdActive);
  const { toast } = useToast();
  const currency = useCurrency();
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [expenses, setExpenses] = useState<PersonalExpense[]>(getPersonalExpenses());
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartedOnMonthStripRef = useRef(false);
  const monthTabsRef = useRef<HTMLDivElement | null>(null);
  const currentMonthChipRef = useRef<HTMLButtonElement | null>(null);
  const [jumpDirection, setJumpDirection] = useState<'left' | 'right' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingExpense, setViewingExpense] = useState<PersonalExpense | null>(null);
  const [isEditingReason, setIsEditingReason] = useState(false);
  const [editedReason, setEditedReason] = useState("");
  const [editedAmount, setEditedAmount] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedCategory, setEditedCategory] = useState('Other');
  const [editedType, setEditedType] = useState<'income' | 'expense'>('expense');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useBackHandler(!!viewingExpense, () => {
    setViewingExpense(null);
    setIsEditingReason(false);
    setShowCategoryPicker(false);
    setShowPersonPicker(false);
  });
  useBackHandler(!!deletingId, () => setDeletingId(null));
  useBackHandler(showAddModal, () => setShowAddModal(false));
  useBackHandler(showPersonPicker, () => setShowPersonPicker(false));

  const existingPersonNames = useMemo(() => getUniquePersonNames(), []);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const matchesSearch = expense.reason.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === 'all' 
        ? true 
        : filterType === 'income' ? !!expense.isIncome : !expense.isIncome;
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Secondary sort by createdAt to ensure last added appears on top for the same day
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [expenses, searchTerm, filterType]);

  const monthOptions = useMemo(() => {
    const startYear = 2025;
    const endYear = new Date().getFullYear() + 2;
    const options: Array<{ key: string; label: string }> = [];

    for (let year = startYear; year <= endYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const label = new Date(year, month - 1, 1)
          .toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          .replace(' ', '-');
        options.push({ key, label });
      }
    }

    return options;
  }, []);

  const selectedMonthIndex = useMemo(() => {
    return monthOptions.findIndex((month) => month.key === selectedMonthKey);
  }, [monthOptions, selectedMonthKey]);

  const visibleExpenses = useMemo(() => {
    return filteredExpenses.filter((expense) => expense.date.startsWith(selectedMonthKey));
  }, [filteredExpenses, selectedMonthKey]);

  const selectedMonthLabel = useMemo(() => {
    return monthOptions.find((month) => month.key === selectedMonthKey)?.label ?? null;
  }, [monthOptions, selectedMonthKey]);

  useEffect(() => {
    const container = monthTabsRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLButtonElement>(`button[data-month-key="${selectedMonthKey}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedMonthKey]);

  useEffect(() => {
    const container = monthTabsRef.current;
    const currentChip = currentMonthChipRef.current;
    if (!container || !currentChip) return;

    const updateJumpDirection = () => {
      const containerRect = container.getBoundingClientRect();
      const currentRect = currentChip.getBoundingClientRect();

      if (currentRect.left < containerRect.left) {
        setJumpDirection('left');
        return;
      }

      if (currentRect.right > containerRect.right) {
        setJumpDirection('right');
        return;
      }

      setJumpDirection(null);
    };

    updateJumpDirection();
    container.addEventListener('scroll', updateJumpDirection, { passive: true });
    window.addEventListener('resize', updateJumpDirection);

    return () => {
      container.removeEventListener('scroll', updateJumpDirection);
      window.removeEventListener('resize', updateJumpDirection);
    };
  }, [monthOptions]);

  useEffect(() => {
    const handleTriggerAdd = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string }>).detail;
      if (detail?.tabId === 'personal') setShowAddModal(true);
    };
    const handleOpenTransaction = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string; transactionId?: string }>).detail;
      if (!detail || detail.tabId !== 'personal' || !detail.transactionId) return;

      const latest = getPersonalExpenses();
      setExpenses(latest);
      const target = latest.find((item) => item.id === detail.transactionId);
      if (!target) return;

      const monthKey = (target.date || '').slice(0, 7);
      if (monthKey) setSelectedMonthKey(monthKey);
      setViewingExpense(target);
      setIsEditingReason(false);
      setShowCategoryPicker(false);
      setShowPersonPicker(false);
    };
    const sync = () => setExpenses(getPersonalExpenses());
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    window.addEventListener('splitmate_data_changed', sync);
    window.addEventListener('splitmate_open_transaction', handleOpenTransaction);
    return () => {
      window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
      window.removeEventListener('splitmate_data_changed', sync);
      window.removeEventListener('splitmate_open_transaction', handleOpenTransaction);
    };
  }, []);

  const totalBalance = useMemo(() =>
    expenses.reduce((sum, exp) => sum + exp.amount, 0),
  [expenses]);

  const { totalAmount, totalIncome } = useMemo(() => {
    const total = visibleExpenses
      .filter(e => !e.isIncome)
      .reduce((sum, expense) => sum + expense.amount, 0);
    
    const income = visibleExpenses
      .filter(e => e.isIncome)
      .reduce((sum, expense) => sum + expense.amount, 0);
 
    return { totalAmount: total, totalIncome: income };
  }, [visibleExpenses]);

  const chartData = useMemo(() => {
    return EXPENSE_CATEGORIES
      .map((category) => {
        const amount = visibleExpenses
          .filter((expense) => expense.category === category && !expense.isIncome)
          .reduce((sum, expense) => sum + expense.amount, 0);
 
        return {
          name: category,
          value: Math.abs(amount),
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [visibleExpenses]);

  const handleAddExpense = () => {
    setExpenses(getPersonalExpenses());
    setShowAddModal(false);
  };

  const handleDeleteTrigger = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    deletePersonalExpense(deletingId);
    setExpenses(getPersonalExpenses());
    setDeletingId(null);
  };

  const handleJumpToCurrentMonth = () => {
    setSelectedMonthKey(currentMonthKey);

    requestAnimationFrame(() => {
      currentMonthChipRef.current?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    });
  };

  const formatSignedAmountLabel = (amount: number, isIncome?: boolean) => {
    const signedPrefix = isIncome ? '+' : '-';
    const absolute = Math.abs(amount);
    const formatted = absolute.toLocaleString(currency.locale, { maximumFractionDigits: 2 });
    return `${signedPrefix}${currency.symbol}${formatted}`;
  };

  const convertPersonalToShared = (personName: string) => {
    if (!viewingExpense) return;
    if (viewingExpense.isMirror) {
      toast({ title: 'Mirror entry', description: 'This transaction already comes from shared records.', variant: 'destructive' });
      return;
    }

    const isIncome = isEditingReason ? editedType === 'income' : Boolean(viewingExpense.isIncome);
    const draftAmount = isEditingReason ? parseFloat(editedAmount) : viewingExpense.amount;
    const amount = Number.isFinite(draftAmount) ? Math.abs(draftAmount) : Math.abs(viewingExpense.amount);
    const reason = (isEditingReason ? editedReason : viewingExpense.reason).trim() || (isIncome ? 'Income' : 'Expense');
    const date = (isEditingReason ? editedDate : viewingExpense.date) || viewingExpense.date;
    const category = isIncome ? 'Income' : (isEditingReason ? editedCategory : viewingExpense.category || 'Other');

    const sharedExpense: SharedExpense = {
      id: generateId(),
      amount,
      reason,
      paidBy: isIncome ? personName : 'me',
      forPerson: isIncome ? 'me' : personName,
      personName,
      date,
      createdAt: new Date().toISOString(),
      settled: false,
      category,
      accountId: isIncome ? undefined : viewingExpense.accountId,
    };

    const saved = saveSharedExpense(sharedExpense);
    if (!saved) return;

    deletePersonalExpense(viewingExpense.id);
    setExpenses(getPersonalExpenses());
    setShowPersonPicker(false);
    setShowCategoryPicker(false);
    setIsEditingReason(false);
    setViewingExpense(null);

    toast({
      title: 'Moved to Split',
      description: isIncome
        ? `${personName} gave you ${currency.symbol}${amount.toLocaleString(currency.locale)}.`
        : `You paid ${personName} ${currency.symbol}${amount.toLocaleString(currency.locale)}.`,
    });
  };

  const shiftMonth = (direction: 'left' | 'right') => {
    if (selectedMonthIndex < 0) return;
    const delta = direction === 'left' ? 1 : -1;
    const nextIndex = selectedMonthIndex + delta;
    if (nextIndex < 0 || nextIndex >= monthOptions.length) return;
    setSelectedMonthKey(monthOptions[nextIndex].key);
  };

  const handleMonthSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const startedOnSwipeDisabled = !!target?.closest('[data-disable-swipe="true"]');
    if (startedOnSwipeDisabled) {
      touchStartedOnMonthStripRef.current = false;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const monthStrip = monthTabsRef.current;
    touchStartedOnMonthStripRef.current = !!(target && monthStrip && monthStrip.contains(target));

    if (touchStartedOnMonthStripRef.current) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleMonthSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartedOnMonthStripRef.current) {
      touchStartedOnMonthStripRef.current = false;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX === null) return;

    const endX = event.changedTouches[0]?.clientX;
    const endY = event.changedTouches[0]?.clientY;
    if (typeof endX !== 'number') return;
    if (typeof endY !== 'number' || startY === null) return;

    const deltaX = endX - startX;
    const deltaY = endY - startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) < 45) return;
    if (deltaX < 0) {
      shiftMonth('left');
      return;
    }
    shiftMonth('right');
  };

  return (
    <div
      className="p-4 space-y-4 font-sans"
      style={{ paddingBottom: showAddModal ? '0' : '160px' }}
      onTouchStart={handleMonthSwipeStart}
      onTouchEnd={handleMonthSwipeEnd}
    >
      {/* Header */}
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
            <h1 className="text-2xl font-bold tracking-tight leading-none">Personal</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80">Track your independent expenses</p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      {/* Unified Spend Dashboard */}
      <div className="relative z-10 overflow-hidden p-8 rounded-[3rem] bg-card border border-border/10 shadow-sm space-y-8"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.04) 0%, hsl(var(--card)) 100%)',
        }}
      >
        {/* Total Burn Header */}
        <div className="flex items-center justify-between gap-4">
           {/* Total Burn Header */}
           <div className="flex-1 text-center space-y-1">
             <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/50">
               Total Spent
             </p>
             <div className="relative inline-flex items-center gap-1">
               <MoneyDisplay amount={-totalAmount} size="xl" className="font-black tracking-tighter text-red-500 text-[28px]" />
             </div>
           </div>

           {/* Income Header */}
           <div className="flex-1 text-center space-y-1">
             <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/50">
               Total Income
             </p>
             <div className="relative inline-flex items-center gap-1">
               <MoneyDisplay amount={totalIncome} size="xl" className="font-black tracking-tighter text-emerald-500 text-[28px]" />
             </div>
           </div>
        </div>
        <div className="text-center">
           <p className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest">{visibleExpenses.length} records in {selectedMonthLabel || 'period'}</p>
        </div>
      </div>

      {/* Category Breakdown Chart */}
      {chartData.length > 0 && (
        <div className="ios-card-modern p-5 space-y-4 rounded-[3rem] bg-card border border-border/10">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-[12px] uppercase tracking-widest flex items-center gap-2.5">
              <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-600 shadow-inner">
                <PieChart size={17} strokeWidth={2.5} />
              </div>
              Category Breakdown
            </h3>
            <div className="w-1.5 h-1.5 rounded-full bg-border/20" />
          </div>
          <div className="p-2 rounded-[2.25rem] bg-secondary/5 border border-border/5">
            <ExpenseChart data={chartData} type="bar" height={210} />
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="relative group">
        <Search size={14} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground/30 transition-colors" />
        <input
          type="text"
          placeholder="Filter ledger..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full h-11 pl-11 pr-24 rounded-2xl text-[13px] font-medium bg-secondary/20 border border-border/10 focus:bg-card focus:border-border/10 transition-all placeholder:text-[10px] placeholder:font-semibold placeholder:tracking-wider placeholder:opacity-30 uppercase"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 pr-1">
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-secondary/80 active:scale-90"
            >
              <X size={13} className="text-muted-foreground/60" />
            </button>
          )}
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 relative",
              filterType !== 'all' ? "bg-primary text-white" : "bg-secondary/50 text-muted-foreground/40"
            )}
            title="Filter Results"
          >
            <SlidersHorizontal size={13} strokeWidth={2.5} />
            {filterType !== 'all' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white border border-primary animate-pulse" />
            )}
          </button>

          {/* Filter Pop-up Menu (Overlay via Portal) */}
          {showFilterMenu && createPortal(
            <div 
              className="fixed inset-0 z-[10001] bg-black/5" // Subtle backdrop
              onClick={() => setShowFilterMenu(false)}
            >
              <div 
                className="absolute right-6 top-72 w-52 bg-card/95 border border-border/15 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in slide-in-from-top-2 duration-200"
                onClick={e => e.stopPropagation()}
                style={{
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}
              >
                <div className="p-1.5 space-y-1">
                  <div className="px-3 py-2 border-b border-border/5 mb-1">
                     <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">View Ledger By</p>
                  </div>
                  {[
                    { id: 'all', label: 'All Transactions', icon: '📎' },
                    { id: 'income', label: 'Income Records', icon: '💰' },
                    { id: 'expense', label: 'Expense History', icon: '💸' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setFilterType(option.id as 'all' | 'income' | 'expense');
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all",
                        filterType === option.id 
                          ? "bg-primary/20 text-primary border border-primary/10" 
                          : "text-muted-foreground/60 hover:bg-secondary/40 border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm">{option.icon}</span>
                        {option.label}
                      </div>
                      {filterType === option.id && <Check size={14} strokeWidth={3} className="animate-in fade-in scale-in" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Month Tabs */}
      <div className="relative">
        {jumpDirection === 'left' && (
          <button
            type="button"
            onClick={handleJumpToCurrentMonth}
            data-disable-swipe="true"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-background shadow-lg border border-border/10 active:scale-90 transition-all"
          >
            <ChevronLeft size={16} className="text-primary" />
          </button>
        )}

        <div
          ref={monthTabsRef}
          className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"
        >
          {monthOptions.map((month) => {
            const isActive = selectedMonthKey === month.key;
            return (
              <button
                key={month.key}
                data-month-key={month.key}
                ref={month.key === currentMonthKey ? currentMonthChipRef : null}
                onClick={() => setSelectedMonthKey(month.key)}
                className={cn(
                  "px-4 py-2 rounded-[1.25rem] text-[10px] font-bold whitespace-nowrap border uppercase tracking-wider transition-all duration-300",
                  isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-muted-foreground/60 border-border/10"
                )}
              >
                {month.label}
              </button>
            );
          })}
        </div>

        {jumpDirection === 'right' && (
          <button
            type="button"
            onClick={handleJumpToCurrentMonth}
            data-disable-swipe="true"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-background shadow-lg border border-border/10 active:scale-90 transition-all"
          >
            <ChevronRight size={16} className="text-primary" />
          </button>
        )}
      </div>

      {/* Expenses List */}
      {visibleExpenses.length === 0 ? (
        <div className="p-16 text-center rounded-[3.5rem] bg-secondary/15 border border-dashed border-border/15">
          <Calendar size={42} className="mx-auto mb-4 text-muted-foreground/15" strokeWidth={1} />
          <p className="text-[13px] font-bold text-muted-foreground/40 italic px-6 leading-relaxed">No data detected for this cycle. Start tracking to generate insights.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3.5">
            {visibleExpenses.map((expense, idx) => (
              <Fragment key={expense.id}>
                <div
                  onClick={() => setViewingExpense(expense)}
                  className="ios-card-modern px-5 py-4 group active:scale-[0.98] transition-all overflow-hidden border border-border/10 transform-gpu cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border',
                      expense.source === 'sms'
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'text-xl bg-secondary/20 border-border/5',
                    )}>
                      {expense.source === 'sms' ? <MessageSquare size={16} strokeWidth={2.3} /> : (CATEGORY_EMOJIS[expense.category] || '📦')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate tracking-tight uppercase leading-none mb-1.5">{expense.reason}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">{expense.category}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                          {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase()}
                        </span>
                        {expense.isMirror && (
                          <>
                            <div className="w-1 h-1 rounded-full bg-border/20" />
                            <span className="text-[8px] font-black uppercase tracking-tighter text-primary/40 px-1.5 py-0.5 rounded bg-primary/5 border border-primary/5">Mirror</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('font-bold tracking-tight', expense.isIncome ? 'text-emerald-500' : 'text-red-500')}>
                        {formatSignedAmountLabel(expense.amount, expense.isIncome)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrigger(expense.id);
                          }}
                          className="w-10 h-10 flex items-center justify-center text-destructive/60 bg-danger/5 rounded-2xl active:scale-90 transition-all border border-destructive/5 shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {(idx + 4) % 5 === 0 && <NativeAdCard />}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <AddPersonalExpenseModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddExpense}
      />

      {/* Expense Detail Sheet - TIGHT REDESIGN */}
      {viewingExpense && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-end justify-center pointer-events-auto" onClick={() => setViewingExpense(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div
            className="w-full max-w-md bg-card rounded-[3rem] p-6 pb-12 space-y-5 animate-in slide-in-from-bottom-full border border-border/10 duration-500 shadow-2xl relative overflow-hidden mb-4 mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Backglow handle */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

            {/* Header Actions */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => {
                  setViewingExpense(null);
                  setIsEditingReason(false);
                }} 
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all border border-border/5"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const nextMode = !isEditingReason;
                    setIsEditingReason(nextMode);
                    setShowCategoryPicker(false);
                    if (nextMode) {
                      setEditedReason(viewingExpense.reason);
                      setEditedAmount(viewingExpense.amount.toString());
                      setEditedDate(viewingExpense.date);
                      setEditedCategory(viewingExpense.category || 'Other');
                      setEditedType(viewingExpense.isIncome ? 'income' : 'expense');
                    }
                  }}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all border group",
                    isEditingReason ? "bg-primary/20 border-primary/30 text-primary" : "bg-secondary border-border/10 text-muted-foreground"
                  )}
                >
                  <Pencil size={15} className={cn(isEditingReason && "animate-pulse")} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const id = viewingExpense.id;
                    handleDeleteTrigger(id);
                    setTimeout(() => setViewingExpense(null), 100);
                  }}
                  className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center active:scale-90 transition-all border border-destructive/10 group"
                >
                  <Trash2 size={16} className="text-destructive group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            {/* Central Hero Amount */}
            <div className="text-center space-y-1 py-1">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">{(isEditingReason ? editedType === 'income' : viewingExpense.isIncome) ? 'Total Income' : 'Total Burn'}</p>
              {isEditingReason ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className={cn("text-3xl font-black", editedType === 'income' ? "text-emerald-500" : "text-red-500")}>
                      {currency.symbol}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editedAmount}
                      onChange={(e) => setEditedAmount(e.target.value)}
                      className={cn(
                        "w-48 bg-transparent text-5xl font-black tracking-tighter text-center outline-none border-b-2 border-dashed border-primary/30 py-1",
                        editedType === 'income' ? "text-emerald-500" : "text-red-500"
                      )}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ) : (
                <span className={cn('font-black text-5xl tracking-tighter block', viewingExpense.isIncome ? 'text-emerald-500' : 'text-red-500')}>
                  {formatSignedAmountLabel(viewingExpense.amount, viewingExpense.isIncome)}
                </span>
              )}
            </div>

            {/* Status Badges */}
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={!isEditingReason}
                  onClick={() => {
                    if (!isEditingReason) return;
                    setShowCategoryPicker((value) => !value);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 transition-all',
                    isEditingReason ? 'active:scale-95' : 'cursor-default',
                  )}
                >
                  <span className="text-sm">{CATEGORY_EMOJIS[isEditingReason ? editedCategory : viewingExpense.category] || '📦'}</span>
                  <span className="text-[9px] font-black text-primary uppercase tracking-[0.1em]">{isEditingReason ? editedCategory : viewingExpense.category}</span>
                </button>
                <button
                  type="button"
                  disabled={!isEditingReason}
                  onClick={() => {
                    if (!isEditingReason) return;
                    if (existingPersonNames.length === 0) {
                      toast({ title: 'No people found', description: 'Add at least one shared person first.' });
                      return;
                    }
                    setShowPersonPicker(true);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full border border-border/5 transition-all',
                    (isEditingReason ? editedType === 'income' : viewingExpense.isIncome)
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-rose-500/10 text-rose-500',
                    isEditingReason ? 'active:scale-95' : 'cursor-default',
                  )}
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.1em]">
                    {(isEditingReason ? editedType === 'income' : viewingExpense.isIncome) ? 'You Got' : 'You Paid'}
                  </span>
                </button>
              </div>

              {isEditingReason && showCategoryPicker && (
                <div className="max-h-48 overflow-y-auto rounded-2xl border border-border/15 bg-secondary/20 p-2 space-y-1.5">
                  {EXPENSE_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setEditedCategory(category);
                        setShowCategoryPicker(false);
                      }}
                      className={cn(
                        'w-full h-9 rounded-xl border text-[9px] font-black uppercase tracking-[0.14em] transition-all text-left px-3',
                        editedCategory === category
                          ? 'bg-primary/15 text-primary border-primary/25'
                          : 'bg-secondary/30 text-muted-foreground border-border/10',
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isEditingReason && (
              <div className="space-y-3 pt-1">
                <div className="space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/35 text-center">Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditedType('expense')}
                      className={cn(
                        'h-9 rounded-xl border text-[9px] font-black uppercase tracking-[0.14em] transition-all',
                        editedType === 'expense'
                          ? 'bg-rose-500/12 text-rose-500 border-rose-500/25'
                          : 'bg-secondary/30 text-muted-foreground border-border/10',
                      )}
                    >
                      Expense / Debit
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditedType('income')}
                      className={cn(
                        'h-9 rounded-xl border text-[9px] font-black uppercase tracking-[0.14em] transition-all',
                        editedType === 'income'
                          ? 'bg-emerald-500/12 text-emerald-500 border-emerald-500/25'
                          : 'bg-secondary/30 text-muted-foreground border-border/10',
                      )}
                    >
                      Income / Credit
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Data Segments */}
            <div className="space-y-4 pt-1">
              <div className="space-y-1 text-center font-bold tracking-tight">
                <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/30">Purpose</p>
                {isEditingReason ? (
                  <div className="flex items-center gap-2 max-w-xs mx-auto">
                    <input
                      autoFocus
                      type="text"
                      value={editedReason}
                      onChange={(e) => setEditedReason(e.target.value)}
                      placeholder="Enter new purpose..."
                      className="flex-1 h-10 bg-secondary/50 rounded-xl px-4 text-sm font-bold border border-primary/20 outline-none focus:border-primary/50 transition-all"
                    />
                  </div>
                ) : (
                  <h2 className="text-[20px] font-black tracking-tight text-foreground leading-snug uppercase px-4">
                    {viewingExpense.reason || "No Purpose Defined"}
                  </h2>
                )}
              </div>

              <div className="bg-secondary/20 p-4 rounded-2xl border border-border/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-muted-foreground opacity-40" />
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Date Recorded</span>
                </div>
                {isEditingReason ? (
                   <input
                     type="date"
                     value={editedDate}
                     onChange={(e) => setEditedDate(e.target.value)}
                     className="bg-transparent text-[10px] font-black text-foreground/80 outline-none border-b border-dashed border-primary/30"
                   />
                ) : (
                  <span className="text-[10px] font-black text-foreground/80 uppercase tracking-tight">
                    {new Date(viewingExpense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              {/* SAVE BUTTON FOR ALL EDITS */}
              {isEditingReason && (
                <div className="pt-2 px-4">
                  <button 
                    onClick={() => {
                      const finalAmount = parseFloat(editedAmount) || viewingExpense.amount;
                      const finalIsIncome = editedType === 'income';
                      const finalCategory = finalIsIncome ? 'Income' : editedCategory;
                      
                      // Using the new robust updatePersonalExpense function
                      updatePersonalExpense(viewingExpense.id, { 
                        reason: editedReason || viewingExpense.reason,
                        amount: finalAmount,
                        date: editedDate || viewingExpense.date,
                        category: finalCategory,
                        isIncome: finalIsIncome,
                      });

                      setViewingExpense({ 
                        ...viewingExpense, 
                        reason: editedReason || viewingExpense.reason,
                        amount: finalAmount,
                        date: editedDate || viewingExpense.date,
                        category: finalCategory,
                        isIncome: finalIsIncome,
                      });
                      
                      setIsEditingReason(false);
                      setShowCategoryPicker(false);
                      setExpenses(getPersonalExpenses());
                    }}
                    className="w-full h-12 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 active:scale-[0.98] transition-all hover:bg-primary-glow"
                  >
                    <Check size={18} strokeWidth={3} />
                    <span>Save Changes</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center pt-1">
              <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">Personal Transaction Verified</span>
            </div>

            {showPersonPicker && (
              <div className="absolute inset-0 z-20 bg-card/95 backdrop-blur-sm rounded-[3rem] p-5 pt-14 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">Select Person</h3>
                  <button
                    type="button"
                    onClick={() => setShowPersonPicker(false)}
                    className="w-8 h-8 rounded-full bg-secondary border border-border/10 flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>

                <p className="text-[10px] font-semibold text-muted-foreground mb-3">
                  {(isEditingReason ? editedType === 'income' : viewingExpense.isIncome)
                    ? 'Choose who gave you this amount.'
                    : 'Choose who you paid this amount to.'}
                </p>

                <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
                  {existingPersonNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => convertPersonalToShared(name)}
                      className="w-full h-11 rounded-2xl border border-border/10 bg-secondary/25 text-left px-4 text-sm font-bold tracking-tight active:scale-[0.99]"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Sheet */}
      {deletingId && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setDeletingId(null)}>
          <div
            className="w-full max-w-md bg-card rounded-[3rem] p-8 pt-10 pb-12 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-[2.5rem] bg-destructive/10 flex items-center justify-center mx-auto mb-4 animate-pulse border border-destructive/20">
                <Trash2 size={36} className="text-destructive" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-destructive uppercase">Delete Entry?</h2>
              <p className="text-[13px] text-muted-foreground px-4 leading-relaxed font-semibold italic opacity-80">
                This record will be permanently deleted from your personal records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => setDeletingId(null)}
                className="h-14 rounded-2xl bg-secondary font-bold uppercase tracking-wider text-[11px] active:scale-95 transition-all text-muted-foreground"
              >
                KEEP
              </button>
              <button
                onClick={confirmDelete}
                className="h-14 rounded-2xl bg-destructive text-white font-bold uppercase tracking-wider text-[11px] shadow-lg shadow-destructive/20 active:scale-95 transition-all"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
