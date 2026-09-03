import { useState, useMemo } from 'react';
import { LucideIcon, Target, Landmark, Repeat, ExternalLink, ChevronRight, ArrowUpRight, ArrowDownRight, CheckCircle2, LayoutGrid, Globe, User, Users, PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getGoals, getLoans, getSubscriptions, getLinks, getPersonalExpenses, getHomeSettings, setPendingOpenItem, type GoalItem, type LoanItem, type SubscriptionItem, type LinkItem } from '@/lib/storage';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';

interface WidgetContainerProps {
  title: string;
  icon: LucideIcon;
  color: string;
  onViewAll: () => void;
  children: React.ReactNode;
  emptyText?: string;
}

function WidgetContainer({ title, icon: Icon, color, onViewAll, children, emptyText = "No active items" }: WidgetContainerProps) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <p className="text-xs text-muted-foreground uppercase flex items-center gap-2 font-medium">
          {Icon && <Icon size={14} className={color.replace('bg-', 'text-')} />}
          <span>{title}</span>
        </p>
        {onViewAll && (
          <button 
            onClick={onViewAll}
            className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.15em] hover:text-primary transition-colors flex items-center gap-0.5"
          >
            View All <ChevronRight size={10} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className="ios-card-modern px-3.5 py-1.5 relative overflow-hidden group">
        {children ? children : (
          <div className="py-2.5 text-center">
            <p className="text-xs text-muted-foreground/50 font-medium italic">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const currency = useCurrency();
  const settings = useMemo(() => getHomeSettings(), []);
  const goals = useMemo(() => {
    const all = getGoals().filter(g => {
      const total = (g.transactions || []).reduce((sum, t) => sum + t.amount, 0);
      return total < g.targetAmount;
    });
    
    if (settings.selectedGoalIds && settings.selectedGoalIds.length > 0) {
      return all.filter(g => settings.selectedGoalIds.includes(g.id)).slice(0, 2);
    }
    return all.slice(0, 2);
  }, [settings]);

  return (
    <WidgetContainer 
      title="Active Savings" 
      icon={Target} 
      color="bg-success" 
      onViewAll={() => onNavigate('goals')}
      emptyText="No savings set"
    >
      {goals.length > 0 ? (
        <div className="divide-y divide-dotted divide-border/40">
          {goals.map(goal => {
            const current = (goal.transactions || []).reduce((sum, t) => sum + t.amount, 0);
            const progress = Math.min(100, (current / goal.targetAmount) * 100);
            return (
              <div 
                key={goal.id} 
                onClick={() => {
                  setPendingOpenItem('goals', goal.id);
                  onNavigate('goals');
                }}
                className="py-2.5 space-y-2 cursor-pointer active:scale-[0.98] transition-all hover:bg-white/[0.02] -mx-2 px-2 rounded-xl"
              >
                <div className="flex justify-between items-end">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-bold text-foreground uppercase tracking-tight truncate leading-none mb-1">{goal.name}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Savings Progress</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-success tabular-nums tracking-tight leading-none">{Math.round(progress)}%</p>
                  </div>
                </div>

                <div className="h-2 bg-secondary rounded-full overflow-hidden shadow-inner border border-border/5">
                  <div 
                    className="h-full bg-success transition-all duration-700 ease-out relative shadow-[0_0_10px_rgba(34,197,94,0.3)] rounded-full" 
                    style={{ width: `${progress}%` }} 
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tight text-muted-foreground/80">
                   <div className="flex items-center gap-1">
                      <span className="text-[9px] opacity-50">Saved:</span>
                      <span className="text-foreground tabular-nums">{currency.symbol}{current.toLocaleString(currency.locale)}</span>
                   </div>
                   <div className="flex items-center gap-1">
                      <span className="text-[9px] opacity-50">Goal:</span>
                      <span className="text-foreground tabular-nums">{currency.symbol}{goal.targetAmount.toLocaleString(currency.locale)}</span>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </WidgetContainer>
  );
}

export function LoansWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const loans = useMemo(() => getLoans().filter(l => !l.closedAt).slice(0, 2), []);
  const currency = useCurrency();

  return (
    <WidgetContainer 
      title="Upcoming Loans" 
      icon={Landmark} 
      color="bg-warning" 
      onViewAll={() => onNavigate('loans')}
      emptyText="No pending loans"
    >
      {loans.length > 0 ? (
        <div className="divide-y divide-dotted divide-border/40">
          {loans.map(loan => (
            <div 
              key={loan.id} 
              onClick={() => {
                setPendingOpenItem('loans', loan.id);
                onNavigate('loans');
              }}
              className="py-2.5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all hover:bg-white/[0.02] -mx-2 px-2 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-[8px] flex items-center justify-center",
                  loan.direction === 'you-gave' ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                )}>
                  {loan.direction === 'you-gave' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate leading-tight">{loan.loanName}</p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5 whitespace-nowrap">Due: {new Date(loan.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
              <p className={cn("text-sm font-bold tabular-nums", loan.direction === 'you-gave' ? "text-success" : "text-danger")}>
                {currency.symbol}{loan.outstandingPrincipal.toLocaleString(currency.locale)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </WidgetContainer>
  );
}

function formatSubDate(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  let d: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

export function SubscriptionsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const settings = useMemo(() => getHomeSettings(), []);
  const subs = useMemo(() => {
    const all = getSubscriptions().filter(s => !s.paused);
    if (settings.selectedSubscriptionIds && settings.selectedSubscriptionIds.length > 0) {
      return all.filter(s => settings.selectedSubscriptionIds.includes(s.id)).slice(0, 2);
    }
    return all.slice(0, 2);
  }, [settings]);
  const currency = useCurrency();

  return (
    <WidgetContainer 
      title="Subscription Dues" 
      icon={Repeat} 
      color="bg-primary" 
      onViewAll={() => onNavigate('subscriptions')}
      emptyText="No active cycles"
    >
      {subs.length > 0 ? (
        <div className="divide-y divide-dotted divide-border/40">
          {subs.map(sub => (
            <div 
              key={sub.id} 
              onClick={() => {
                setPendingOpenItem('subscriptions', sub.id);
                onNavigate('subscriptions');
              }}
              className="py-2 flex items-center justify-between group/sub cursor-pointer active:scale-[0.98] transition-all hover:bg-white/[0.02] -mx-2 px-2 rounded-xl"
            >
              <div className="flex items-center gap-3">
                {sub.logoUrl ? (
                  <div className="w-10 h-10 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center">
                    <img
                      src={sub.logoUrl}
                      className="w-full h-full object-cover scale-115"
                      alt={sub.appName}
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 bg-secondary/50">
                    <CheckCircle2 size={22} className="text-primary" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground tracking-tight leading-none mb-1 truncate">{sub.appName}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <span>{sub.cycle}</span>
                    {sub.startDate && (
                      <span className="text-muted-foreground/60 font-medium">· {formatSubDate(sub.startDate)}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right pr-1">
                <p className="text-base font-bold text-foreground tabular-nums tracking-tight">
                  {currency.symbol}{sub.amount.toLocaleString(currency.locale)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </WidgetContainer>
  );
}

export function CategoryInsightsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const settings = useMemo(() => getHomeSettings(), []);
  const categories = useMemo(() => {
    const expenses = getPersonalExpenses().filter(e => !e.isMirror);
    const map: Record<string, number> = {};
    expenses.forEach(e => {
       map[e.category] = (map[e.category] || 0) + e.amount;
    });
    const all = Object.entries(map).sort((a,b) => b[1] - a[1]);
    
    if (settings.selectedCategoryNames && settings.selectedCategoryNames.length > 0) {
      return all.filter(([cat]) => settings.selectedCategoryNames.includes(cat));
    }
    return all.slice(0, 2);
  }, [settings]);

  return (
    <WidgetContainer 
      title="Category Insights" 
      icon={LayoutGrid} 
      color="bg-purple-500" 
      onViewAll={() => onNavigate('categories')}
      emptyText="No categories tracked yet"
    >
      {categories.length > 0 ? (
        <div className="divide-y divide-dotted divide-border/40">
          {categories.map(([cat, amount]) => (
            <div 
              key={cat} 
              onClick={() => onNavigate('categories')}
              className="flex justify-between items-center py-2.5 text-xs cursor-pointer active:scale-[0.98] transition-all hover:bg-white/[0.02] -mx-2 px-2 rounded-xl"
            >
              <span className="font-bold text-foreground">{cat}</span>
              <MoneyDisplay amount={amount} size="sm" />
            </div>
          ))}
        </div>
      ) : null}
    </WidgetContainer>
  );
}

export function BudgetsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  // Mock/Simple implementation for now or use actual budget data if available
  return (
    <WidgetContainer 
      title="My Budgets" 
      icon={Landmark} 
      color="bg-emerald-500" 
      onViewAll={() => onNavigate('budgets')}
      emptyText="No budgets set"
    >
      <div className="py-2.5">
         <p className="text-xs text-muted-foreground text-center">Track your spending limits <br/> in the Budgets tab</p>
      </div>
    </WidgetContainer>
  );
}



export function RecentPersonalWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const recent = useMemo(() => getPersonalExpenses().filter(e => !e.isMirror).slice(0, 2), []);
  return (
    <WidgetContainer 
      title="Recent Private" 
      icon={User} 
      color="bg-orange-500" 
      onViewAll={() => onNavigate('personal')}
      emptyText="No personal expenses"
    >
      {recent.length > 0 ? (
        <div className="divide-y divide-dotted divide-border/40">
          {recent.map(e => (
            <div 
              key={e.id} 
              onClick={() => onNavigate('personal')}
              className="flex justify-between items-center py-2 cursor-pointer active:scale-[0.98] transition-all hover:bg-white/[0.02] -mx-2 px-2 rounded-xl"
            >
               <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{e.reason}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(e.date).toLocaleDateString()}</p>
               </div>
               <MoneyDisplay amount={e.amount} size="sm" />
            </div>
          ))}
        </div>
      ) : null}
    </WidgetContainer>
  );
}

export function RecentSharedWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <WidgetContainer 
      title="Recent Shared" 
      icon={Users} 
      color="bg-pink-500" 
      onViewAll={() => onNavigate('shared')}
      emptyText="No shared activity"
    >
      <div className="py-2.5">
         <p className="text-xs text-muted-foreground text-center italic">Go to Shared tab to see activity</p>
      </div>
    </WidgetContainer>
  );
}

export function PinnedLinksWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const settings = useMemo(() => getHomeSettings(), []);
  const links = useMemo(() => {
    const all = getLinks();
    if (settings.selectedLinkIds && settings.selectedLinkIds.length > 0) {
      return all.filter(l => settings.selectedLinkIds.includes(l.id)).slice(0, 2);
    }
    return all.filter(l => l.pinned).slice(0, 2);
  }, [settings]);

  return (
    <WidgetContainer 
      title="Quick Access" 
      icon={ExternalLink} 
      color="bg-sky-400" 
      onViewAll={() => onNavigate('links')}
      emptyText="Pin important links"
    >
      {links.length > 0 ? (
        <div className="grid grid-cols-2 divide-x divide-dotted divide-border/40">
          {links.map(link => (
            <a 
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 flex items-center gap-2.5 active:scale-95 transition-all group/link overflow-hidden h-12"
            >
              {link.favicon ? (
                <img src={link.favicon} alt="" className="w-5 h-5 object-contain rounded-md shrink-0" />
              ) : (
                <ExternalLink size={14} className="text-muted-foreground/50 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate pr-1 tracking-tight">{link.title || link.name || 'Untitled'}</p>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </WidgetContainer>
  );
}
