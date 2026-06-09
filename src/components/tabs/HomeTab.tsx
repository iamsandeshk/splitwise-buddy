
import { Plus, TrendingUp, TrendingDown, Users, Wallet, Activity, Target, PieChart, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { ExpenseChart } from '@/components/ExpenseChart';
import { getPersonalExpenses, getPersonBalances, getSharedExpenses, EXPENSE_CATEGORIES, getAccountProfile, getHomeSettings } from '@/lib/storage';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/use-currency';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { HomeCurrencyRates } from '@/components/widgets/HomeCurrencyRates';
import { GoalsWidget, LoansWidget, SubscriptionsWidget, PinnedLinksWidget, CategoryInsightsWidget, BudgetsWidget, ConverterWidget, RecentPersonalWidget, RecentSharedWidget } from '@/components/widgets/HomeWidgets';
import { isProUserCached } from '@/lib/proAccess';

interface HomeTabProps {
  onAddPersonal: () => void;
  onAddShared: () => void;
  onOpenAccount: () => void;
  onNavigateToTab: (tabId: string) => void;
}

export function HomeTab({ onAddPersonal, onAddShared, onOpenAccount, onNavigateToTab }: HomeTabProps) {
  const navigate = useNavigate();
  const personalExpenses = getPersonalExpenses();
  const personBalances = getPersonBalances();
  const sharedExpenses = getSharedExpenses();
  const currency = useCurrency();
  const [profileName, setProfileName] = useState(() => getAccountProfile().name || 'Guest');
  const [settings, setSettings] = useState(() => getHomeSettings());
  const [isEffectivePro, setIsEffectivePro] = useState(() => isProUserCached());

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Separate personal expenses and income for the current month
    const thisMonthPersonalExpenses = personalExpenses
      .filter(expense => expense.date.startsWith(currentMonth) && !expense.isMirror && !expense.isIncome)
      .reduce((sum, expense) => sum + expense.amount, 0);
      
    const thisMonthPersonalIncome = personalExpenses
      .filter(expense => expense.date.startsWith(currentMonth) && !expense.isMirror && expense.isIncome)
      .reduce((sum, income) => sum + income.amount, 0);

    const netSharedBalance = personBalances.reduce((sum, person) => sum + person.netBalance, 0);
    
    // Net total = Shared balance + Income - Expenses
    const netTotalBalance = netSharedBalance + thisMonthPersonalIncome - thisMonthPersonalExpenses;

    const categoryData = EXPENSE_CATEGORIES.map(category => {
      const amount = personalExpenses
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
      
    const totalIncoming = sharedOwedToYou + thisMonthPersonalIncome;
    const totalOutgoing = sharedYouOwe + thisMonthPersonalExpenses;

    return {
      thisMonthPersonal: thisMonthPersonalExpenses,
      thisMonthIncome: thisMonthPersonalIncome,
      netTotalBalance,
      topPeople,
      totalTransactions: personalExpenses.length + sharedExpenses.length,
      categoryData,
      owedToYou: totalIncoming,
      totalOutgoing,
      activePeople: personBalances.filter(p => p.netBalance !== 0).length,
    };
  }, [personalExpenses, personBalances, sharedExpenses]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour > 4 && hour < 12) return 'GoOd MorNinG';
    if (hour < 17) return 'GoOd AfterNooN';
    return 'GoOd EveNinG';
  }, []);

  const displayName = useMemo(() => {
    const normalized = (profileName || 'Guest').trim();
    if (normalized.length <= 20) return normalized;
    const firstName = normalized.split(/\s+/)[0]?.trim();
    return firstName && firstName.length > 0 ? firstName : normalized.slice(0, 20);
  }, [profileName]);

  useEffect(() => {
    const syncName = () => setProfileName(getAccountProfile().name || 'Guest');
    const syncSettings = () => setSettings(getHomeSettings());
    window.addEventListener('splitmate_account_changed', syncName);
    window.addEventListener('home_settings_changed', syncSettings);
    return () => {
      window.removeEventListener('splitmate_account_changed', syncName);
      window.removeEventListener('home_settings_changed', syncSettings);
    }
  }, []);

  useEffect(() => {
    const syncPro = () => setIsEffectivePro(isProUserCached());
    window.addEventListener('splitmate_pro_changed', syncPro);
    return () => window.removeEventListener('splitmate_pro_changed', syncPro);
  }, []);

  return (
    <div className="p-4 pb-40 space-y-5">
      {/* Header */}
      <div className="pt-4 pb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{greeting}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <h1 className="text-2xl font-bold"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--muted-foreground)))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >{displayName}</h1>
            {isEffectivePro && (
              <img
                src="/assets/pro-verified-gold.png"
                alt="Pro verified"
                className="w-4 h-4 object-contain"
              />
            )}
          </div>
        </div>
        <AccountQuickButton onClick={onOpenAccount} />
      </div>

      {/* Net Balance Card - hero */}
      <div
        className="p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--card) / 0.95) 50%, hsl(var(--accent) / 0.1) 100%)',
          border: '1px solid hsl(var(--primary) / 0.15)',
          borderRadius: '1.75rem',
          boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
        }}
      >
        <div className="absolute top-2 right-2 opacity-[0.08] rotate-12">
          <Wallet size={72} className="text-primary" />
        </div>
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, hsl(var(--primary)), transparent)' }} />

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3" style={{ letterSpacing: '0.08em' }}>
          Total Balance
        </p>
        <MoneyDisplay
          amount={stats.netTotalBalance}
          size="xl"
          showSign={true}
          className="block"
        />
        <p className="text-xs text-muted-foreground mt-2">
          {stats.netTotalBalance > 0 ? "You are in the green"
            : stats.netTotalBalance < 0 ? "You have total outgoing"
              : "All perfectly balanced! ⚖️"}
        </p>

        {/* Incoming / Outgoing breakdown */}
        {(stats.owedToYou > 0 || stats.totalOutgoing > 0) && (
          <div className="flex gap-3 mt-4 pt-4" style={{ borderTop: '1px solid hsl(var(--border) / 0.15)' }}>
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--success) / 0.15)' }}>
                <ArrowDownRight size={13} className="text-success" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Incoming</p>
                <p className="text-sm font-bold text-success">{currency.symbol}{stats.owedToYou.toLocaleString(currency.locale)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--danger) / 0.15)' }}>
                <ArrowUpRight size={13} className="text-danger" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Outgoing (Total)</p>
                <p className="text-sm font-bold text-danger">{currency.symbol}{stats.totalOutgoing.toLocaleString(currency.locale)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onAddPersonal}
          className="group h-[68px] flex items-center gap-3 px-4 rounded-2xl relative overflow-hidden font-semibold text-sm"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
            color: 'hsl(var(--primary-foreground))',
            boxShadow: '0 2px 12px -4px hsl(var(--glass-shadow) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.15)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <Plus size={18} />
          </div>
          <span className="text-left leading-tight">Add<br />Personal</span>
        </button>

        <button
          onClick={onAddShared}
          className="group h-[68px] flex items-center gap-3 px-4 rounded-2xl font-semibold text-sm"
          style={{
            background: 'hsl(var(--card) / 0.95)',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border) / 0.4)',
            boxShadow: '0 2px 12px -4px hsl(var(--glass-shadow) / 0.3)',
            transition: 'transform 0.2s ease, border-color 0.2s ease',
          }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'hsl(var(--primary) / 0.12)' }}>
            <Users size={16} className="text-primary" />
          </div>
          <span className="text-left leading-tight">Add<br />Split</span>
        </button>
      </div>

      {/* Dynamic Sections */}
      {settings.sectionOrder.map((sectionId) => {
        switch (sectionId) {
          case 'stats':
            return settings.showStats && (
              <div key="stats" className="grid grid-cols-3 gap-3">
                <div className="ios-card-modern p-4 text-center space-y-1">
                  <div className="w-8 h-8 mx-auto rounded-xl flex items-center justify-center" style={{ background: 'hsl(211 100% 58% / 0.12)' }}>
                    <TrendingUp size={14} className="text-blue-400" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{currency.symbol}{stats.thisMonthPersonal.toLocaleString(currency.locale)}</p>
                  <p className="text-[10px] text-muted-foreground">This Month</p>
                </div>
                <div className="ios-card-modern p-4 text-center space-y-1">
                  <div className="w-8 h-8 mx-auto rounded-xl flex items-center justify-center" style={{ background: 'hsl(270 50% 60% / 0.12)' }}>
                    <Activity size={14} className="text-purple-400" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{stats.totalTransactions}</p>
                  <p className="text-[10px] text-muted-foreground">Transactions</p>
                </div>
                <div className="ios-card-modern p-4 text-center space-y-1">
                  <div className="w-8 h-8 mx-auto rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--warning) / 0.12)' }}>
                    <Users size={14} className="text-warning" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{stats.activePeople}</p>
                  <p className="text-[10px] text-muted-foreground">Active</p>
                </div>
              </div>
            );
          case 'spending':
            return settings.showSpendingBreakdown && stats.categoryData.length > 0 && (
              <div key="spending" className="ios-card-modern p-5 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-400/15 rounded-xl flex items-center justify-center">
                    <PieChart size={15} className="text-purple-400" />
                  </div>
                  Spending Breakdown
                </h3>
                <ExpenseChart data={stats.categoryData} type="pie" height={200} />
              </div>
            );
          case 'balances': {
            const displayPeople = settings.selectedPersonNames && settings.selectedPersonNames.length > 0
              ? stats.topPeople.filter(p => settings.selectedPersonNames.includes(p.name))
              : stats.topPeople.slice(0, 2);

            return settings.showTopBalances && displayPeople.length > 0 && (
              <div key="balances" className="ios-card-modern p-5 pb-6 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-400/15 rounded-xl flex items-center justify-center">
                      <TrendingDown size={15} className="text-orange-400" />
                    </div>
                    Top Balances
                  </h3>
                  {stats.topPeople.length > 2 && (
                    <button
                      onClick={() => onNavigateToTab('shared')}
                      className="text-[10px] font-bold text-primary uppercase tracking-wider px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      View All
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {displayPeople.map((person) => {
                    const balance = person.netBalance;
                    const isPositive = balance > 0;
                    const isNegative = balance < 0;

                    return (
                      <button
                        key={person.name}
                        onClick={() => onNavigateToTab(`shared`)} // Simplification for now
                        className="w-full relative overflow-hidden flex items-center justify-between p-3.5 rounded-[1.25rem] text-left transition-all duration-200 active:scale-[0.97] group shadow-sm"
                        style={{
                          background: 'linear-gradient(to bottom right, hsl(var(--card)), hsl(var(--secondary) / 0.3))',
                          border: '1px solid hsl(var(--border) / 0.25)',
                        }}
                      >
                        <div className="flex items-center gap-3.5 relative z-10">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-inner"
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
                        <div className="text-right relative z-10">
                          <MoneyDisplay amount={balance} size="sm" showSign={true} className={isPositive ? "text-success" : isNegative ? "text-danger" : ""} />
                          <div className="h-0.5 w-8 ml-auto mt-1 rounded-full opacity-30" style={{ background: isPositive ? 'hsl(var(--success))' : 'hsl(var(--danger))' }} />
                        </div>
                      </button>
                    );
                  })}
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
          case 'converter':
            return settings.showConverter && <div key="converter"><ConverterWidget onNavigate={onNavigateToTab} /></div>;
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
    </div>
  );
}
