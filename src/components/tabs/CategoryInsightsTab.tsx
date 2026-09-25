import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { ExpenseChart } from '@/components/ExpenseChart';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { EXPENSE_CATEGORIES, getPersonalExpenses, type PersonalExpense } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useSessionAnimation } from '@/hooks/use-session-animation';

interface CategoryInsightsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

const CATEGORY_STYLES: Record<string, { emoji: string, color: string }> = {
  'Food & Dining': { emoji: '🍔', color: '#f59e0b' },
  'Groceries': { emoji: '🛒', color: '#f59e0b' },
  'Healthcare': { emoji: '🩺', color: '#a855f7' },
  'Bills & Utilities': { emoji: '🏠', color: '#3b82f6' },
  'Transportation': { emoji: '🚗', color: '#ef4444' },
  'Shopping': { emoji: '🛍️', color: '#ec4899' },
  'Entertainment': { emoji: '🎬', color: '#10b981' },
  'Education': { emoji: '📚', color: '#6366f1' },
  'Travel': { emoji: '✈️', color: '#14b8a6' },
  'Other': { emoji: '📦', color: '#b159c3ff' }
};

type TimeRange = '1m' | '3m' | '6m' | '1y';

export function CategoryInsightsTab({ onBack }: CategoryInsightsTabProps) {
  const shouldAnimate = useSessionAnimation('category-tab');
  const [expenses, setExpenses] = useState<PersonalExpense[]>(getPersonalExpenses());
  const [timeRange, setTimeRange] = useState<TimeRange>('3m');

  useEffect(() => {
    const sync = () => setExpenses(getPersonalExpenses());
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const { startDate, endDate, dateRangeLabel } = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // End of current month
    const monthsToSubtract = timeRange === '1m' ? 0 : timeRange === '3m' ? 2 : timeRange === '6m' ? 5 : 11;
    const start = new Date(now.getFullYear(), now.getMonth() - monthsToSubtract, 1, 0, 0, 0);

    const startStr = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const label = timeRange === '1m' ? endStr : `${startStr} – ${endStr}`;

    return { startDate: start, endDate: end, dateRangeLabel: label };
  }, [timeRange]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      const d = new Date(expense.date);
      return d >= startDate && d <= endDate;
    });
  }, [expenses, startDate, endDate]);

  const chartData = useMemo(() => {
    return EXPENSE_CATEGORIES
      .map((category) => {
        const totalAmount = filteredExpenses
          .filter((expense) => expense.category === category)
          .reduce((sum, expense) => sum + expense.amount, 0);

        return {
          name: category,
          value: Math.abs(totalAmount),
          color: CATEGORY_STYLES[category]?.color || CATEGORY_STYLES['Other'].color
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const total = useMemo(() => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0), [filteredExpenses]);

  const toggleTimeRange = () => {
    const ranges: TimeRange[] = ['1m', '3m', '6m', '1y'];
    const nextIdx = (ranges.indexOf(timeRange) + 1) % ranges.length;
    setTimeRange(ranges[nextIdx]);
  };

  const getRangeLabel = (r: TimeRange) => {
    switch (r) {
      case '1m': return '1 month';
      case '3m': return '3 months';
      case '6m': return '6 months';
      case '1y': return '1 year';
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col font-sans bg-background text-foreground">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-5 pt-4 pb-3 flex items-start justify-between border-b border-border/10">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center active:scale-90 transition-all text-foreground mt-0.5"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Categories</h1>
            <p className="text-[13px] text-muted-foreground">{dateRangeLabel}</p>
          </div>
        </div>

        <button
          onClick={toggleTimeRange}
          className="px-4 py-2 rounded-full bg-secondary/50 text-[13px] font-medium text-foreground flex items-center gap-1.5 active:scale-95 transition-all mt-1"
        >
          {getRangeLabel(timeRange)}
        </button>
      </div>

      <div className="px-4 pt-1 pb-6 space-y-4">
        {/* Donut Chart Area */}
        <div>
          {chartData.length > 0 ? (
            <div className="bg-card border border-border/10 rounded-[1.75rem] py-2 px-4 shadow-sm relative w-full mx-auto">
              <ExpenseChart
                animate={shouldAnimate}
                data={chartData}
                type="pie"
                height={160}
                pieCenterLabel="TOTAL"
                pieCenterSubLabel="Expenses"
              />
            </div>
          ) : (
            <div className="w-full h-[280px] flex flex-col items-center justify-center bg-card rounded-[2rem] border border-border/10">
              <p className="text-muted-foreground italic mb-2">No expenses</p>
              <MoneyDisplay amount={0} hideSymbol size="lg" className="font-bold text-muted-foreground/60 text-2xl" />
            </div>
          )}
        </div>

        {/* Expenses List */}
        <div className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <div>
              <h3 className="text-lg font-bold">Expenses by Category</h3>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            {chartData.length > 0 ? chartData.map((item, idx) => {
              const style = CATEGORY_STYLES[item.name] || CATEGORY_STYLES['Other'];
              return (
                <div 
                  key={item.name} 
                  className={cn(
                    "bg-card border border-border/10 flex items-center justify-between p-4 shadow-sm",
                    chartData.length === 1 ? "rounded-[1.25rem]" :
                    idx === 0 ? "rounded-t-[1.25rem] rounded-b-[0.5rem]" :
                    idx === chartData.length - 1 ? "rounded-t-[0.5rem] rounded-b-[1.25rem]" :
                    "rounded-[0.5rem]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.color }} />
                    <span className="text-xl leading-none">{style.emoji}</span>
                    <span className="font-medium text-[15px]">{item.name}</span>
                  </div>
                  <MoneyDisplay amount={-item.value} className="font-semibold text-[15px]" />
                </div>
              )
            }) : (
              <div className="p-8 text-center text-muted-foreground italic bg-card rounded-[1.25rem] border border-border/10">
                No categories found for this period.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
