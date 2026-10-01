import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Lock, Crown } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import {
  getPersonalExpenses,
  getSharedExpenses,
  getSubscriptions,
  type PersonalExpense,
  type SharedExpense,
  type SubscriptionItem,
} from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useBannerAd } from '@/hooks/useBannerAd';
import { isProUserCached } from '@/lib/proAccess';

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
  subscriptionLogoUrl?: string;
  mirrorFromId?: string;
}

const getCurrentLocalMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

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

const toCalendarTransaction = (
  item: PersonalExpense | SharedExpense,
  source: 'personal' | 'shared',
  subscriptions: SubscriptionItem[],
): CalendarTransaction | null => {
  const activityAt = item.date || item.createdAt;
  const dayKey = getLocalDayKey(activityAt);
  if (!dayKey) return null;
  const sortAt = item.createdAt || activityAt || new Date().toISOString();

  if (source === 'personal') {
    const personal = item as PersonalExpense;
    const title = pickTitle(personal.reason, personal.category, 'Personal Transaction');

    // Look up subscription logo if this is a subscription mirror expense
    let subscriptionLogoUrl: string | undefined;
    if (personal.source === 'subscription' && personal.mirrorFromId) {
      const sub = subscriptions.find((s) => s.id === personal.mirrorFromId);
      subscriptionLogoUrl = sub?.logoUrl;
    }

    return {
      id: personal.id,
      amount: personal.amount,
      title,
      subtitle: personal.category || 'Personal',
      direction: personal.isIncome ? 'income' : 'outgoing',
      source,
      dayKey,
      sortAt,
      subscriptionLogoUrl,
      mirrorFromId: personal.mirrorFromId,
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

// Build a map: dayKey → up to 3 subscription logos for that day
function buildDaySubLogos(
  transactions: CalendarTransaction[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  transactions.forEach((t) => {
    if (t.subscriptionLogoUrl) {
      const existing = map.get(t.dayKey) ?? [];
      if (!existing.includes(t.subscriptionLogoUrl) && existing.length < 3) {
        map.set(t.dayKey, [...existing, t.subscriptionLogoUrl]);
      }
    }
  });
  return map;
}

export function CalendarTab({ onOpenAccount, onBack, bannerAdActive = true }: CalendarTabProps) {
  useBannerAd(bannerAdActive);

  const isPro = isProUserCached();
  const currentMonthKey = getCurrentLocalMonthKey();

  const subscriptions = useMemo(() => getSubscriptions(), []);

  const transactions = useMemo(() => {
    const personal = getPersonalExpenses()
      .map((item) => toCalendarTransaction(item, 'personal', subscriptions))
      .filter((item): item is CalendarTransaction => Boolean(item));

    const shared = getSharedExpenses()
      .map((item) => toCalendarTransaction(item, 'shared', subscriptions))
      .filter((item): item is CalendarTransaction => Boolean(item));

    return [...personal, ...shared].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime(),
    );
  }, [subscriptions]);

  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(
    getLocalDayKey(new Date().toISOString()),
  );

  const isPastMonth = selectedMonthKey < currentMonthKey;
  const isFutureMonth = selectedMonthKey > currentMonthKey;

  const canGoPrev = isPro
    ? true // Pro can go back as far as they want
    : selectedMonthKey > currentMonthKey; // Free can only navigate to current or future

  const canGoNext = !isFutureMonth; // nobody goes past current month (no data)

  const goToPrev = () => {
    if (!canGoPrev) return;
    const [y, m] = selectedMonthKey.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonthKey(prev);
    setSelectedDayKey('');
  };

  const goToNext = () => {
    if (!canGoNext) return;
    const [y, m] = selectedMonthKey.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonthKey(next);
    setSelectedDayKey('');
  };

  const monthTransactions = useMemo(
    () => transactions.filter((item) => getMonthKey(item.dayKey) === selectedMonthKey),
    [selectedMonthKey, transactions],
  );

  const monthMarkedDays = useMemo(() => {
    const map = new Map<string, number>();
    monthTransactions.forEach((item) => {
      map.set(item.dayKey, (map.get(item.dayKey) || 0) + 1);
    });
    return map;
  }, [monthTransactions]);

  const daySubLogos = useMemo(() => buildDaySubLogos(monthTransactions), [monthTransactions]);

  const selectedDayTransactions = useMemo(
    () => monthTransactions.filter((item) => item.dayKey === selectedDayKey),
    [monthTransactions, selectedDayKey],
  );

  const selectedDayIncome = selectedDayTransactions
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amount, 0);

  const selectedDayOutgoing = selectedDayTransactions
    .filter((item) => item.direction === 'outgoing')
    .reduce((sum, item) => sum + item.amount, 0);

  const [year, month] = selectedMonthKey.split('-').map(Number);
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  // Pad the grid so it's always full weeks (multiples of 7)
  const totalSlots = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
  const daySlots = Array.from({ length: totalSlots }, (_, index) => {
    const dayNumber = index - firstDayOfWeek + 1;
    if (dayNumber <= 0 || dayNumber > daysInMonth) return null;
    const dayKey = `${selectedMonthKey}-${String(dayNumber).padStart(2, '0')}`;
    return { dayNumber, dayKey };
  });

  const todayKey = getLocalDayKey(new Date().toISOString());
  const isCurrentMonth = selectedMonthKey === currentMonthKey;

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col font-sans relative">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border/10">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all mt-0.5"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-0.5">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">
              Calendar<span className="text-primary">.</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">
              Track days with spending activity
            </p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      <div className="flex-1 px-4 pt-4 pb-2 space-y-5">

        {/* Calendar card */}
        <div className="rounded-[1.5rem] border border-border/15 bg-gradient-to-b from-card/90 to-card/60 overflow-hidden">

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={goToPrev}
              className={cn(
                'w-9 h-9 rounded-xl border border-border/20 bg-secondary/40 flex items-center justify-center transition-all active:scale-90',
                !canGoPrev ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary/70',
              )}
            >
              {!isPro && !isFutureMonth ? (
                <Lock size={15} className="text-muted-foreground" />
              ) : (
                <ChevronLeft size={18} />
              )}
            </button>

            <div className="text-center">
              <p className="text-base font-bold">{monthLabel(selectedMonthKey)}</p>
            </div>

            <button
              type="button"
              disabled={!canGoNext}
              onClick={goToNext}
              className={cn(
                'w-9 h-9 rounded-xl border border-border/20 bg-secondary/40 flex items-center justify-center transition-all active:scale-90',
                !canGoNext ? 'opacity-30 cursor-not-allowed' : 'hover:bg-secondary/70',
              )}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Pro lock overlay for past months when user is free */}
          {isPastMonth && !isPro ? (
            <div className="mx-4 mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 py-10 flex flex-col items-center gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <Crown size={22} className="text-amber-500" />
              </div>
              <p className="text-sm font-bold text-foreground">Pro Only</p>
              <p className="text-xs text-muted-foreground">
                Upgrade to Pro to view past months and your full transaction history.
              </p>
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-2 pb-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0 px-2 pb-4">
                {daySlots.map((slot, index) => {
                  if (!slot) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="flex flex-col items-center justify-start pt-1 pb-2 min-h-[52px]"
                      />
                    );
                  }

                  const count = monthMarkedDays.get(slot.dayKey) || 0;
                  const logos = daySubLogos.get(slot.dayKey) ?? [];
                  const selected = slot.dayKey === selectedDayKey;
                  const isToday = slot.dayKey === todayKey && isCurrentMonth;
                  const hasActivity = count > 0;

                  return (
                    <button
                      key={slot.dayKey}
                      type="button"
                      onClick={() => setSelectedDayKey(slot.dayKey)}
                      className={cn(
                        'flex flex-col items-center justify-start pt-1 pb-1.5 min-h-[52px] rounded-xl transition-all active:scale-95 relative',
                        selected && 'bg-primary/10',
                      )}
                    >
                      {/* Day number */}
                      <span
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold leading-none',
                          isToday && !selected
                            ? 'bg-primary text-primary-foreground font-bold'
                            : selected
                            ? 'bg-primary text-primary-foreground font-bold'
                            : hasActivity
                            ? 'text-foreground font-bold'
                            : 'text-muted-foreground',
                        )}
                      >
                        {slot.dayNumber}
                      </span>

                      {/* Subscription logos OR transaction count dot */}
                      {hasActivity && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5 h-[18px]">
                          {logos.length > 0 ? (
                            logos.map((logoUrl, i) => (
                              <img
                                key={i}
                                src={logoUrl}
                                alt=""
                                className="w-[14px] h-[14px] rounded-full object-cover ring-[1px] ring-background shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ))
                          ) : (
                            <span className="w-[6px] h-[6px] rounded-full bg-primary/70 shrink-0" />
                          )}
                          {count > (logos.length > 0 ? logos.length : 0) && logos.length === 0 && count > 1 && (
                            <span className="text-[9px] font-bold text-primary/70 leading-none">
                              {count}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Transactions panel */}
        {(!isPastMonth || isPro) && (
          <div className="space-y-3">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                {selectedDayKey
                  ? (() => {
                      try {
                        const d = new Date(selectedDayKey);
                        return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
                      } catch {
                        return 'Transactions';
                      }
                    })()
                  : 'Transactions'}
              </h2>
              {selectedDayTransactions.length > 0 && (
                <span className="text-xs text-muted-foreground font-medium">
                  {selectedDayTransactions.length} transaction{selectedDayTransactions.length !== 1 ? 's' : ''}
                  {selectedDayOutgoing > 0 && (
                    <> · <MoneyDisplay amount={-selectedDayOutgoing} showSign /></>
                  )}
                </span>
              )}
            </div>

            {selectedDayTransactions.length === 0 ? (
              <div className="rounded-2xl border border-border/10 bg-card/50 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {selectedDayKey ? 'No transactions for this day.' : 'Pick a date from the calendar above.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDayTransactions.map((item) => (
                  <div
                    key={`${item.source}-${item.id}`}
                    className="rounded-2xl border border-border/10 bg-card/70 px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon — subscription logo or direction arrow */}
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full border flex items-center justify-center shrink-0 overflow-hidden',
                          item.direction === 'income'
                            ? 'border-emerald-500/20 text-emerald-500'
                            : 'border-rose-500/20 text-rose-500',
                        )}
                      >
                        {item.subscriptionLogoUrl ? (
                          <img
                            src={item.subscriptionLogoUrl}
                            alt={item.title}
                            className="w-full h-full object-cover rounded-full"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : item.direction === 'income' ? (
                          <ArrowDownLeft size={16} />
                        ) : (
                          <ArrowUpRight size={16} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'text-sm font-semibold whitespace-nowrap',
                        item.direction === 'income' ? 'text-emerald-500' : 'text-rose-500',
                      )}
                    >
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
        )}

        {/* Free user locked past month CTA */}
        {isPastMonth && !isPro && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Crown size={20} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Unlock History</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Go Pro to browse any past month's transactions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
