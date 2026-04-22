import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { getPersonalExpenses, getSharedExpenses, type PersonalExpense, type SharedExpense } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useBannerAd } from '@/hooks/useBannerAd';

interface CalendarTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

type CalendarDirection = 'income' | 'outgoing';

interface CalendarTransaction {
  id: string;
  amount: number;
  title: string;
  subtitle: string;
  direction: CalendarDirection;
  source: 'personal' | 'shared';
  dayKey: string;
  sortAt: string;
}

const CALENDAR_START_MONTH_KEY = 'splitmate_calendar_start_month';

const getCurrentLocalMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const isMonthKey = (value: string) => /^\d{4}-\d{2}$/.test(value);

const pickTitle = (reason?: string, category?: string, fallback = 'Transaction') => {
  const cleanReason = (reason || '').trim();
  if (cleanReason) return cleanReason;
  const cleanCategory = (category || '').trim();
  if (cleanCategory) return cleanCategory;
  return fallback;
};

const getLocalDayKey = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
};

const getMonthKey = (value: string) => value.slice(0, 7);

const toCalendarTransaction = (item: PersonalExpense | SharedExpense, source: 'personal' | 'shared'): CalendarTransaction | null => {
  // Use the transaction date first so month navigation reflects when it happened.
  const activityAt = item.date || item.createdAt;
  const dayKey = getLocalDayKey(activityAt);
  if (!dayKey) return null;
  const sortAt = item.createdAt || activityAt || new Date().toISOString();

  if (source === 'personal') {
    const personal = item as PersonalExpense;
    const title = pickTitle(personal.reason, personal.category, 'Personal Transaction');
    return {
      id: personal.id,
      amount: personal.amount,
      title,
      subtitle: personal.category || 'Personal',
      direction: personal.isIncome ? 'income' : 'outgoing',
      source,
      dayKey,
      sortAt,
    };
  }

  const shared = item as SharedExpense;
  const direction: CalendarDirection = shared.paidBy === 'me' ? 'outgoing' : 'income';
  const title = pickTitle(shared.reason, shared.category, 'Shared Transaction');
  const subtitle = shared.personName?.trim() ? shared.personName : 'Shared';
  return {
    id: shared.id,
    amount: shared.amount,
    title,
    subtitle,
    direction,
    source,
    dayKey,
    sortAt,
  };
};

export function CalendarTab({ onOpenAccount, onBack, bannerAdActive = true }: CalendarTabProps) {
  useBannerAd(bannerAdActive);

  const transactions = useMemo(() => {
    const personal = getPersonalExpenses()
      .map((item) => toCalendarTransaction(item, 'personal'))
      .filter((item): item is CalendarTransaction => Boolean(item));

    const shared = getSharedExpenses()
      .map((item) => toCalendarTransaction(item, 'shared'))
      .filter((item): item is CalendarTransaction => Boolean(item));

    return [...personal, ...shared].sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  }, []);

  const currentMonthKey = getCurrentLocalMonthKey();

  const firstMonthKey = useMemo(() => {
    const oldestTransactionMonth = transactions.length > 0
      ? [...transactions]
          .sort((a, b) => a.dayKey.localeCompare(b.dayKey))[0]
          .dayKey
          .slice(0, 7)
      : currentMonthKey;

    let storedStartMonth = '';
    try {
      storedStartMonth = localStorage.getItem(CALENDAR_START_MONTH_KEY) || '';
    } catch {
      storedStartMonth = '';
    }

    const validStored = isMonthKey(storedStartMonth) ? storedStartMonth : '';
    let resolvedStartMonth = validStored
      ? (validStored < oldestTransactionMonth ? validStored : oldestTransactionMonth)
      : oldestTransactionMonth;

    if (resolvedStartMonth > currentMonthKey) {
      resolvedStartMonth = currentMonthKey;
    }

    try {
      localStorage.setItem(CALENDAR_START_MONTH_KEY, resolvedStartMonth);
    } catch {
      // Ignore write failures in restricted environments.
    }

    return resolvedStartMonth;
  }, [transactions, currentMonthKey]);

  const monthKeys = useMemo(() => {
    const [startYear, startMonth] = firstMonthKey.split('-').map(Number);
    const [endYear, endMonth] = currentMonthKey.split('-').map(Number);
    const result: string[] = [];

    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
      result.push(`${year}-${String(month).padStart(2, '0')}`);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return result;
  }, [currentMonthKey, firstMonthKey]);

  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(getLocalDayKey(new Date().toISOString()));

  const selectedMonthIndex = monthKeys.indexOf(selectedMonthKey);

  const monthTransactions = useMemo(() => {
    return transactions.filter((item) => getMonthKey(item.dayKey) === selectedMonthKey);
  }, [selectedMonthKey, transactions]);

  const monthMarkedDays = useMemo(() => {
    const map = new Map<string, number>();
    monthTransactions.forEach((item) => {
      map.set(item.dayKey, (map.get(item.dayKey) || 0) + 1);
    });
    return map;
  }, [monthTransactions]);

  const selectedDayTransactions = useMemo(() => {
    return monthTransactions.filter((item) => item.dayKey === selectedDayKey);
  }, [monthTransactions, selectedDayKey]);

  const selectedDayIncome = selectedDayTransactions
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amount, 0);

  const selectedDayOutgoing = selectedDayTransactions
    .filter((item) => item.direction === 'outgoing')
    .reduce((sum, item) => sum + item.amount, 0);

  const [year, month] = selectedMonthKey.split('-').map(Number);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daySlots = Array.from({ length: firstDayOfWeek + daysInMonth }, (_, index) => {
    const dayNumber = index - firstDayOfWeek + 1;
    if (dayNumber <= 0) return null;
    const dayKey = `${selectedMonthKey}-${String(dayNumber).padStart(2, '0')}`;
    return { dayNumber, dayKey };
  });

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
            <h1 className="text-2xl font-bold tracking-tight leading-none">Transaction Calendar</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80 max-w-[320px] leading-tight">
              Track days with activity and tap a date to view all income and outgoing transactions.
            </p>
          </div>
        </div>
        <AccountQuickButton onClick={onOpenAccount} />
      </div>

      <div className="rounded-3xl border border-border/15 bg-gradient-to-b from-card/90 to-card/60 p-4 space-y-4 shadow-[0_10px_40px_-30px_hsl(var(--foreground)/0.4)]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={selectedMonthIndex <= 0}
            onClick={() => {
              const prev = monthKeys[selectedMonthIndex - 1];
              if (!prev) return;
              setSelectedMonthKey(prev);
              setSelectedDayKey('');
            }}
            className="w-10 h-10 rounded-xl border border-border/20 bg-secondary/40 hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} className="mx-auto" />
          </button>

          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Month</p>
            <p className="text-base font-bold">{monthLabel(selectedMonthKey)}</p>
          </div>

          <button
            type="button"
            disabled={selectedMonthIndex < 0 || selectedMonthIndex >= monthKeys.length - 1}
            onClick={() => {
              const next = monthKeys[selectedMonthIndex + 1];
              if (!next) return;
              setSelectedMonthKey(next);
              setSelectedDayKey('');
            }}
            className="w-10 h-10 rounded-xl border border-border/20 bg-secondary/40 hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} className="mx-auto" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {daySlots.map((slot, index) => {
            if (!slot) return <div key={`empty-${index}`} className="aspect-square w-full" />;

            const count = monthMarkedDays.get(slot.dayKey) || 0;
            const selected = slot.dayKey === selectedDayKey;
            const hasTransactions = count > 0;

            return (
              <button
                key={slot.dayKey}
                type="button"
                onClick={() => setSelectedDayKey(slot.dayKey)}
                className={cn(
                  'aspect-square w-full rounded-full border text-sm font-semibold flex items-center justify-center transition-all',
                  hasTransactions
                    ? 'bg-black text-white border-black/70 dark:bg-white dark:text-black dark:border-white/70'
                    : 'border-border/10 bg-secondary/20 text-foreground',
                  selected && hasTransactions && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
                  selected && !hasTransactions && 'border-primary/40 bg-primary/15 text-primary ring-1 ring-primary/30',
                )}
              >
                <span>{slot.dayNumber}</span>
              </button>
            );
          })}
        </div>

      </div>

      <div className="rounded-3xl border border-border/15 bg-card/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Selected Day</p>
            <p className="text-sm font-semibold">{selectedDayKey || 'Pick a date from the calendar'}</p>
          </div>
          <CalendarDays size={18} className="text-primary" />
        </div>

        {selectedDayTransactions.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Income</p>
              <p className="text-sm font-semibold text-emerald-600">
                <MoneyDisplay amount={Math.abs(selectedDayIncome)} showSign />
              </p>
            </div>
            <div className="rounded-2xl border border-rose-500/15 bg-rose-500/8 p-3">
              <p className="text-[10px] uppercase tracking-wider text-rose-500 font-bold">Outgoing</p>
              <p className="text-sm font-semibold text-rose-500">
                <MoneyDisplay amount={-Math.abs(selectedDayOutgoing)} showSign />
              </p>
            </div>
          </div>
        )}

        {selectedDayTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions for this day.</p>
        ) : (
          <div className="space-y-2">
            {selectedDayTransactions.map((item) => (
              <div key={`${item.source}-${item.id}`} className="rounded-2xl border border-border/10 bg-secondary/20 px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full border flex items-center justify-center shrink-0',
                      item.direction === 'income'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-500',
                    )}
                    aria-hidden="true"
                  >
                    {item.direction === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  'text-sm font-semibold whitespace-nowrap',
                  item.direction === 'income' ? 'text-emerald-600' : 'text-rose-500',
                )}>
                  <MoneyDisplay
                    amount={item.direction === 'income' ? Math.abs(item.amount) : -Math.abs(item.amount)}
                    showSign
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
