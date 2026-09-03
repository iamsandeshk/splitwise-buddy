import { Plus, TrendingUp, TrendingDown, Users, Wallet, Activity, Target, PieChart, ArrowUpRight, ArrowDownRight, Banknote, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { ExpenseChart } from '@/components/ExpenseChart';
import { getPersonalExpenses, getPersonBalances, getSharedExpenses, EXPENSE_CATEGORIES, getAccountProfile, getHomeSettings, processSubscriptionBilling } from '@/lib/storage';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/use-currency';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { HomeCurrencyRates } from '@/components/widgets/HomeCurrencyRates';
import { GoalsWidget, LoansWidget, SubscriptionsWidget, PinnedLinksWidget, CategoryInsightsWidget, BudgetsWidget, RecentPersonalWidget, RecentSharedWidget } from '@/components/widgets/HomeWidgets';
import { useProGate } from '@/hooks/useProGate';
import { EditHomeWidgetsModal } from '@/components/modals/EditHomeWidgetsModal';

interface HomeTabProps {
  onAddPersonal: () => void;
  onAddShared: () => void;
  onOpenAccount: () => void;
  onNavigateToTab: (tabId: string) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function HomeTab({ onAddPersonal, onAddShared, onOpenAccount, onNavigateToTab, onScroll }: HomeTabProps) {
  const navigate = useNavigate();
  const personalExpenses = getPersonalExpenses();
  const personBalances = getPersonBalances();
  const sharedExpenses = getSharedExpenses();
  const currency = useCurrency();
  const [profileName, setProfileName] = useState(() => getAccountProfile().name || 'Guest');
  const [settings, setSettings] = useState(() => getHomeSettings());
  const [showEditWidgets, setShowEditWidgets] = useState(false);
  const { isPro: isEffectivePro } = useProGate();

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Ignore any leftover demo data that might still be in local storage
    const realPersonalExpenses = personalExpenses.filter(e =>
      !e.id.startsWith('demo-sms-') &&
      !(e.smsExternalId && e.smsExternalId.startsWith('demo-sms-'))
    );

    // Monthly figures remain useful for the compact stats card below.
    const thisMonthPersonalExpenses = realPersonalExpenses
      .filter(expense => expense.date.startsWith(currentMonth) && !expense.isIncome)
      .reduce((sum, expense) => sum + expense.amount, 0);

    const thisMonthPersonalIncome = realPersonalExpenses
      .filter(expense => expense.date.startsWith(currentMonth) && expense.isIncome)
      .reduce((sum, income) => sum + income.amount, 0);

    // The main balance is lifetime and must not reset when the month changes.
    const lifetimePersonalExpenses = realPersonalExpenses
      .filter(expense => !expense.isIncome)
      .reduce((sum, expense) => sum + expense.amount, 0);

    const lifetimePersonalIncome = realPersonalExpenses
      .filter(expense => expense.isIncome)
      .reduce((sum, income) => sum + income.amount, 0);

    const netSharedBalance = personBalances.reduce((sum, person) => sum + person.netBalance, 0);

    // Lifetime net = unsettled shared balance + all personal income - all personal expenses.
    const netTotalBalance = netSharedBalance + lifetimePersonalIncome - lifetimePersonalExpenses;

    const categoryData = EXPENSE_CATEGORIES.map(category => {
      const amount = realPersonalExpenses
        .filter(expense => expense.category === category && expense.date.startsWith(currentMonth) && !expense.isIncome)
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { name: category, value: amount };
    }).filter(item => item.value > 0);

    const topPeople = personBalances
      .filter(person => Math.abs(person.netBalance) > 0)
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance))
      .slice(0, 3);

    const sharedOwedToYou = personBalances
      .filter(p => p.netBalance > 0)
      .reduce((sum, p) => sum + p.netBalance, 0);

    const sharedYouOwe = personBalances
      .filter(p => p.netBalance < 0)
      .reduce((sum, p) => sum + Math.abs(p.netBalance), 0);

    const totalIncoming = sharedOwedToYou + lifetimePersonalIncome;
    const totalOutgoing = sharedYouOwe + lifetimePersonalExpenses;

    return {
      thisMonthPersonal: thisMonthPersonalExpenses,
      thisMonthIncome: thisMonthPersonalIncome,
      lifetimePersonalExpenses,
      lifetimePersonalIncome,
      netTotalBalance,
      topPeople,
      totalTransactions: realPersonalExpenses.length + sharedExpenses.length,
      categoryData,
      owedToYou: totalIncoming,
      totalOutgoing,
      activePeople: personBalances.filter(p => p.netBalance !== 0).length,
    };
  }, [personalExpenses, personBalances, sharedExpenses]);

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
    window.addEventListener('splitmate_account_changed', syncName);
    window.addEventListener('home_settings_changed', syncSettings);
    return () => {
      window.removeEventListener('splitmate_account_changed', syncName);
      window.removeEventListener('home_settings_changed', syncSettings);
    }
  }, []);

  return (
    <div onScroll={onScroll} className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col">
      {/* Header — sticky fixed position */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-5 pt-5 pb-3 flex items-center justify-between gap-3 border-b border-border/10">
        <div className="min-w-0">
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
        <AccountQuickButton onClick={onOpenAccount} />
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
        {/* Corner code tag */}
        <div className="absolute top-3 right-4 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
          NET · {new Date().toLocaleDateString('en', { month: 'short', year: '2-digit' }).toUpperCase()}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Total balance
        </p>

        <div className="flex items-baseline gap-1">
          <MoneyDisplay
            amount={stats.netTotalBalance}
            size="xl"
            showSign={true}
            className="font-heading tracking-[-0.04em]"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: stats.netTotalBalance > 0 ? 'hsl(var(--success))'
                : stats.netTotalBalance < 0 ? 'hsl(var(--danger))'
                  : 'hsl(var(--muted-foreground))'
            }}
          />
          <p className="text-xs text-muted-foreground">
            {stats.netTotalBalance > 0 ? 'In the green'
              : stats.netTotalBalance < 0 ? 'Net outgoing this cycle'
                : 'Squared up.'}
          </p>
        </div>

        {(stats.owedToYou > 0 || stats.totalOutgoing > 0) && (
          <div
            className="mt-5 pt-4 grid grid-cols-2 gap-0 divide-x"
            style={{ borderTop: '1px dashed hsl(var(--border) / 0.5)', borderColor: 'hsl(var(--border) / 0.4)' }}
          >
            <div className="pr-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">In</p>
              <div className="flex items-center gap-1.5">
                <ArrowDownRight size={14} className="text-success" />
                <p className="font-heading text-lg font-bold text-success tabular-nums tracking-tight">
                  {currency.symbol}{stats.owedToYou.toLocaleString(currency.locale)}
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
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] opacity-70 mb-1">+ log</span>
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
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
            <Users size={11} className="text-primary" /> split
          </span>
          <span className="text-base">New tab</span>
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
                  <ExpenseChart data={stats.categoryData} type="pie" height={200} />
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
                                {isPositive ? "Owes you" : isNegative ? "You owe" : "Settled"}
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
