import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { ArrowLeft, Calendar, Plus, Target, Trash2, Wallet, X, ArrowRightLeft, ChevronLeft } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { generateId, getGoals, saveGoals, savePersonalExpense, getAccountSummaries, getDefaultAccountId, consumePendingOpenItem, type GoalItem, type PersonalExpense } from '@/lib/storage';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';
import { NativeAdCard } from '@/components/NativeAdCard';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';
import { FREE_LIMITS } from '@/lib/storage';

interface GoalsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

export function GoalsTab({ onOpenAccount, onBack, bannerAdActive = true }: GoalsTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const currency = useCurrency();
  const { toast } = useToast();
  const [goals, setGoals] = useState<GoalItem[]>(getGoals());
  const [showCreate, setShowCreate] = useState(false);
  const [activeGoal, setActiveGoal] = useState<GoalItem | null>(null);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [moneyAction, setMoneyAction] = useState<'add' | 'remove'>('add');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const accounts = useMemo(() => getAccountSummaries(), []);
  const defaultAccountId = useMemo(() => getDefaultAccountId(), []);

  const [selectedFromAccountId, setSelectedFromAccountId] = useState<string>('');
  const [selectedToAccountId, setSelectedToAccountId] = useState<string>('');

  useBackHandler(showCreate, () => setShowCreate(false));
  useBackHandler(!!activeGoal, () => { setActiveGoal(null); setShowAddMoney(false); });
  useBackHandler(!!showDeleteConfirm, () => setShowDeleteConfirm(null));

  const [createForm, setCreateForm] = useState({
    name: '',
    targetAmount: '',
    expectedDate: '',
    targetAccountId: '',
  });

  useEffect(() => {
    if (activeGoal) {
      setSelectedToAccountId(activeGoal.targetAccountId || defaultAccountId || accounts[0]?.id || '');
      setSelectedFromAccountId(defaultAccountId || accounts[0]?.id || '');
    }
  }, [activeGoal, defaultAccountId, accounts]);

  useEffect(() => {
    const handleTriggerAdd = (e: Event) => {
      const customEvent = e as CustomEvent<{ tabId?: string }>;
      if (customEvent.detail?.tabId === 'goals') setShowCreate(true);
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    return () => window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
  }, []);

  useEffect(() => {
    const checkPending = () => {
      const pendingId = consumePendingOpenItem('goals');
      if (pendingId) {
        const found = goals.find(g => g.id === pendingId);
        if (found) setActiveGoal(found);
      }
    };
    checkPending();

    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string; id?: string }>).detail;
      if (detail?.tab === 'goals' && detail.id) {
        const found = goals.find(g => g.id === detail.id);
        if (found) setActiveGoal(found);
      }
    };
    window.addEventListener('splitmate_open_item', handleOpen);
    return () => window.removeEventListener('splitmate_open_item', handleOpen);
  }, [goals]);

  const summary = useMemo(() => {
    const target = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
    const saved = goals.reduce((sum, goal) => sum + goal.transactions.reduce((inner, item) => inner + item.amount, 0), 0);
    return { target, saved };
  }, [goals]);

  const upsertGoals = (next: GoalItem[]) => {
    const saved = saveGoals(next);
    if (!saved) return false;
    setGoals(next);
    return true;
  };

  const handleCreateGoal = () => {
    const targetAmount = Number(createForm.targetAmount);
    if (!createForm.name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !createForm.expectedDate) {
      return;
    }

    const selectedTargetAccount = createForm.targetAccountId || defaultAccountId || accounts[0]?.id;

    const item: GoalItem = {
      id: generateId(),
      name: createForm.name.trim(),
      targetAmount,
      expectedDate: createForm.expectedDate,
      targetAccountId: selectedTargetAccount,
      transactions: [],
      createdAt: new Date().toISOString(),
    };

    const saved = upsertGoals([item, ...goals]);
    if (!saved) return;
    setCreateForm({ name: '', targetAmount: '', expectedDate: '', targetAccountId: '' });
    setShowCreate(false);
    toast({ title: "Goal Created", description: `"${item.name}" has been started.` });
  };

  const openGoal = (goal: GoalItem) => {
    setActiveGoal(goal);
    setShowAddMoney(true);
  };

  const handleAddSavings = () => {
    if (!activeGoal) return;
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const fromAccId = selectedFromAccountId || defaultAccountId || accounts[0]?.id;
    const toAccId = selectedToAccountId || activeGoal.targetAccountId || defaultAccountId || accounts[0]?.id;

    const signedAmount = moneyAction === 'remove' ? -amount : amount;

    const tx = {
      id: generateId(),
      amount: signedAmount,
      fromAccountId: fromAccId,
      toAccountId: toAccId,
      createdAt: new Date().toISOString(),
    };

    const next = goals.map((goal) =>
      goal.id === activeGoal.id ? { ...goal, transactions: [tx, ...goal.transactions] } : goal
    );

    const saved = upsertGoals(next);
    if (!saved) return;

    // TRANSFER AND DEDUCTION LOGIC:
    // If saving in the SAME account (fromAccId === toAccId):
    // "if the amount being saved on same account then don't deduct from that account"
    // If saving from DIFFERENT accounts (fromAccId !== toAccId):
    // "if its different then deduct from one account and add to another account"
    if (fromAccId && toAccId && fromAccId !== toAccId) {
      const fromAccName = accounts.find(a => a.id === fromAccId)?.name || 'Account';
      const toAccName = accounts.find(a => a.id === toAccId)?.name || 'Account';

      if (moneyAction === 'add') {
        // Deduct from Source Account (Expense)
        savePersonalExpense({
          id: generateId(),
          amount: amount,
          reason: `Savings transfer to ${toAccName} (${activeGoal.name})`,
          category: 'Other',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isIncome: false,
          isMirror: true,
          mirrorFromId: tx.id,
          accountId: fromAccId,
        });

        // Add to Target Account (Income)
        savePersonalExpense({
          id: generateId(),
          amount: amount,
          reason: `Savings transfer from ${fromAccName} (${activeGoal.name})`,
          category: 'Other',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isIncome: true,
          isMirror: true,
          mirrorFromId: tx.id,
          accountId: toAccId,
        });
      } else {
        // Withdraw: Deduct from Target Account (Expense) and Add to Source Account (Income)
        savePersonalExpense({
          id: generateId(),
          amount: amount,
          reason: `Goal withdrawal from ${toAccName} (${activeGoal.name})`,
          category: 'Other',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isIncome: false,
          isMirror: true,
          mirrorFromId: tx.id,
          accountId: toAccId,
        });

        savePersonalExpense({
          id: generateId(),
          amount: amount,
          reason: `Goal withdrawal to ${fromAccName} (${activeGoal.name})`,
          category: 'Other',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isIncome: true,
          isMirror: true,
          mirrorFromId: tx.id,
          accountId: fromAccId,
        });
      }
    }

    const updated = next.find((goal) => goal.id === activeGoal.id) || null;
    setActiveGoal(updated);
    setNewAmount('');
    toast({
      title: moneyAction === 'add' ? "Savings Added" : "Savings Withdrawn",
      description: fromAccId === toAccId 
        ? `Saved in same account (no balance deduction needed).`
        : `Transferred ${currency.symbol}${amount} between accounts.`,
    });
  };

  const handleDeleteGoal = (id: string) => {
    const goalToRemove = goals.find(g => g.id === id);
    if (goalToRemove) {
      const txIds = goalToRemove.transactions.map(tx => tx.id);
      const pExpenses = JSON.parse(localStorage.getItem('splitmate_personal_expenses') || '[]');
      const nextPExpenses = pExpenses.filter((pe: PersonalExpense) => !txIds.includes(pe.mirrorFromId || ''));
      localStorage.setItem('splitmate_personal_expenses', JSON.stringify(nextPExpenses));
    }

    const next = goals.filter((goal) => goal.id !== id);
    const saved = upsertGoals(next);
    if (!saved) return;

    if (activeGoal?.id === id) {
      setActiveGoal(null);
      setShowAddMoney(false);
    }
    setShowDeleteConfirm(null);
    toast({ title: "Savings Erased", description: "Target removed." });
  };

  return (
    <div className="p-4 pb-40 space-y-6 font-sans">
      {/* Header Section */}
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all mt-0.5"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Savings<span className="text-primary">.</span></h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">Save toward future targets</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 w-full">
        <div className="rounded-[1.75rem] p-4 space-y-1 bg-secondary/20 border border-border/10 w-full">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Target size={12} strokeWidth={2.5} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Target</p>
          </div>
          <MoneyDisplay amount={summary.target} size="sm" className="font-black text-foreground" />
        </div>
        <div className="rounded-[1.75rem] p-4 space-y-1 w-full" style={{ background: 'hsl(var(--success) / 0.08)', border: '1px solid hsl(var(--success) / 0.1)' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-success/10 flex items-center justify-center text-success">
              <Wallet size={12} strokeWidth={2.5} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-success/60">Saved</p>
          </div>
          <MoneyDisplay amount={summary.saved} size="sm" className="font-black text-success" />
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="ios-card-modern p-12 text-center rounded-[2.5rem] w-full">
          <Target className="mx-auto mb-4 text-muted-foreground/20" size={48} />
          <p className="text-sm font-bold text-muted-foreground/60 italic">No savings yet. Tap + to start saving.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 w-full">
          {goals.map((goal, idx) => {
            const isLockedGoal = !isPro && idx >= FREE_LIMITS.MAX_GOALS;
            const saved = goal.transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const progress = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
            const remainingAmount = Math.max(0, goal.targetAmount - saved);
            const targetAccName = accounts.find(a => a.id === goal.targetAccountId)?.name || 'Default Account';

            return (
              <div key={goal.id} className="contents">
                <button
                  onClick={() => {
                    if (isLockedGoal) {
                      requestProUpgrade('goals', 'Free users can track 1 goal. Upgrade to Pro for unlimited goals.');
                      return;
                    }
                    openGoal(goal);
                  }}
                  className="group relative flex flex-col p-5 rounded-[2.5rem] bg-card border border-border/40 transition-all duration-300 active:scale-[0.98] text-left overflow-hidden shadow-sm hover:shadow-md w-full"
                >
                  <div className={cn(isLockedGoal && 'opacity-40 pointer-events-none')}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:scale-110 duration-500",
                          progress >= 100 ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                        )}>
                          <Target size={22} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-[15px] truncate leading-tight tracking-tight uppercase">{goal.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 bg-secondary/50 px-2 py-0.5 rounded-full">
                              {targetAccName}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider opacity-60">
                              {new Date(goal.expectedDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(goal.id);
                          }}
                          className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive/80 hover:text-white hover:bg-destructive flex items-center justify-center transition-all"
                        >
                          <Trash2 size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-4 mb-3 w-full">
                      <div className="flex flex-col">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 leading-none mb-1.5">Saved</p>
                        <MoneyDisplay amount={saved} size="md" className="font-black text-foreground" />
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/30 leading-none mb-1.5">Target</p>
                        <MoneyDisplay amount={goal.targetAmount} size="sm" className="font-bold opacity-60" />
                      </div>
                    </div>

                    <div className="relative h-3 w-full rounded-2xl bg-secondary/40 overflow-hidden mt-1">
                      <div
                        className={cn(
                          "h-full rounded-2xl transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,0,0,0.1)]",
                          progress >= 100 ? "bg-success" : "bg-primary"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                      <div className="absolute inset-x-0 h-full w-20 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
                    </div>

                    <div className="mt-3 flex justify-between items-center w-full">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 font-mono">
                        {progress >= 100 ? 'Target Achieved' : `${Math.round(progress)}% Complete`}
                      </p>
                      {progress > 0 && progress < 100 && (
                        <span className="text-[10px] font-black text-red-500 font-mono tracking-widest">
                          {currency.symbol}{remainingAmount.toLocaleString(currency.locale, { maximumFractionDigits: 2 })} Left
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {idx === 0 && <NativeAdCard />}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE GOAL MODAL */}
      {showCreate && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md bg-card rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-10 duration-300 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border/10 flex items-center justify-between">
              <h3 className="font-black text-lg tracking-tight uppercase">Create Savings</h3>
              <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all font-sans" onClick={() => setShowCreate(false)}>
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-7 space-y-4">
              <div className="space-y-[1.1rem]">
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Savings Name (e.g. Dream Trip)"
                  className="w-full h-14 px-5 rounded-2xl text-[15px] font-bold bg-secondary/40 border-0 focus:ring-2 focus:ring-primary/20 placeholder:opacity-50"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-black">{currency.symbol}</span>
                    <input
                      type="number"
                      min="0"
                      value={createForm.targetAmount}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, targetAmount: e.target.value }))}
                      placeholder="Target"
                      className="w-full h-14 pl-10 pr-4 rounded-2xl text-[15px] font-bold bg-secondary/40 border-0 focus:ring-2 focus:ring-primary/20 placeholder:opacity-50"
                    />
                  </div>
                  <input
                    type="date"
                    value={createForm.expectedDate}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, expectedDate: e.target.value }))}
                    className="w-full h-14 px-4 rounded-2xl text-[15px] font-bold bg-secondary/40 border-0 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1 pt-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 px-1">Target Account (Savings Location)</p>
                  <select
                    value={createForm.targetAccountId || defaultAccountId || accounts[0]?.id || ''}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, targetAccountId: e.target.value }))}
                    className="w-full h-14 px-4 rounded-2xl text-xs font-bold bg-secondary/40 border-0 outline-none capitalize"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({currency.symbol}{acc.available.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateGoal}
                className="w-full h-14 rounded-[1.25rem] text-[15px] font-black uppercase tracking-widest bg-primary text-primary-foreground shadow-xl shadow-primary/20 active:scale-95 transition-all mt-4 font-sans"
              >
                Create Savings
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MANAGE SAVINGS MODAL */}
      {activeGoal && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setActiveGoal(null); setShowAddMoney(false); }}>
          <div className="w-full max-w-md bg-card rounded-[2.5rem] overflow-hidden animate-in slide-in-from-bottom-10 duration-300 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-border/10 flex items-center justify-between">
              <h3 className="font-black text-lg tracking-tight truncate pr-4 uppercase">{activeGoal.name}</h3>
              <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all font-sans" onClick={() => { setActiveGoal(null); setShowAddMoney(false); }}>
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="p-7 space-y-4">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-lg">{currency.symbol}</span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-16 pl-12 pr-6 rounded-[1.75rem] text-3xl font-black bg-secondary/30 border-0 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMoneyAction('add')}
                      className={cn(
                        "flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all font-sans",
                        moneyAction === 'add' ? "bg-success text-white shadow-lg shadow-success/20 scale-105 z-10" : "bg-secondary/40 text-muted-foreground/60"
                      )}
                    >
                      Add Funds
                    </button>
                    <button
                      onClick={() => setMoneyAction('remove')}
                      className={cn(
                        "flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all font-sans",
                        moneyAction === 'remove' ? "bg-destructive text-white shadow-lg shadow-destructive/20 scale-105 z-10" : "bg-secondary/40 text-muted-foreground/60"
                      )}
                    >
                      Withdraw
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 px-1">
                        {moneyAction === 'add' ? 'From Account' : 'To Account'}
                      </p>
                      <select
                        value={selectedFromAccountId || defaultAccountId || accounts[0]?.id || ''}
                        onChange={(e) => setSelectedFromAccountId(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl text-xs font-bold bg-secondary/30 border-0 outline-none capitalize"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 px-1">
                        {moneyAction === 'add' ? 'Save In Account' : 'From Savings Account'}
                      </p>
                      <select
                        value={selectedToAccountId || activeGoal.targetAccountId || defaultAccountId || accounts[0]?.id || ''}
                        onChange={(e) => setSelectedToAccountId(e.target.value)}
                        className="w-full h-12 px-3 rounded-xl text-xs font-bold bg-secondary/30 border-0 outline-none capitalize"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground/70 font-medium text-center italic">
                    {selectedFromAccountId === selectedToAccountId 
                      ? 'Saving within the same account (no balance deduction needed).'
                      : 'Saving from different account (deducts from Source & adds to Target).'}
                  </p>

                  <button
                    onClick={handleAddSavings}
                    className="w-full h-14 rounded-2xl text-sm font-black uppercase tracking-widest bg-primary text-white shadow-xl shadow-primary/20 active:scale-95 transition-all font-sans"
                  >
                    Confirm Transaction
                  </button>
                </div>

                <div className="space-y-3 pt-4 border-t border-border/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 text-center">History</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {activeGoal.transactions.length === 0 ? (
                      <div className="p-8 text-center bg-secondary/10 rounded-2xl w-full">
                        <p className="text-[11px] font-bold text-muted-foreground/40 italic">Transaction history clear</p>
                      </div>
                    ) : (
                      activeGoal.transactions.map((tx) => (
                        <div key={tx.id} className="rounded-2xl px-4 py-3 flex items-center justify-between bg-secondary/30 border border-border/5 group-hover:bg-secondary/40 transition-colors w-full">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-1.5 h-6 rounded-full", tx.amount < 0 ? "bg-destructive/40" : "bg-success/40")} />
                            <div>
                              <p className="font-extrabold text-[13px]">{new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 leading-none mt-0.5">{tx.amount < 0 ? 'Withdrawal' : 'Deposit'}</p>
                            </div>
                          </div>
                          <MoneyDisplay amount={tx.amount} size="sm" className={cn("font-black", tx.amount < 0 ? "text-destructive" : "text-success")} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 pt-0 opacity-40 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tap outside to close</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* DESTROY CONFIRMATION MODAL */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowDeleteConfirm(null)}>
          <div className="w-full max-w-md bg-card rounded-[2.5rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4"><Trash2 size={28} className="text-destructive" /></div>
              <h2 className="text-xl font-black tracking-tight text-destructive">Delete Savings?</h2>
              <p className="text-sm text-muted-foreground px-4 leading-relaxed font-medium">This will permanently erase the savings target and all its history. This action cannot be undone.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <button onClick={() => setShowDeleteConfirm(null)} className="h-14 rounded-2xl bg-secondary font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all font-sans">Cancel</button>
              <button onClick={() => handleDeleteGoal(showDeleteConfirm)} className="h-14 rounded-2xl bg-destructive text-white font-black uppercase tracking-widest text-[11px] shadow-lg shadow-destructive/20 active:scale-95 transition-all font-sans">Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {(showCreate || showAddMoney) && accounts.length === 0 && (
        <AddFirstAccountModal
          isOpen={true}
          onClose={() => {
            setShowCreate(false);
            setShowAddMoney(false);
          }}
          onAccountCreated={() => {}}
        />
      )}
    </div>
  );
}
