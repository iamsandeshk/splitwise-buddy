import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CreditCard, Lock, Pencil, PiggyBank, Plus, Star, Trash2, Wallet, type LucideIcon } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { AccountTransactionsView } from '@/components/AccountTransactionsView';
import {
  FINANCIAL_ACCOUNT_TYPES,
  FREE_LIMITS,
  deleteAccount,
  getAccountSummaries,
  getAccounts,
  saveAccount,
  savePersonalExpense,
  generateId,
  type FinancialAccount,
  type FinancialAccountType,
} from '@/lib/storage';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';

interface AccountsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

interface AccountFormState {
  id?: string;
  name: string;
  type: FinancialAccountType;
  budget: string;
  isDefault: boolean;
}

const DEFAULT_FORM: AccountFormState = {
  name: '',
  type: 'savings',
  budget: '',
  isDefault: false,
};

const TYPE_ICONS: Record<FinancialAccountType, LucideIcon> = {
  savings: PiggyBank,
  bank: Wallet,
  'credit-card': CreditCard,
  cash: Wallet,
  wallet: Wallet,
  other: Wallet,
};

export function AccountsTab({ onOpenAccount, onBack, bannerAdActive = true }: AccountsTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const currency = useCurrency();
  const [accounts, setAccounts] = useState(() => getAccountSummaries());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useBackHandler(Boolean(selectedAccountId), () => setSelectedAccountId(null));
  useBackHandler(showForm, () => setShowForm(false));
  useBackHandler(!!deleteId, () => setDeleteId(null));

  useEffect(() => {
    const sync = () => setAccounts(getAccountSummaries());
    sync();
    window.addEventListener('splitmate_accounts_changed', sync);
    window.addEventListener('splitmate_data_changed', sync);
    return () => {
      window.removeEventListener('splitmate_accounts_changed', sync);
      window.removeEventListener('splitmate_data_changed', sync);
    };
  }, []);

  const openCreate = () => {
    if (!isPro && accounts.length >= FREE_LIMITS.MAX_ACCOUNTS) {
      requestProUpgrade('accounts', 'Free users can create up to 1 account. Upgrade to Pro for unlimited accounts.');
      return;
    }
    setForm({ ...DEFAULT_FORM, isDefault: getAccounts().length === 0 });
    setShowForm(true);
  };

  const openEdit = (account: FinancialAccount) => {
    setForm({
      id: account.id,
      name: account.name,
      type: account.type,
      budget: String(account.budget),
      isDefault: Boolean(account.isDefault),
    });
    setShowForm(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.budget);
    if (!form.name.trim() || !Number.isFinite(amount)) return;
    const isNew = !form.id;
    const accountId = form.id || generateId();

    const saved = saveAccount({
      id: accountId,
      name: form.name.trim(),
      type: form.type,
      budget: isNew ? 0 : amount,
      isDefault: form.isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!saved) return;

    if (isNew && amount > 0) {
      savePersonalExpense({
        id: generateId(),
        amount: amount,
        reason: `Initial Balance for ${form.name.trim()}`,
        category: 'other',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isIncome: true,
        isMirror: false,
        accountId: accountId
      });
    }

    setShowForm(false);
    setForm(DEFAULT_FORM);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteAccount(deleteId);
    setDeleteId(null);
  };

  const promptDeleteFromEdit = () => {
    const targetId = form.id;
    if (!targetId) return;

    setShowForm(false);
    // Let the edit sheet close first, then show delete confirmation.
    window.setTimeout(() => {
      setDeleteId(targetId);
    }, 180);
  };

  if (selectedAccountId) {
    return (
      <AccountTransactionsView
        accountId={selectedAccountId}
        onBack={() => setSelectedAccountId(null)}
      />
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col p-4 space-y-5 font-sans">
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
            <h1 className="text-2xl font-bold tracking-tight leading-none">Accounts</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80">Manage budgets and track source balances</p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-[2.5rem] border border-dashed border-border/20 p-10 text-center text-muted-foreground/60">
          Add your first account like Savings, Bank, or Credit Card.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account, index) => {
            const isLockedAccount = !isPro && index >= FREE_LIMITS.MAX_ACCOUNTS;
            const Icon = TYPE_ICONS[account.type] || Wallet;
            const typeLabel = FINANCIAL_ACCOUNT_TYPES.find((item) => item.value === account.type)?.label || 'Other';
            const totalPool = Math.max(0, account.budget + account.income);
            const spent = account.personalSpent + account.sharedSpent;
            const usageRatio = totalPool > 0 ? Math.min(1, Math.max(0, spent / totalPool)) : 0;
            const progressPercent = Math.round(usageRatio * 100);
            const isOverLimit = account.available < 0;
            const usageTone = isOverLimit
              ? 'red'
              : progressPercent <= 35
                ? 'green'
                : progressPercent <= 75
                  ? 'yellow'
                  : 'red';

            const progressFillStyle = isOverLimit
              ? {
                  width: '100%',
                  background: 'hsl(0 85% 56%)',
                }
              : {
                  width: `${progressPercent}%`,
                  background:
                    usageTone === 'green'
                      ? 'hsl(150 75% 42%)'
                      : usageTone === 'yellow'
                        ? 'hsl(48 92% 55%)'
                        : 'hsl(0 85% 56%)',
                };

            return (
              <div
                key={account.id}
                onClick={() => {
                  if (isLockedAccount) {
                    requestProUpgrade('accounts', 'Free users can create up to 1 account. Upgrade to Pro for unlimited accounts.');
                  } else {
                    setSelectedAccountId(account.id);
                  }
                }}
                className={cn(
                  "rounded-2xl border border-border/10 p-5 bg-card relative cursor-pointer active:scale-[0.99] transition-all hover:border-primary/20",
                  isLockedAccount && "opacity-40"
                )}
              >
                {isLockedAccount && (
                  <>
                    <div className="absolute top-4 right-4 z-30 w-7 h-7 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center">
                      <Lock size={13} className="text-white" />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        requestProUpgrade('accounts', 'Free users can create up to 1 account. Upgrade to Pro for unlimited accounts.');
                      }}
                      className="absolute inset-0 z-40 pointer-events-auto rounded-[2rem]"
                      aria-label="Upgrade to unlock this account"
                    />
                  </>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="font-bold text-base leading-none truncate">{account.name}</h3>
                        {account.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary shrink-0">
                            <Star size={10} className="fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 mt-1">{typeLabel}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(account);
                    }}
                    className="w-9 h-9 rounded-xl border border-border/10 bg-secondary/50 flex items-center justify-center active:scale-90"
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-black text-muted-foreground/50">Used</p>
                      <MoneyDisplay amount={-spent} className="text-sm font-black text-red-500" />
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider font-black text-muted-foreground/50">Available</p>
                      <MoneyDisplay
                        amount={account.available}
                        className={cn('text-sm font-black', account.available >= 0 ? 'text-emerald-500' : 'text-red-500')}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] uppercase tracking-wider font-black text-muted-foreground/50">Budget Usage</p>
                    <p
                      className={cn(
                        'text-[10px] font-black tracking-tight',
                        usageTone === 'green' ? 'text-emerald-500' : usageTone === 'yellow' ? 'text-yellow-500' : 'text-red-500',
                      )}
                    >
                      {isOverLimit ? 'Over Budget' : `${progressPercent}% Used`}
                    </p>
                  </div>
                  <div className="w-full h-4 rounded-full bg-secondary/40 border border-border/15 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', isOverLimit && 'animate-pulse')}
                      style={progressFillStyle}
                    />
                  </div>
                </div>

                <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-bold">
                  Income {currency.symbol}{account.income.toLocaleString(currency.locale)} · Personal {currency.symbol}{account.personalSpent.toLocaleString(currency.locale)} · Shared {currency.symbol}{account.sharedSpent.toLocaleString(currency.locale)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createPortal(
        <button
          type="button"
          onClick={openCreate}
          className={cn(
            'fixed right-4 z-[60] w-14 h-14 rounded-2xl bg-primary text-white shadow-2xl shadow-primary/30 flex items-center justify-center active:scale-90 transition-all',
            onBack ? 'bottom-10' : 'bottom-[160px]',
          )}
          aria-label="Add Account"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>,
        document.body,
      )}

      {showForm && createPortal(
        <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-sm flex items-end p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={submit}
            className="w-full max-w-md mx-auto rounded-[2.5rem] border border-border/10 bg-card p-6 space-y-5 animate-in slide-in-from-bottom-10 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black tracking-tight">{form.id ? 'Edit Account' : 'New Account'}</h2>
              {form.id && (
                <button
                  type="button"
                  onClick={promptDeleteFromEdit}
                  className="w-9 h-9 rounded-xl border border-destructive/20 text-destructive flex items-center justify-center active:scale-90 transition-all"
                  aria-label="Delete Account"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFC Bank, Cash Wallet"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="w-full h-12 rounded-2xl border border-border/15 bg-secondary/30 px-4 text-sm font-semibold focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Account Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {FINANCIAL_ACCOUNT_TYPES.map((typeOption) => {
                    const selected = form.type === typeOption.value;
                    const Icon = TYPE_ICONS[typeOption.value] || Wallet;
                    return (
                      <button
                        key={typeOption.value}
                        type="button"
                        onClick={() => setForm({ ...form, type: typeOption.value })}
                        className={cn(
                          'h-16 rounded-2xl border flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-all',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/15 bg-secondary/20 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon size={16} />
                        <span>{typeOption.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                  {form.id ? 'Budget Limit' : 'Initial Balance'}
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={form.budget}
                  onChange={(event) => setForm({ ...form, budget: event.target.value })}
                  className="w-full h-12 rounded-2xl border border-border/15 bg-secondary/30 px-4 text-sm font-semibold focus:outline-none focus:border-primary"
                />
              </div>

              <label className="flex items-center gap-3 p-3 rounded-2xl bg-secondary/20 border border-border/15 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                  className="w-4 h-4 rounded text-primary focus:ring-0 cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold">Set as Default Account</p>
                  <p className="text-[10px] text-muted-foreground">New expenses will automatically use this account</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 h-12 rounded-2xl border border-border/15 font-bold text-xs active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-2xl bg-primary text-white font-bold text-xs shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                {form.id ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {deleteId && createPortal(
        <div className="fixed inset-0 z-[10003] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div
            className="w-full max-w-xs rounded-[2rem] border border-border/10 bg-card p-6 space-y-4 text-center animate-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold">Delete Account?</h3>
              <p className="text-xs text-muted-foreground mt-1">This will remove this account. Transactions already made will stay intact.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="flex-1 h-11 rounded-2xl border border-border/15 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 h-11 rounded-2xl bg-destructive text-white font-bold text-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
