import { useMemo, useState, useRef } from 'react';
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
import { isProUserCached, requestProUpgrade } from '@/lib/proAccess';

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

  const triggerProUpgrade = () =>
    requestProUpgrade('calendar-history', 'Upgrade to Pro to browse past months and your full transaction history.');

  const canGoPrev = isPro;
  const canGoNext = !isFutureMonth;

  const goToPrev = () => {
    if (!isPro) { triggerProUpgrade(); return; }
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

  // Swipe detection
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return; // ignore tiny swipes
    if (dx > 0) {
      // swipe right → go to previous month
      goToPrev();
    } else {
      // swipe left → go to next month
      goToNext();
    }
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
      <div className="sticky top-0 z-30 relative px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="absolute inset-x-0 top-0 h-24 z-0 bg-gradient-to-b from-background/95 via-background/70 to-transparent backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0%,black_52%,transparent_100%)] pointer-events-none" />
        <div className="flex items-start gap-4 relative z-10 min-w-0 drop-shadow-[0_1px_3px_hsl(var(--background)/0.9)]">
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
        <div
          className="rounded-[1.5rem] border border-border/15 bg-gradient-to-b from-card/90 to-card/60 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            {/* Left — lock or chevron */}
            <button
              type="button"
              onClick={goToPrev}
              className="w-9 h-9 rounded-xl border border-border/20 bg-secondary/40 flex items-center justify-center transition-all active:scale-90 hover:bg-secondary/70"
            >
              {!isPro ? (
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
                  className="flex flex-col items-center justify-start pt-1 pb-1.5 min-h-[52px] rounded-xl transition-all active:scale-95 relative"
                >
                  {/* Day number — only this gets the orange circle */}
                  <span
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold leading-none',
                      isToday || selected
                        ? 'bg-primary text-primary-foreground font-bold'
                        : hasActivity
                        ? 'text-foreground font-bold'
                        : 'text-muted-foreground',
                    )}
                  >
                    {slot.dayNumber}
                  </span>

                  {/* Subscription logos OR dot */}
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
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transactions panel — always show for current/future, show for past only if pro */}
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
      </div>
    </div>
  );
}
