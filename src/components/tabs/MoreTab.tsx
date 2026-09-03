import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, CalendarClock, CreditCard, ExternalLink, Landmark, Repeat, Sparkles, Target, User, Users, WalletCards, PieChart, X, Globe, ArrowRightLeft, MessageSquare, CalendarDays, ListOrdered, LucideIcon, List, LayoutGrid } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import {
  FIXED_BOTTOM_TAB_IDS,
  MAX_BOTTOM_TABS,
  getBudgetPlannerConfig,
  getAccountSummaries,
  getGoals,
  getGroups,
  getLinks,
  getLoans,
  getPersonalExpenses,
  getRecurringPayments,
  getSharedExpenses,
  getSubscriptions,
  getTabConfig,
  setTabConfig as persistTabConfig,
} from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';
import { CurrencyConverterModal } from '@/components/modals/CurrencyConverterModal';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAdFree } from '@/hooks/useAdFree';
import { getAllAppTransactions } from '@/lib/transactions';

interface MoreTabProps {
  onOpenAccount: () => void;
  onOpenFeatureTab: (tabId: string) => void;
}

const MORE_CARD_TAB_IDS = [
  'personal',
  'transactions',
  'shared',
  'links',
  'categories',
  'budgets',
  'accounts',
  'loans',
  'goals',
  'subscriptions',
  'converter',
  'calendar',
  'recurring',
] as const;

const TAB_LABELS: Record<string, string> = {
  home: 'Home',
  personal: 'Personal',
  transactions: 'Transactions',
  shared: 'Split',
  links: 'Links',
  categories: 'Categories',
  budgets: 'Budgets',
  accounts: 'Accounts',
  loans: 'Loans',
  goals: 'Savings',
  subscriptions: 'Subscriptions',
  converter: 'Converter',
  more: 'More',
};

const TAB_ICONS: Record<string, LucideIcon> = {
  personal: User,
  transactions: ListOrdered,
  shared: Users,
  links: ExternalLink,
  categories: PieChart,
  budgets: WalletCards,
  accounts: CreditCard,
  loans: Landmark,
  goals: Target,
  subscriptions: Repeat,
  converter: ArrowRightLeft,
  more: Globe,
};

const TAB_COLORS: Record<string, string> = {
  personal: 'text-primary',
  transactions: 'text-primary',
  shared: 'text-warning',
  links: 'text-primary',
  categories: 'text-primary',
  budgets: 'text-primary',
  accounts: 'text-primary',
  loans: 'text-warning',
  goals: 'text-success',
  subscriptions: 'text-primary',
  converter: 'text-primary',
};

export function MoreTab({ onOpenAccount, onOpenFeatureTab }: MoreTabProps) {
  const { isAdFree } = useAdFree();
  const [tabConfig, setTabConfigState] = useState(() => getTabConfig());
  const [swapTabId, setSwapTabId] = useState<string | null>(null);
  const [isSwapMode, setIsSwapMode] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showConverter, setShowConverter] = useState(false);
  const { toast } = useToast();
  const currency = useCurrency();

  useBackHandler(showConverter, () => setShowConverter(false));
  useBackHandler(!!swapTabId, () => setSwapTabId(null));

  const personalCount = getPersonalExpenses().length;
  const sharedCount = getSharedExpenses().length;
  const linkCount = getLinks().length + getGroups().length;
  const loansCount = getLoans().length;
  const goalsCount = getGoals().length;
  const subscriptionsCount = getSubscriptions().length;
  const allTransactionsCount = getAllAppTransactions().length;
  const recurringPayments = getRecurringPayments();
  const recurringActiveCount = recurringPayments.filter((p) => p.enabled).length;
  const calendarDayCount = useMemo(() => {
    const keys = new Set<string>();
    getPersonalExpenses().forEach((expense) => {
      const key = (expense.createdAt || expense.date || '').slice(0, 10);
      if (key) keys.add(key);
    });
    getSharedExpenses().forEach((expense) => {
      const key = (expense.createdAt || expense.date || '').slice(0, 10);
      if (key) keys.add(key);
    });
    return keys.size;
  }, []);
  const accountSummaries = getAccountSummaries();
  const accountsCount = accountSummaries.length;
  const totalAccountsAvailable = accountSummaries.reduce((sum, account) => sum + account.available, 0);
  const budgetConfig = getBudgetPlannerConfig();

  const budgetDailyAllowanceText = useMemo(() => {
    if (budgetConfig.monthlyIncome <= 0) return 'Set Plan';
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const spentThisMonth = getPersonalExpenses()
      .filter((expense) => expense.date.startsWith(monthKey))
      .reduce((sum, expense) => sum + expense.amount, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);
    const available = budgetConfig.monthlyIncome - budgetConfig.fixedExpenses - budgetConfig.savingsGoal;
    const daily = (available - spentThisMonth) / remainingDays;
    return `${daily >= 0 ? '' : '-'}${currency.symbol}${Math.abs(daily).toLocaleString(currency.locale, { maximumFractionDigits: 0 })}/day`;
  }, [budgetConfig.fixedExpenses, budgetConfig.monthlyIncome, budgetConfig.savingsGoal, currency.locale, currency.symbol]);

  useEffect(() => {
    const syncConfig = () => setTabConfigState(getTabConfig());
    syncConfig();
    window.addEventListener('splitmate_tab_config_changed', syncConfig);
    window.addEventListener('splitmate_currency_changed', syncConfig);
    window.addEventListener('focus', syncConfig);
    return () => {
      window.removeEventListener('splitmate_tab_config_changed', syncConfig);
      window.removeEventListener('splitmate_currency_changed', syncConfig);
      window.removeEventListener('focus', syncConfig);
    };
  }, []);

  const visibility = useMemo(() => {
    const map = new Map<string, boolean>();
    tabConfig.forEach((tab) => map.set(tab.id, tab.visible));
    return map;
  }, [tabConfig]);

  const visibleCount = useMemo(() => tabConfig.filter((tab) => tab.visible).length, [tabConfig]);
  const fixedTabs = useMemo(() => new Set<string>(FIXED_BOTTOM_TAB_IDS), []);

  const featureCards = useMemo(() => ([
    {
      id: 'personal',
      title: 'Personal',
      subtitle: 'Track your own expenses and category totals.',
      countText: `${personalCount} expense${personalCount !== 1 ? 's' : ''}`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: User,
    },
    {
      id: 'shared',
      title: 'Shared',
      subtitle: 'Split and settle balances with your people.',
      countText: `${sharedCount} transaction${sharedCount !== 1 ? 's' : ''}`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: Users,
    },
    {
      id: 'links',
      title: 'Links',
      subtitle: 'Bookmarks and grouped links in one place.',
      countText: `${linkCount} saved`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: ExternalLink,
    },
    {
      id: 'categories',
      title: 'Categories',
      subtitle: 'See where you spend most by month and category.',
      countText: `${personalCount} tracked`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: PieChart,
    },
    {
      id: 'budgets',
      title: 'Budgets',
      subtitle: 'Daily allowance and monthly budget calculator.',
      countText: budgetDailyAllowanceText,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: WalletCards,
    },
    {
      id: 'accounts',
      title: 'Accounts',
      subtitle: 'Manage Savings, Bank, Credit Card and source budgets.',
      countText: accountsCount === 0
        ? 'No Accounts'
        : `${currency.symbol}${Math.abs(totalAccountsAvailable).toLocaleString(currency.locale, { maximumFractionDigits: 0 })} Available`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: CreditCard,
    },
    {
      id: 'loans',
      title: 'Loans',
      subtitle: 'Track loan due by month or year with interest.',
      countText: `${loansCount} loan${loansCount !== 1 ? 's' : ''}`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: Landmark,
    },
    {
      id: 'goals',
      title: 'Savings',
      subtitle: 'Save toward future targets with optional lock.',
      countText: `${goalsCount} savings target${goalsCount !== 1 ? 's' : ''}`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: Target,
    },
    {
      id: 'subscriptions',
      title: 'Subscriptions',
      subtitle: 'Track daily, weekly, monthly, quarterly, yearly and lifetime plans.',
      countText: `${subscriptionsCount} active`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: Repeat,
    },
    {
      id: 'transactions',
      title: 'Transactions',
      subtitle: 'See all incoming, outgoing, personal, split, group and SMS entries.',
      countText: `${allTransactionsCount} total`,
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: ListOrdered,
      isTool: true,
    },
    {
      id: 'calendar',
      title: 'Calendar',
      subtitle: 'Month-wise activity view from your first transaction to now.',
      countText: calendarDayCount > 0 ? `${calendarDayCount} active day${calendarDayCount !== 1 ? 's' : ''}` : 'No Activity Yet',
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: CalendarDays,
      isTool: true,
    },
    {
      id: 'converter',
      title: 'Converter',
      subtitle: 'Real-time global exchange rates directly from market indices.',
      countText: 'Latest Quotes',
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: ArrowRightLeft,
      isTool: true
    },
    {
      id: 'recurring',
      title: 'Recurring Payments',
      subtitle: 'Auto-post salary, rent, and other regular income or expenses.',
      countText: recurringActiveCount > 0 ? `${recurringActiveCount} active` : 'No payments',
      countClass: 'text-muted-foreground bg-secondary/40',
      border: 'hsl(var(--border) / 0.25)',
      iconBg: 'hsl(var(--primary) / 0.12)',
      iconClass: 'text-primary',
      icon: CalendarClock,
      isTool: true,
    },
  ]), [accountsCount, allTransactionsCount, budgetDailyAllowanceText, calendarDayCount, currency.locale, currency.symbol, goalsCount, linkCount, loansCount, personalCount, recurringActiveCount, sharedCount, subscriptionsCount, totalAccountsAvailable]);
  const cardsInMore = useMemo(() => featureCards.filter((card) => !visibility.get(card.id)), [featureCards, visibility]);
  const currentBottomTabs = useMemo(() => tabConfig.filter((tab) => tab.visible), [tabConfig]);
  const swappableBottomTabs = useMemo(
    () => currentBottomTabs.filter((tab) => !fixedTabs.has(tab.id)),
    [currentBottomTabs, fixedTabs]
  );

  const canAddWithoutSwap = visibleCount < MAX_BOTTOM_TABS;

  const placeIncomingBeforeMore = (config: typeof tabConfig, incomingId: string, outgoingId?: string) => {
    const next = config.map((tab) => {
      if (tab.id === incomingId) return { ...tab, visible: true };
      if (outgoingId && tab.id === outgoingId) return { ...tab, visible: false };
      return tab;
    });

    const visible = next.filter((tab) => tab.visible);
    const hidden = next.filter((tab) => !tab.visible);

    const incoming = visible.find((tab) => tab.id === incomingId);
    const more = visible.find((tab) => tab.id === 'more');
    const baseVisible = visible.filter((tab) => tab.id !== incomingId && tab.id !== 'more');

    const finalVisible = [...baseVisible];
    if (incoming) finalVisible.push(incoming);
    if (more) finalVisible.push(more);

    return [...finalVisible, ...hidden];
  };

  const finalizeTabConfig = (next: typeof tabConfig) => {
    persistTabConfig(next);
    setTabConfigState(next);
    window.dispatchEvent(new Event('splitmate_tab_config_changed'));
  };

  const handleSwap = (tabId: string) => {
    if (!MORE_CARD_TAB_IDS.includes(tabId as (typeof MORE_CARD_TAB_IDS)[number])) return;
    setSwapTabId(tabId);
  };

  const handleAddBeforeMore = () => {
    if (!swapTabId) return;
    const next = placeIncomingBeforeMore(tabConfig, swapTabId);
    finalizeTabConfig(next);
    toast({ title: 'Added to bottom tabs', description: `${TAB_LABELS[swapTabId]} was placed before More.` });
    setSwapTabId(null);
  };

  const handleSwapWithBottom = (outgoingId: string) => {
    if (!swapTabId) return;
    const next = placeIncomingBeforeMore(tabConfig, swapTabId, outgoingId);
    finalizeTabConfig(next);
    toast({ title: 'Tabs swapped', description: `${TAB_LABELS[swapTabId]} replaced ${TAB_LABELS[outgoingId]}.` });
    setSwapTabId(null);
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Fixed Header */}
      <div className="flex-shrink-0 bg-background px-4 pt-6 pb-2 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight leading-none">More</h1>
        </div>
        <AccountQuickButton onClick={onOpenAccount} />
      </div>

      {/* Fixed Toolbar */}
      <div className="flex-shrink-0 bg-background px-4 py-2 flex items-center justify-between relative">
        {/* Fade-out bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-6 translate-y-full bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">Ecosystem Toolbox</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary/50 rounded-full p-1 border border-border/10">
            <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-full transition-colors", viewMode === 'list' ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
              <List size={12} strokeWidth={2.5} />
            </button>
            <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-full transition-colors", viewMode === 'grid' ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid size={12} strokeWidth={2.5} />
            </button>
          </div>
          <button
            onClick={() => setIsSwapMode(!isSwapMode)}
            className={cn("text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 active:scale-90", isSwapMode ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 text-muted-foreground border-border/10")}
          >
            <ArrowLeftRight size={10} strokeWidth={isSwapMode ? 3 : 2} />
            {isSwapMode ? 'Done' : 'Swap'}
          </button>
        </div>
      </div>

      {/* Scrollable Cards Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-40">
        <div className="space-y-4 pt-4">
        <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-4" : "flex flex-col gap-3"}>
          {cardsInMore.map((card, idx) => {
            const Icon = card.icon;
            const isConverter = card.id === 'converter';
            const isTransactions = card.id === 'transactions';
            const isCalendar = card.id === 'calendar';
            const isRecurring = card.id === 'recurring';
            return (
              <div key={card.id} className="contents">
                <div
                  onClick={() => {
                    if (isSwapMode) {
                      handleSwap(card.id);
                      return;
                    }
                    if (isConverter) {
                      setShowConverter(true);
                      return;
                    }
                    if (isTransactions) {
                      onOpenFeatureTab('transactions');
                      return;
                    }
                    if (isCalendar) {
                      onOpenFeatureTab('calendar');
                      return;
                    }
                    onOpenFeatureTab(card.id);
                  }}
                  className={cn("group relative transition-all duration-300 active:scale-[0.96] text-left overflow-hidden cursor-pointer", isSwapMode ? "animate-pulse ring-2 ring-primary ring-offset-2 ring-offset-background" : "", viewMode === 'grid' ? "flex flex-col p-5 rounded-[1.75rem]" : "flex items-center gap-4 p-4 rounded-2xl")}
                  style={{
                    background: 'hsl(var(--card))',
                    border: `1.2px solid ${card.border}`,
                    boxShadow: 'none',
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className={cn("relative z-10", viewMode === 'grid' ? "flex items-start justify-start mb-3.5" : "shrink-0")}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shadow-inner" style={{ background: card.iconBg }}>
                      <Icon size={18} className={card.iconClass} strokeWidth={2} />
                    </div>
                  </div>

                  <div className={cn("relative z-10", viewMode === 'grid' ? "" : "flex-1 min-w-0")}>
                    <h3 className={cn("font-bold leading-tight tracking-tight group-hover:text-primary transition-colors", viewMode === 'grid' ? "text-[14px]" : "text-[15px] truncate")}>{card.title}</h3>
                    {viewMode === 'list' && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{card.subtitle}</p>}
                  </div>

                  <div className={cn("relative z-10", viewMode === 'grid' ? "mt-3" : "shrink-0")}>
                    <div className={cn(
                      "inline-flex items-center rounded-xl text-[9px] font-bold uppercase tracking-wider",
                      viewMode === 'grid' ? "px-3 py-1.5" : "px-2.5 py-1",
                      card.countClass
                    )}>
                      {card.id === 'converter' && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse mr-1.5" />}
                      {card.countText}
                    </div>
                  </div>

                  {/* Watermark Overlay */}
                  <div className="absolute -bottom-4 -right-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-500 pointer-events-none">
                    {card.id === 'converter' ? (
                      <Globe size={100} strokeWidth={3} className={TAB_COLORS[card.id] || 'text-primary'} />
                    ) : (
                      <Icon size={100} strokeWidth={3} className={TAB_COLORS[card.id] || 'text-primary'} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div> {/* end space-y-4 */}

        {cardsInMore.length === 0 && (
          <div className="p-10 text-center rounded-[1.75rem] bg-secondary/15 border border-dashed border-border/20 mt-2">
            <ArrowLeftRight className="mx-auto mb-3 text-primary/20" size={40} />
            <p className="text-sm font-bold text-muted-foreground/40 italic">Pinned features are managed in your bottom navigation bar.</p>
          </div>
        )}

        <CurrencyConverterModal
          isOpen={showConverter}
          onClose={() => setShowConverter(false)}
        />
      </div> {/* end scrollable body */}

      {/* SWAP DIALOG */}
      {swapTabId && createPortal(
        <div
          className="fixed inset-0 z-[10005] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSwapTabId(null)}
        >
          <div
            className="w-full max-w-md bg-card rounded-[1.5rem] overflow-hidden animate-in slide-in-from-bottom-10 duration-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border/10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg tracking-tight font-sans">Swap Target</h3>
                  <p className="text-sm text-muted-foreground font-medium">Position <span className="text-primary font-bold">{TAB_LABELS[swapTabId]}</span> in your footer</p>
                </div>
                <button
                  onClick={() => setSwapTabId(null)}
                  className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 active:scale-90 transition-all font-sans"
                >
                  <X size={20} className="text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar">
              {canAddWithoutSwap && (
                <button
                  onClick={handleAddBeforeMore}
                  className="w-full p-6 rounded-2xl text-left transition-all active:scale-[0.98] flex items-center justify-between group"
                  style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.15)' }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-primary animate-pulse" />
                      <p className="font-bold text-sm text-primary uppercase tracking-widest leading-none">Append to Navigation</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium">Add as a fresh tab at the end</p>
                  </div>
                </button>
              )}

              {swappableBottomTabs.map((tab) => {
                const TargetIcon = TAB_ICONS[tab.id] || Sparkles;
                const targetColor = TAB_COLORS[tab.id] || 'text-primary';
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSwapWithBottom(tab.id)}
                    className="w-full p-6 rounded-2xl text-left bg-secondary/30 border border-border/5 hover:bg-secondary/50 transition-all active:scale-[0.98] flex items-center gap-5 group"
                  >
                    <div className={cn("w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm flex-shrink-0 group-hover:scale-110 transition-transform", targetColor)}>
                      <TargetIcon size={22} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="font-bold text-sm tracking-tight text-foreground/80 font-sans truncate">Replace {TAB_LABELS[tab.id] || tab.id}</p>
                      <p className="text-[11px] text-muted-foreground font-medium leading-tight truncate">Move {TAB_LABELS[swapTabId]} to this position</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-6 pt-0 opacity-20 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tap background to dismiss</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
