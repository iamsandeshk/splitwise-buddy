
import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, PiggyBank, TrendingUp, Wallet, Calendar, AlertCircle, CheckCircle2, Save, IndianRupee, ChevronLeft } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import {
  getBudgetPlannerConfig,
  getPersonalExpenses,
  saveBudgetPlannerConfig,
  getAccounts,
  type BudgetPlannerConfig,
} from '@/lib/storage';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';
import { useCurrency } from '@/hooks/use-currency';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useBannerAd } from '@/hooks/useBannerAd';

interface BudgetsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

const toInputValue = (value: number) => (value > 0 ? String(value) : '');

export function BudgetsTab({ onOpenAccount, onBack, bannerAdActive = true }: BudgetsTabProps) {
  useBannerAd(bannerAdActive);
  const currency = useCurrency();
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const handleTriggerAdd = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string }>).detail;
      if (detail?.tabId === 'budgets') setShowAddModal(true);
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    return () => window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
  }, []);

  const [config, setConfig] = useState<BudgetPlannerConfig>(() => getBudgetPlannerConfig());
  const [incomeInput, setIncomeInput] = useState(() => toInputValue(getBudgetPlannerConfig().monthlyIncome));
  const [fixedInput, setFixedInput] = useState(() => toInputValue(getBudgetPlannerConfig().fixedExpenses));
  const [savingsInput, setSavingsInput] = useState(() => toInputValue(getBudgetPlannerConfig().savingsGoal));
  const [expenses, setExpenses] = useState(() => getPersonalExpenses());

  useEffect(() => {
    const sync = () => {
      const latest = getBudgetPlannerConfig();
      setConfig(latest);
      setIncomeInput(toInputValue(latest.monthlyIncome));
      setFixedInput(toInputValue(latest.fixedExpenses));
      setSavingsInput(toInputValue(latest.savingsGoal));
      setExpenses(getPersonalExpenses());
    };

    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('splitmate_budget_changed', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('splitmate_budget_changed', sync);
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonthKey = now.toISOString().slice(0, 7);
    const monthExpenses = expenses.filter((expense) => expense.date.startsWith(currentMonthKey));

    const spent = monthExpenses.reduce((sum, item) => sum + item.amount, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);

    const monthlyLimit = config.fixedExpenses;
    const remaining = monthlyLimit - spent;
    // Daily is 0 if remaining is negative
    const daily = Math.max(0, remaining / remainingDays);

    const usageRatio = monthlyLimit > 0 ? spent / monthlyLimit : 0;
    const progress = monthlyLimit > 0 ? Math.min(100, Math.max(0, usageRatio * 100)) : 0;

    return {
      spent,
      monthlyLimit,
      remaining,
      remainingDays,
      daily,
      progress,
      usageRatio,
    };
  }, [config.fixedExpenses, expenses]);

  const handleSave = () => {
    const parse = (value: string) => {
      const num = Number(value);
      return Number.isFinite(num) && num >= 0 ? num : 0;
    };

    saveBudgetPlannerConfig({
      monthlyIncome: parse(incomeInput),
      fixedExpenses: parse(fixedInput),
      savingsGoal: parse(savingsInput),
      targetDailyAllowance: 0,
      categoryBudgets: config.categoryBudgets,
    });
    
    toast({
       title: "Plan Saved",
       description: "Your monthly budget has been updated."
    });
    
    // Trigger sync
    window.dispatchEvent(new Event('splitmate_budget_changed'));
  };

  const status = useMemo(() => {
    if (stats.monthlyLimit <= 0) {
      return { 
        text: 'Initiate your fixed monthly budget to start intelligent planning.', 
        tone: 'text-muted-foreground',
        icon: AlertCircle,
        bg: 'bg-secondary/10'
      };
    }
    if (stats.remaining < 0) {
      return { 
        text: 'Debt Alert: You have exceeded your allowance. Adjust your plan immediately.', 
        tone: 'text-destructive',
        icon: AlertCircle,
        bg: 'bg-destructive/10'
      };
    }
    if (stats.usageRatio >= 0.8) {
      return { 
        text: 'Critical: You have utilized 80%+ of your planned budget.', 
        tone: 'text-warning',
        icon: TrendingUp,
        bg: 'bg-warning/10'
      };
    }
    return { 
      text: `Optimized: You can spend ${currency.symbol}${Math.max(0, stats.daily).toLocaleString(currency.locale, { maximumFractionDigits: 0 })} per day safely.`, 
      tone: 'text-success',
      icon: CheckCircle2,
      bg: 'bg-success/10'
    };
  }, [currency.locale, currency.symbol, stats.daily, stats.monthlyLimit, stats.remaining, stats.usageRatio]);

  return (
    <div className="p-4 pb-40 space-y-6">
      {/* Header Section */}
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all mt-0.5"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Budgets<span className="text-primary">.</span></h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">Master your monthly flow</p>
          </div>
        </div>
      </div>

      <div className={cn(
        "relative overflow-hidden p-6 rounded-[1.5rem] bg-card border border-border/40 transition-all duration-500",
        stats.remaining < 0 && "border-destructive/30 bg-destructive/[0.02]"
      )}>
        <div className="grid grid-cols-2 gap-6 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
               <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center text-primary transition-colors group-hover:bg-primary/20">
                  <Wallet size={14} strokeWidth={2.5} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Remaining</p>
            </div>
            <MoneyDisplay 
               amount={stats.remaining} 
               size="lg" 
               className={cn("font-black tracking-tighter transition-all", stats.remaining < 0 ? "text-destructive" : "text-foreground")} 
            />
          </div>
          <div className="text-right space-y-1.5">
            <div className="flex items-center justify-end gap-2 mb-1">
               <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Safe Daily</p>
               <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                  stats.remaining < 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
               )}>
                  <TrendingUp size={14} strokeWidth={2.5} />
               </div>
            </div>
            <MoneyDisplay 
               amount={stats.daily} 
               size="lg" 
               className={cn("font-black tracking-tighter transition-all", stats.remaining < 0 ? "text-destructive/60 scale-90" : "text-success")} 
            />
            <div className="flex items-center justify-end gap-1.5 opacity-40">
               <Calendar size={10} strokeWidth={3} />
               <p className="text-[10px] font-black uppercase tracking-wider">{stats.remainingDays} days left</p>
            </div>
          </div>
        </div>
        
        {/* Status Alert Bar */}
        <div className={cn(
           "mt-6 p-4 rounded-2xl flex items-center gap-3 transition-all transform",
           status.bg,
           stats.remaining < 0 && "animate-pulse shadow-inner"
        )}>
           <status.icon size={16} className={status.tone} strokeWidth={2.5} />
           <p className={cn("text-[11px] font-bold leading-tight", status.tone)}>{status.text}</p>
        </div>
        
        {/* Decorative background glow */}
        <div className={cn(
           "absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[80px] opacity-20 pointer-events-none transition-all duration-1000",
           stats.remaining < 0 ? "bg-destructive opacity-40 scale-150" : "bg-primary"
        )} />
      </div>

      {/* Progress Card */}
      <div className="p-6 space-y-5 rounded-[1.5rem] bg-card border border-border/40 transition-all">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                <TrendingUp size={20} strokeWidth={2.5} />
              </div>
              <div>
                 <p className="font-extrabold text-[15px] tracking-tight">Spent vs Budget</p>
                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-0.5">Real-time tracking</p>
              </div>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest mb-1">Utilization</p>
              <p className={cn(
                 "font-black text-sm tracking-tighter",
                 stats.remaining < 0 ? "text-destructive" : "text-primary"
              )}>{Math.round(stats.progress)}%</p>
           </div>
        </div>
        
        <div className="space-y-3">
           <div className="relative h-3 w-full rounded-2xl bg-secondary/40 overflow-hidden shadow-inner">
              <div
                className={cn(
                  "h-full rounded-2xl transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,0,0,0.1)]",
                  stats.remaining < 0
                    ? 'bg-destructive shadow-[0_0_15px_rgba(var(--destructive),0.4)]'
                    : stats.usageRatio >= 0.8
                      ? 'bg-warning'
                      : 'bg-success'
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, stats.progress))}%`,
                }}
              />
              {/* Shine effect */}
              <div className="absolute inset-x-0 h-full w-32 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
           </div>
           
           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 px-1 font-mono">
              <p>{currency.symbol}{stats.spent.toLocaleString(currency.locale)} SPENT</p>
              <p>{currency.symbol}{Math.max(0, stats.monthlyLimit).toLocaleString(currency.locale)} TARGET</p>
           </div>
        </div>
      </div>

      {/* Planner Card */}
      <div className="p-6 space-y-6 rounded-[1.5rem] bg-secondary/5 border border-dashed border-border/20 transition-all hover:bg-secondary/10">
        <div className="flex items-center gap-3 mb-2">
           <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
             <PiggyBank size={20} strokeWidth={2.5} />
           </div>
           <div>
              <p className="font-extrabold text-[15px] tracking-tight">Monthly Planner</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mt-0.5">Set goals and limits</p>
           </div>
        </div>

        <div className="space-y-3">
           {[
             { label: 'Monthly Income', val: incomeInput, set: setIncomeInput, icon: IndianRupee, color: 'text-success' },
             { label: 'Fixed Monthly Budget', val: fixedInput, set: setFixedInput, icon: Wallet, color: 'text-primary' },
             { label: 'Savings Goal (Optional)', val: savingsInput, set: setSavingsInput, icon: PiggyBank, color: 'text-indigo-500' }
           ].map((field) => (
             <div key={field.label} className="relative group">
                <div className={cn("absolute left-4 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity", field.color)}>
                   <field.icon size={16} strokeWidth={2.5} />
                </div>
                <input
                  type="number"
                  min="0"
                  value={field.val}
                  onChange={(e) => field.set(e.target.value)}
                  placeholder={field.label}
                  className="w-full h-14 pl-12 pr-6 rounded-2xl text-[14px] font-bold bg-background border border-border/10 focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all placeholder:font-black placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest placeholder:opacity-30"
                />
             </div>
           ))}
        </div>

        <button
          onClick={handleSave}
          className="w-full h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-primary text-white active:scale-95 transition-all flex items-center justify-center gap-2 font-sans"
        >
          <Save size={16} strokeWidth={2.5} />
          Lock Budget Plan
        </button>

         <div className="p-4 rounded-2xl bg-secondary/20 flex gap-3 border border-border/5">
           <AlertCircle size={14} className="text-muted-foreground/40 shrink-0 mt-0.5" />
           <p className="text-[10px] font-bold text-muted-foreground/40 leading-relaxed italic">
             Smart calculation enabled: Remaining = Fixed budget - Spend. Safe daily = Remaining / days.
           </p>
        </div>
      </div>

      {showAddModal && getAccounts().length === 0 && (
        <AddFirstAccountModal
          isOpen={true}
          onClose={() => setShowAddModal(false)}
          onAccountCreated={() => {}}
        />
      )}
    </div>
  );
}
