import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, PieChart, Target, Wallet, TrendingUp } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { ExpenseChart } from '@/components/ExpenseChart';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { EXPENSE_CATEGORIES, getPersonalExpenses, type PersonalExpense } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useBannerAd } from '@/hooks/useBannerAd';

interface CategoryInsightsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

function getMonthOptions(): Array<{ key: string; label: string }> {
  const startYear = 2025;
  const endYear = new Date().getFullYear() + 1;
  const options: Array<{ key: string; label: string }> = [];

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      }).replace(' ', '’');
      options.push({ key, label });
    }
  }

  return options;
}

export function CategoryInsightsTab({ onOpenAccount, onBack, bannerAdActive = true }: CategoryInsightsTabProps) {
  useBannerAd(bannerAdActive);
  const [expenses, setExpenses] = useState<PersonalExpense[]>(getPersonalExpenses());
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);
  const monthTabsRef = useRef<HTMLDivElement | null>(null);
  const currentMonthChipRef = useRef<HTMLButtonElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartedOnMonthStripRef = useRef(false);
  const [jumpDirection, setJumpDirection] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const sync = () => setExpenses(getPersonalExpenses());
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

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

  const selectedMonthIndex = useMemo(
    () => monthOptions.findIndex((month) => month.key === selectedMonthKey),
    [monthOptions, selectedMonthKey],
  );

  const shiftMonth = (direction: 'left' | 'right') => {
    if (selectedMonthIndex < 0) return;
    const delta = direction === 'left' ? 1 : -1;
    const nextIndex = selectedMonthIndex + delta;
    if (nextIndex < 0 || nextIndex >= monthOptions.length) return;
    setSelectedMonthKey(monthOptions[nextIndex].key);
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

  const handleMonthSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const startedOnSwipeDisabled = !!target?.closest('[data-disable-swipe="true"]');
    if (startedOnSwipeDisabled) {
      touchStartedOnMonthStripRef.current = false;
      return;
    }

    const monthStrip = monthTabsRef.current;
    touchStartedOnMonthStripRef.current = !!(target && monthStrip && monthStrip.contains(target));

    if (touchStartedOnMonthStripRef.current) return;

    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleMonthSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartedOnMonthStripRef.current) {
      touchStartedOnMonthStripRef.current = false;
      return;
    }

    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (startX === null || startY === null) return;

    const endX = event.changedTouches[0]?.clientX;
    const endY = event.changedTouches[0]?.clientY;
    if (typeof endX !== 'number' || typeof endY !== 'number') return;

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

  const monthExpenses = useMemo(() => {
    return expenses
      .filter((expense) => expense.date.startsWith(selectedMonthKey))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedMonthKey]);

  const chartData = useMemo(() => {
    return EXPENSE_CATEGORIES
      .map((category) => {
        const totalAmount = monthExpenses
          .filter((expense) => expense.category === category)
          .reduce((sum, expense) => sum + expense.amount, 0);

        return {
          name: category,
          value: Math.abs(totalAmount),
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses]);

  const total = useMemo(() => monthExpenses.reduce((sum, expense) => sum + expense.amount, 0), [monthExpenses]);

  return (
    <div
      className="p-4 pb-40 space-y-6"
      onTouchStart={handleMonthSwipeStart}
      onTouchEnd={handleMonthSwipeEnd}
    >
      {/* Header Section */}
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl flex items-center justify-center mt-1 bg-secondary/80 border border-border/10 active:scale-95 transition-all"
            >
              <ArrowLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight leading-none">Categories</h1>
            <p className="text-sm text-muted-foreground font-medium opacity-60">Insight into your spending</p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      {/* Modern Month Strip */}
      <div className="relative -mx-4 px-4 py-2 bg-gradient-to-b from-transparent to-secondary/5">
        {jumpDirection === 'left' && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
             <button
               onClick={handleJumpToCurrentMonth}
               className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 flex items-center justify-center text-primary shadow-md animate-pulse"
             >
               <ChevronLeft size={16} strokeWidth={3} />
             </button>
          </div>
        )}

        <div
          ref={monthTabsRef}
          className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide no-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {monthOptions.map((month) => {
            const isActive = month.key === selectedMonthKey;
            return (
              <button
                key={month.key}
                data-month-key={month.key}
                ref={month.key === currentMonthKey ? currentMonthChipRef : null}
                onClick={() => setSelectedMonthKey(month.key)}
                className={cn(
                   "px-5 py-2.5 rounded-[1.25rem] text-[11px] font-black uppercase tracking-[0.1em] whitespace-nowrap transition-all duration-300 flex-shrink-0 border-2",
                   isActive 
                   ? "bg-primary text-primary-foreground border-primary scale-105" 
                   : "bg-card text-muted-foreground/60 border-transparent hover:border-border/30 hover:bg-secondary/30"
                )}
              >
                {month.label}
              </button>
            );
          })}
        </div>

        {jumpDirection === 'right' && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
             <button
               onClick={handleJumpToCurrentMonth}
               className="w-8 h-8 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 flex items-center justify-center text-primary shadow-md animate-pulse"
             >
               <ChevronRight size={16} strokeWidth={3} />
             </button>
          </div>
        )}
      </div>

      {/* Main Spend Card */}
      <div className="relative group overflow-hidden rounded-[2.5rem] p-8 text-center bg-card border border-border/40 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
         <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <TrendingUp size={120} strokeWidth={3} className="text-foreground" />
         </div>
         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 mb-3">Total Spend for {monthOptions.find((m) => m.key === selectedMonthKey)?.label}</p>
         <MoneyDisplay amount={-total} size="xl" className="font-black tracking-tighter text-destructive" />
         
         <div className="mt-6 flex items-center justify-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/40 italic">Analysis complete</p>
         </div>
      </div>

      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* Chart Section */}
          <div className="ios-card-modern p-6 space-y-4 rounded-[2.5rem] bg-card border border-border/40">
            <div className="flex items-center justify-between">
               <h3 className="font-black text-[13px] uppercase tracking-widest flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-600">
                    <PieChart size={18} strokeWidth={2.5} />
                  </div>
                  Spending Trends
               </h3>
               <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Line Analysis</p>
            </div>
            <div className="p-2 rounded-[2rem] bg-secondary/5 border border-border/5">
               <ExpenseChart data={chartData} type="line" height={240} />
            </div>
          </div>

          {/* Categories List */}
          <div className="space-y-4">
             <div className="px-2 flex items-center justify-between">
                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Category breakdown</h4>
                <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
             </div>
             
             <div className="flex flex-col gap-4">
                {chartData.map((item, idx) => {
                  const absoluteTotal = Math.abs(total);
                  const ratio = absoluteTotal > 0 ? (item.value / absoluteTotal) * 100 : 0;
                  return (
                    <div key={item.name} className="contents">
                      <div 
                        className="group relative flex flex-col p-5 rounded-[2.25rem] bg-card border border-border/30 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                      >
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                             <div className={cn(
                                "w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner font-black text-xs",
                                idx === 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                             )}>
                                {item.name.substring(0, 1).toUpperCase()}
                             </div>
                             <div>
                                <p className="font-extrabold text-[15px] tracking-tight leading-none mb-1">{item.name}</p>
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/40">{ratio.toFixed(0)}% of monthly budget</p>
                             </div>
                          </div>
                          <div className="text-right">
                             <MoneyDisplay amount={-item.value} size="md" className="font-black leading-none" />
                          </div>
                        </div>
                        
                        <div className="relative h-2.5 w-full rounded-full bg-secondary/40 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-1000 ease-out",
                              idx === 0 ? "bg-destructive" : "bg-primary"
                            )}
                            style={{
                              width: `${Math.max(4, Math.min(100, ratio))}%`,
                            }}
                          />
                          <div className="absolute inset-x-0 h-full w-20 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
                        </div>
                        
                        {/* Ambient corner decoration */}
                        <div className={cn(
                           "absolute bottom-0 right-0 w-12 h-12 opacity-[0.03] pointer-events-none rounded-br-[2.25rem] transition-all group-hover:scale-150",
                           idx === 0 ? "bg-destructive" : "bg-primary"
                        )} />
                      </div>
                      {idx === 0 && <NativeAdCard className="mb-3" />}
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      ) : (
        <div className="p-16 text-center rounded-[3rem] bg-secondary/15 border border-dashed border-border/40">
           <PieChart className="mx-auto mb-4 text-muted-foreground/20" size={56} strokeWidth={1.5} />
           <p className="text-sm font-bold text-muted-foreground/50 italic italic px-6 leading-relaxed"> No spending patterns detected for this cycle. Start tracking to see insights.</p>
        </div>
      )}
    </div>
  );
}
