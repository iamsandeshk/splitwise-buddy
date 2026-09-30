import { Plus, TrendingUp, TrendingDown, Users, Wallet, Activity, Target, PieChart, ArrowUpRight, ArrowDownRight, Banknote, SlidersHorizontal, ChevronRight, ChevronDown, Check, Calendar, History, Layers } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { ExpenseChart } from '@/components/ExpenseChart';
import { getPersonalExpenses, getPersonBalances, getSharedExpenses, EXPENSE_CATEGORIES, getAccountProfile, getHomeSettings, processSubscriptionBilling } from '@/lib/storage';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/use-currency';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { HomeCurrencyRates } from '@/components/widgets/HomeCurrencyRates';
import { GoalsWidget, LoansWidget, SubscriptionsWidget, PinnedLinksWidget, CategoryInsightsWidget, BudgetsWidget, RecentPersonalWidget, RecentSharedWidget } from '@/components/widgets/HomeWidgets';
import { useSessionAnimation } from '@/hooks/use-session-animation';
import { useProGate } from '@/hooks/useProGate';
import { EditHomeWidgetsModal } from '@/components/modals/EditHomeWidgetsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HomeTabProps {
  onAddPersonal: () => void;
  onAddShared: () => void;
  onOpenAccount: () => void;
  onNavigateToTab: (tabId: string) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

type BalanceTimeframe = 'present' | 'previous' | 'lifetime';

function matchesMonth(dateStr: string | undefined | null, targetMonth: string): boolean {
  if (!dateStr) return false;
  if (dateStr.startsWith(targetMonth)) return true;
  if (dateStr.length >= 7 && dateStr.slice(0, 7) === targetMonth) return true;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return ym === targetMonth;
    }
  } catch {
    // fallback
  }
  return false;
}

export function HomeTab({ onAddPersonal, onAddShared, onOpenAccount, onNavigateToTab, onScroll }: HomeTabProps) {
  const shouldAnimate = useSessionAnimation('home-tab');
  const navigate = useNavigate();
  const [dataVersion, setDataVersion] = useState(0);
  const personalExpenses = getPersonalExpenses();
  const personBalances = getPersonBalances();
  const sharedExpenses = getSharedExpenses();
  const currency = useCurrency();
  const [profileName, setProfileName] = useState(() => getAccountProfile().name || 'Guest');
  const [settings, setSettings] = useState(() => getHomeSettings());
  const [showEditWidgets, setShowEditWidgets] = useState(false);
  const { isPro: isEffectivePro } = useProGate();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const presentMonthDate = useMemo(() => new Date(currentYear, currentMonthIdx, 1), [currentYear, currentMonthIdx]);
  const presentMonthKey = useMemo(() => `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`, [currentYear, currentMonthIdx]);
  const presentMonthShort = useMemo(() => presentMonthDate.toLocaleDateString('en', { month: 'short', year: '2-digit' }).toUpperCase(), [presentMonthDate]);
  const presentMonthFull = useMemo(() => presentMonthDate.toLocaleDateString('en', { month: 'short', year: 'numeric' }), [presentMonthDate]);

  const prevMonthDate = useMemo(() => new Date(currentYear, currentMonthIdx - 1, 1), [currentYear, currentMonthIdx]);
  const prevMonthKey = useMemo(() => `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`, [prevMonthDate]);
  const prevMonthShort = useMemo(() => prevMonthDate.toLocaleDateString('en', { month: 'short', year: '2-digit' }).toUpperCase(), [prevMonthDate]);
  const prevMonthFull = useMemo(() => prevMonthDate.toLocaleDateString('en', { month: 'short', year: 'numeric' }), [prevMonthDate]);

  const timeframeOptions = useMemo(() => [
    {
      id: 'present' as const,
      label: 'Present Month',
      dateLabel: presentMonthFull,
      icon: Calendar,
      badge: 'Current',
    },
    {
      id: 'previous' as const,
      label: 'Previous Month',
      dateLabel: prevMonthFull,
      icon: History,
      badge: 'Last Mo',
    },
    {
      id: 'lifetime' as const,
      label: 'Lifetime',
      dateLabel: 'All months & years',
      icon: Layers,
      badge: 'All-Time',
    },
  ], [presentMonthFull, prevMonthFull]);

  const [balanceTimeframe, setBalanceTimeframe] = useState<BalanceTimeframe>('present');

  const handleSelectTimeframe = (next: BalanceTimeframe) => {
    setBalanceTimeframe(next);
  };

  const stats = useMemo(() => {
    // Ignore any leftover demo data that might still be in local storage
    const realPersonalExpenses = personalExpenses.filter(e =>
      !e.id.startsWith('demo-sms-') &&
      !(e.smsExternalId && e.smsExternalId.startsWith('demo-sms-'))
    );

    // Monthly figures remain useful for the compact stats card below.
    const thisMonthPersonalExpenses = realPersonalExpenses
      .filter(expense => matchesMonth(expense.date, presentMonthKey) && !expense.isIncome && !expense.isMirror)
      .reduce((sum, expense) => sum + expense.amount, 0);

    const thisMonthPersonalIncome = realPersonalExpenses
      .filter(expense => matchesMonth(expense.date, presentMonthKey) && expense.isIncome && !expense.isMirror)
      .reduce((sum, income) => sum + income.amount, 0);

    // Lifetime figures
    const lifetimePersonalExpenses = realPersonalExpenses
      .filter(expense => !expense.isIncome && !expense.isMirror)
      .reduce((sum, expense) => sum + expense.amount, 0);

    const lifetimePersonalIncome = realPersonalExpenses
      .filter(expense => expense.isIncome && !expense.isMirror)
      .reduce((sum, income) => sum + income.amount, 0);

    // Timeframe-specific calculations for Total Balance card
    let personalIncoming = 0;
    let personalOutgoing = 0;
    let sharedIncoming = 0;
    let sharedOutgoing = 0;

    if (balanceTimeframe === 'lifetime') {
      personalIncoming = lifetimePersonalIncome;
      personalOutgoing = lifetimePersonalExpenses;

      // netBalance < 0 means I paid them (they owe me -> outgoing cash)
      sharedOutgoing = personBalances
        .filter(p => p.netBalance < 0)
        .reduce((sum, p) => sum + Math.abs(p.netBalance), 0);

      // netBalance > 0 means they paid me (I owe them -> incoming cash)
      sharedIncoming = personBalances
        .filter(p => p.netBalance > 0)
        .reduce((sum, p) => sum + p.netBalance, 0);
    } else {
      const targetMonthKey = balanceTimeframe === 'present' ? presentMonthKey : prevMonthKey;

      personalIncoming = realPersonalExpenses
        .filter(expense => expense.isIncome && !expense.isMirror && matchesMonth(expense.date, targetMonthKey))
        .reduce((sum, income) => sum + income.amount, 0);

      personalOutgoing = realPersonalExpenses
        .filter(expense => !expense.isIncome && !expense.isMirror && matchesMonth(expense.date, targetMonthKey))
        .reduce((sum, expense) => sum + expense.amount, 0);

      const targetShared = sharedExpenses.filter(e => matchesMonth(e.date, targetMonthKey));

      const peopleMap = new Map<string, { totalGiven: number; totalOwed: number }>();
      targetShared.forEach(expense => {
        if (expense.groupId) return;
        if (!peopleMap.has(expense.personName)) {
          peopleMap.set(expense.personName, { totalGiven: 0, totalOwed: 0 });
        }
        const person = peopleMap.get(expense.personName)!;
        if (!expense.settled) {
          if (expense.paidBy === 'me') {
            person.totalOwed += expense.amount; // I paid -> they owe me (outgoing)
          } else {
            person.totalGiven += expense.amount; // They paid -> I owe them (incoming)
          }
        }
      });

      peopleMap.forEach(person => {
        const net = person.totalGiven - person.totalOwed;
        if (net < 0) {
          sharedOutgoing += Math.abs(net);
        } else if (net > 0) {
          sharedIncoming += net;
        }
      });
    }

    const totalIncoming = sharedIncoming + personalIncoming;
    const totalOutgoing = sharedOutgoing + personalOutgoing;

    // Cash flow net balance: total cash received minus total cash spent/lent
    const netTotalBalance = totalIncoming - totalOutgoing;

    const categoryData = EXPENSE_CATEGORIES.map(category => {
      const amount = realPersonalExpenses
        .filter(expense => expense.category === category && matchesMonth(expense.date, presentMonthKey) && !expense.isIncome)
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { name: category, value: amount };
    }).filter(item => item.value > 0);

    const topPeople = personBalances
      .filter(person => Math.abs(person.netBalance) > 0)
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance))
      .slice(0, 3);

    return {
      thisMonthPersonal: thisMonthPersonalExpenses,
      thisMonthIncome: thisMonthPersonalIncome,
      lifetimePersonalExpenses,
      lifetimePersonalIncome,
      netTotalBalance,
      topPeople,
      totalTransactions: realPersonalExpenses.length + sharedExpenses.length,
      categoryData,
      totalIncoming,
      totalOutgoing,
      activePeople: personBalances.filter(p => p.netBalance !== 0).length,
    };
  }, [personalExpenses, personBalances, sharedExpenses, balanceTimeframe, presentMonthKey, prevMonthKey]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour > 4 && hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName = useMemo(() => {
    const normalized = (profileName || 'Guest').trim();
    if (normalized.length <= 20) return normalized;
    const firstName = normalized.split(/\s+/)[0]?.trim();
    return firstName && firstName.length > 0 ? firstName : normalized.slice(0, 20);
  }, [profileName]);

  useEffect(() => {
    processSubscriptionBilling();
    const syncName = () => setProfileName(getAccountProfile().name || 'Guest');
    const syncSettings = () => setSettings(getHomeSettings());
    const syncData = () => setDataVersion(v => v + 1);
    window.addEventListener('splitmate_account_changed', syncName);
    window.addEventListener('home_settings_changed', syncSettings);
    window.addEventListener('splitmate_data_changed', syncData);
    return () => {
      window.removeEventListener('splitmate_account_changed', syncName);
      window.removeEventListener('home_settings_changed', syncSettings);
      window.removeEventListener('splitmate_data_changed', syncData);
    };
  }, []);

  return (
    <div onScroll={onScroll} className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col">
      {/* Header — sticky fixed position */}
      <div className="sticky top-0 z-30 relative px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="absolute inset-x-0 top-0 h-24 z-0 bg-gradient-to-b from-background/95 via-background/70 to-transparent backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0%,black_52%,transparent_100%)] pointer-events-none" />
        <div className="relative z-10 min-w-0 drop-shadow-[0_1px_3px_hsl(var(--background)/0.9)]">
          <p className="font-heading text-[13px] tracking-[0.28em] text-muted-foreground uppercase">
            {greeting}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.035em] leading-none text-foreground truncate">
              {displayName}<span className="text-primary">.</span>
            </h1>
            {isEffectivePro && (
              <img
                src="/assets/pro-verified-gold.png"
                alt="Pro verified"
                className="w-4 h-4 object-contain shrink-0"
              />
            )}
          </div>
        </div>
        <div className="relative z-10">
          <AccountQuickButton onClick={onOpenAccount} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-5 pt-4 space-y-6 flex-1">

      {/* Balance — flat tactile slab with hairline rule */}
      <div
        className="relative px-5 py-6 overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border) / 0.15)',
          borderRadius: '1.75rem',
          boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
        }}
      >
        <div className="absolute right-[-15px] top-[20%] -translate-y-[15%] pointer-events-none opacity-[0.04]">
          <Wallet size={120} className="text-foreground" strokeWidth={1} />
        </div>

        {/* Corner timeframe selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group absolute top-3.5 right-4 z-20 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/90 hover:text-foreground active:scale-95 transition-all bg-card/80 hover:bg-muted px-2.5 py-1 rounded-full border border-border/40 shadow-xs cursor-pointer select-none backdrop-blur-md"
              title="Filter balance by timeframe"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 transition-transform group-hover:scale-125" />
              <span>
                {balanceTimeframe === 'present'
                  ? `NET · ${presentMonthShort}`
                  : balanceTimeframe === 'previous'
                  ? `NET · ${prevMonthShort}`
                  : 'NET · LIFETIME'}
              </span>
              <ChevronDown size={10} className="opacity-60 group-hover:opacity-100 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-64 p-1.5 rounded-2xl bg-card/95 backdrop-blur-2xl border border-border/50 shadow-[0_16px_36px_-6px_rgba(0,0,0,0.85),inset_0_1px_0_hsl(0_0%_100%/0.08)] z-50 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
          >
            <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2 mb-1 border-b border-border/40">
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/80 font-semibold">
                Timeframe
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.16em] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/30">
                {balanceTimeframe === 'present' ? 'Current' : balanceTimeframe === 'previous' ? 'Last Mo' : 'All Time'}
              </span>
            </div>

            <div className="space-y-1">
              {timeframeOptions.map((opt) => {
                const isSelected = balanceTimeframe === opt.id;
                const Icon = opt.icon;

                return (
                  <DropdownMenuItem
                    key={opt.id}
                    onClick={() => handleSelectTimeframe(opt.id)}
                    className={`group relative flex items-center justify-between px-2.5 py-2.5 rounded-xl cursor-pointer transition-all outline-none ${
                      isSelected
                        ? 'bg-muted/80 text-foreground font-medium shadow-xs border border-border/60'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_12px_rgba(255,100,50,0.18)]'
                            : 'bg-muted/50 text-muted-foreground group-hover:text-foreground group-hover:bg-muted/70'
                        }`}
                      >
                        <Icon size={14} strokeWidth={isSelected ? 2.5 : 2} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-[13px] leading-tight tracking-tight ${isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground/80 group-hover:text-foreground'}`}>
                          {opt.label}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground/80 leading-tight mt-0.5 truncate">
                          {opt.dateLabel}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 ml-2">
                        <Check size={11} strokeWidth={3} className="text-primary" />
                      </div>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Total balance
        </p>

        <div className="flex items-baseline gap-1">
          <MoneyDisplay
            animate={shouldAnimate}
            amount={stats.netTotalBalance}
            size="xl"
            showSign={true}
            className="font-heading tracking-[-0.04em]"
          />
        </div>

        {(stats.totalIncoming > 0 || stats.totalOutgoing > 0 || balanceTimeframe !== 'lifetime') && (
          <div
            className="mt-5 pt-4 grid grid-cols-2 gap-0 divide-x"
            style={{ borderTop: '1px dashed hsl(var(--border) / 0.5)', borderColor: 'hsl(var(--border) / 0.4)' }}
          >
            <div className="pr-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">In</p>
              <div className="flex items-center gap-1.5">
                <ArrowDownRight size={14} className="text-success" />
                <p className="font-heading text-lg font-bold text-success tabular-nums tracking-tight">
                  {currency.symbol}{stats.totalIncoming.toLocaleString(currency.locale)}
                </p>
              </div>
            </div>
            <div className="pl-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">Out</p>
              <div className="flex items-center gap-1.5">
                <ArrowUpRight size={14} className="text-danger" />
                <p className="font-heading text-lg font-bold text-danger tabular-nums tracking-tight">
                  {currency.symbol}{stats.totalOutgoing.toLocaleString(currency.locale)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action row — asymmetric primary / ghost */}
      <div className="grid grid-cols-5 gap-3">
        <button
          onClick={onAddPersonal}
          className="col-span-3 group h-[64px] flex items-center justify-between px-5 rounded-[1.25rem] font-heading font-bold tracking-tight relative overflow-hidden active:scale-[0.98] transition-transform"
          style={{
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            boxShadow: '0 2px 12px -4px hsl(var(--glass-shadow) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.15)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <span className="flex flex-col items-start leading-none">
            <span className="text-base">Personal</span>
          </span>
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'hsl(0 0% 0% / 0.22)' }}>
            <Plus size={18} strokeWidth={3} />
          </div>
        </button>

        <button
          onClick={onAddShared}
          className="col-span-2 group h-[64px] flex flex-col items-start justify-center px-4 rounded-[1.25rem] font-heading font-bold tracking-tight active:scale-[0.98] transition-transform"
          style={{
            background: 'transparent',
            color: 'hsl(var(--foreground))',
            border: '1px dashed hsl(var(--border))',
          }}
        >
          <span className="text-base">Add income</span>
        </button>
      </div>

      {/* Dynamic Sections */}
      {settings.sectionOrder.map((sectionId) => {
        switch (sectionId) {
          case 'stats':
            return settings.showStats && (
              <div key="stats" className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Spent', sub: 'this month', value: `${currency.symbol}${stats.thisMonthPersonal.toLocaleString(currency.locale)}`, accent: 'danger' },
                  { label: 'Txn', sub: 'all-time', value: String(stats.totalTransactions), accent: 'foreground' },
                  { label: 'People', sub: 'unsettled', value: String(stats.activePeople), accent: 'primary' },
                ].map((s, i) => {
                  const valLen = s.value.length;
                  const fontSizeClass = valLen <= 5 ? 'text-lg' : valLen <= 7 ? 'text-base' : valLen <= 9 ? 'text-sm' : valLen <= 11 ? 'text-xs' : 'text-[11px]';
                  return (
                    <div
                      key={s.label}
                      className="relative px-2.5 py-3.5 min-w-0 overflow-hidden"
                      style={{
                        background: 'hsl(var(--card) / 0.6)',
                        border: '1px solid hsl(var(--border) / 0.45)',
                        borderRadius: '1.1rem',
                      }}
                    >
                      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-2 truncate">
                        0{i + 1} · {s.label}
                      </p>
                      <p className={`font-heading ${fontSizeClass} font-medium tracking-tight tabular-nums leading-none truncate ${s.accent === 'primary' ? 'text-primary' : 'text-foreground'}`}>
                        {s.value}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{s.sub}</p>
                    </div>
                  );
                })}
              </div>
            );
          case 'spending':
            return settings.showSpendingBreakdown && stats.categoryData.length > 0 && (
              <div key="spending">
                <p className="text-xs text-muted-foreground px-2 mb-2 uppercase font-medium">Spending breakdown</p>
                <div className="ios-card-modern p-5 space-y-3">
                  <ExpenseChart animate={shouldAnimate} data={stats.categoryData} type="pie" height={150} pieCenterLabel="Total Spent" pieCenterSubLabel={`${stats.categoryData.length} categories`} />
                </div>
              </div>
            );
          case 'balances': {
            const displayPeople = settings.selectedPersonNames && settings.selectedPersonNames.length > 0
              ? stats.topPeople.filter(p => settings.selectedPersonNames.includes(p.name))
              : stats.topPeople.slice(0, 2);

            return settings.showTopBalances && displayPeople.length > 0 && (
              <div key="balances">
                <div className="flex items-center justify-between px-2 mb-2">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Top balances</p>
                  {stats.topPeople.length > 2 && (
                    <button
                      onClick={() => onNavigateToTab('shared')}
                      className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] hover:text-primary transition-colors flex items-center gap-0.5"
                    >
                      View all <ChevronRight size={10} strokeWidth={3} />
                    </button>
                  )}
                </div>
                <div className="ios-card-modern px-3.5 py-1">
                  <div className="divide-y divide-dotted divide-border/40">
                    {displayPeople.map((person) => {
                      const balance = person.netBalance;
                      const isPositive = balance > 0;
                      const isNegative = balance < 0;

                      return (
                        <button
                          key={person.name}
                          onClick={() => onNavigateToTab(`shared`)} // Simplification for now
                          className="w-full flex items-center justify-between py-3 text-left transition-all active:scale-[0.98] group"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center text-sm font-black shadow-inner"
                                style={{
                                  background: isPositive ? 'hsl(var(--success) / 0.15)' : isNegative ? 'hsl(var(--danger) / 0.15)' : 'hsl(var(--muted) / 0.1)',
                                  color: isPositive ? 'hsl(var(--success))' : isNegative ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))',
                                }}>
                                {person.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background border border-border/20 flex items-center justify-center shadow-sm">
                                {isPositive ? <ArrowDownRight size={10} className="text-success" /> : <ArrowUpRight size={10} className="text-danger" />}
                              </div>
                            </div>
                            <div>
                              <p className="font-bold text-sm tracking-tight text-foreground">{person.name}</p>
                              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                                {isPositive ? "You owe" : isNegative ? "Owes you" : "Settled"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <MoneyDisplay amount={balance} size="sm" showSign={true} className={isPositive ? "text-success" : isNegative ? "text-danger" : ""} />
                            <div className="h-0.5 w-8 ml-auto mt-1 rounded-full opacity-30" style={{ background: isPositive ? 'hsl(var(--success))' : 'hsl(var(--danger))' }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
       
          );
        }
          case 'goals':
            return settings.showGoals && <div key="goals"><GoalsWidget onNavigate={onNavigateToTab} /></div>;
          case 'loans':
            return settings.showLoans && <div key="loans"><LoansWidget onNavigate={onNavigateToTab} /></div>;
          case 'subs':
            return settings.showSubscriptions && <div key="subs"><SubscriptionsWidget onNavigate={onNavigateToTab} /></div>;
          case 'links':
            return settings.showPinnedLinks && <div key="links"><PinnedLinksWidget onNavigate={onNavigateToTab} /></div>;
          case 'rates':
            return settings.showCurrencyRates && <div key="rates"><HomeCurrencyRates codes={settings.currencyRateCodes} /></div>;
          case 'categories':
            return settings.showCategories && <div key="categories"><CategoryInsightsWidget onNavigate={onNavigateToTab} /></div>;
          case 'budgets':
            return settings.showBudgets && <div key="budgets"><BudgetsWidget onNavigate={onNavigateToTab} /></div>;
          case 'personal':
            return settings.showRecentPersonal && <div key="personal"><RecentPersonalWidget onNavigate={onNavigateToTab} /></div>;
          case 'shared':
            return settings.showRecentShared && <div key="shared"><RecentSharedWidget onNavigate={onNavigateToTab} /></div>;
          default:
            return null;
        }
      })}

      {stats.totalTransactions === 0 && (
        <div className="ios-card-modern p-8 text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
            <Target size={22} className="text-primary" />
          </div>
          <p className="text-sm font-semibold">Start tracking in seconds</p>
          <p className="text-xs text-muted-foreground">Add your first personal or shared expense to unlock insights.</p>
        </div>
      )}

        {/* Edit Home Dashboard Widgets Button */}
        <div className="pt-1">
          <button
            onClick={() => setShowEditWidgets(true)}
            className="w-[calc(100%-9.9rem)] mx-auto flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl border border-dashed border-border/70 hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground hover:text-foreground font-semibold text-sm transition-all active:scale-[0.98] shadow-sm group"
          >
            <SlidersHorizontal size={16} className="text-primary group-hover:rotate-45 transition-transform" />
            <span>Edit Shortcuts</span>
          </button>
        </div>
      </div>

      <EditHomeWidgetsModal
        isOpen={showEditWidgets}
        onClose={() => setShowEditWidgets(false)}
      />
    </div>
  );
}
