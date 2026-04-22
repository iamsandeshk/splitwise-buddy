import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CreditCard, Pencil, PiggyBank, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import {
  FINANCIAL_ACCOUNT_TYPES,
  deleteAccount,
  getAccountSummaries,
  getAccounts,
  saveAccount,
  type FinancialAccount,
  type FinancialAccountType,
} from '@/lib/storage';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';

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

const TYPE_ICONS: Record<FinancialAccountType, any> = {
  savings: PiggyBank,
  bank: Wallet,
  'credit-card': CreditCard,
  cash: Wallet,
  wallet: Wallet,
  other: Wallet,
};

export function AccountsTab({ onOpenAccount, onBack, bannerAdActive = true }: AccountsTabProps) {
  useBannerAd(bannerAdActive);
  const currency = useCurrency();
  const [accounts, setAccounts] = useState(() => getAccountSummaries());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AccountFormState>(DEFAULT_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

    const saved = saveAccount({
      id: form.id || '',
      name: form.name.trim(),
      type: form.type,
      budget: amount,
      isDefault: form.isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!saved) return;

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

  return (
    <div className="p-4 pb-40 space-y-5 font-sans">
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
        <AccountQuickButton onClick={onOpenAccount} />
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-[2.5rem] border border-dashed border-border/20 p-10 text-center text-muted-foreground/60">
          Add your first account like Savings, Bank, or Credit Card.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
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
              <div key={account.id} className="rounded-[2rem] border border-border/10 p-5 bg-card">
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
                    onClick={() => openEdit(account)}
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
                  className="w-9 h-9 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive flex items-center justify-center active:scale-90"
                  aria-label="Delete account"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Account Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Savings, Main Bank, Credit Card"
                className="w-full h-12 rounded-2xl border border-border/10 bg-secondary/20 px-4 text-sm font-bold outline-none"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Account Type</label>
              <div className="grid grid-cols-2 gap-2">
                {FINANCIAL_ACCOUNT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, type: type.value }))}
                    className={cn(
                      'h-10 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all',
                      form.type === type.value
                        ? 'bg-primary/15 text-primary border-primary/25'
                        : 'bg-secondary/20 text-muted-foreground border-border/10',
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Fixed Budget</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 font-bold">{currency.symbol}</span>
                <input
                  type="number"
                  value={form.budget}
                  onChange={(event) => setForm((prev) => ({ ...prev, budget: event.target.value }))}
                  placeholder="0"
                  step="0.01"
                  className="w-full h-12 rounded-2xl border border-border/10 bg-secondary/20 pl-10 pr-4 text-sm font-bold outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Default Account</label>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, isDefault: !prev.isDefault }))}
                className={cn(
                  'w-full h-11 rounded-2xl border text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2',
                  form.isDefault
                    ? 'bg-primary/15 text-primary border-primary/25'
                    : 'bg-secondary/20 text-muted-foreground border-border/10',
                )}
              >
                <Star size={12} className={cn(form.isDefault && 'fill-current')} />
                {form.isDefault ? 'Marked As Default' : 'Mark As Default'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-11 rounded-2xl border border-border/10 bg-secondary/40 text-[10px] font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-11 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider"
              >
                Save
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {deleteId && createPortal(
        <div className="fixed inset-0 z-[10003] bg-black/60 backdrop-blur-sm flex items-end p-4" onClick={() => setDeleteId(null)}>
          <div
            className="w-full max-w-md mx-auto rounded-[2.5rem] border border-border/10 bg-card p-6 space-y-4 animate-in slide-in-from-bottom-10 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-black">Delete Account?</h3>
            <p className="text-sm text-muted-foreground">This removes the account profile. Your past transactions will remain unchanged.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="h-11 rounded-2xl border border-border/10 bg-secondary/40 text-[10px] font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-11 rounded-2xl bg-destructive text-white text-[10px] font-black uppercase tracking-wider"
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
