import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '@/hooks/useBackHandler';
import {
  ChevronLeft,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  PiggyBank,
  CreditCard,
  Star,
  ReceiptText,
  Calendar,
  Tag,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import {
  getAccountSummaries,
  getPersonalExpenses,
  getSharedExpenses,
  type FinancialAccountSummary,
  type FinancialAccountType,
} from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';

const TYPE_ICONS: Record<FinancialAccountType, LucideIcon> = {
  savings: PiggyBank,
  bank: Wallet,
  'credit-card': CreditCard,
  cash: Wallet,
  wallet: Wallet,
  other: Wallet,
};

export interface AccountTransactionRecord {
  id: string;
  title: string;
  category: string;
  amount: number;
  isIncome: boolean;
  date: string;
  createdAt: string;
  sourceType: 'personal' | 'shared';
  sourceId: string;
  subtitle: string;
  isMirror?: boolean;
}

interface AccountTransactionsViewProps {
  accountId: string;
  onBack: () => void;
}

function fetchAccountTransactions(accountId: string): AccountTransactionRecord[] {
  const personal = getPersonalExpenses()
    .filter((e) => e.accountId === accountId)
    .map<AccountTransactionRecord>((e) => ({
      id: `p-${e.id}`,
      title: e.reason || 'Personal Transaction',
      category: e.category || 'General',
      amount: Math.abs(Number(e.amount || 0)),
      isIncome: Boolean(e.isIncome),
      date: e.date,
      createdAt: e.createdAt || e.date,
      sourceType: 'personal',
      sourceId: e.id,
      subtitle: e.category || 'Personal',
      isMirror: e.isMirror,
    }));

  const shared = getSharedExpenses()
    .filter((e) => e.accountId === accountId)
    .map<AccountTransactionRecord>((e) => {
      const isMe = e.paidBy === 'me';
      return {
        id: `s-${e.id}`,
        title: e.reason || 'Shared Transaction',
        category: e.groupId ? 'Group' : e.personName || 'Shared',
        amount: Math.abs(Number(e.amount || 0)),
        isIncome: !isMe,
        date: e.date,
        createdAt: e.createdAt || e.date,
        sourceType: 'shared',
        sourceId: e.id,
        subtitle: e.groupId ? 'Group Expense' : e.personName ? `With ${e.personName}` : 'Shared',
      };
    });

  return [...personal, ...shared].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.date).getTime();
    const bTime = new Date(b.createdAt || b.date).getTime();
    return bTime - aTime;
  });
}

export function AccountTransactionsView({ accountId, onBack }: AccountTransactionsViewProps) {
  const currency = useCurrency();
  const [selectedTx, setSelectedTx] = useState<AccountTransactionRecord | null>(null);
  const [account, setAccount] = useState<FinancialAccountSummary | null>(() => {
    return getAccountSummaries().find((a) => a.id === accountId) || null;
  });
  const [transactions, setTransactions] = useState<AccountTransactionRecord[]>(() => {
    return fetchAccountTransactions(accountId);
  });

  useBackHandler(Boolean(selectedTx), () => setSelectedTx(null));

  // Synchronize whenever transactions or accounts change in storage
  useEffect(() => {
    const handleSync = () => {
      setAccount(getAccountSummaries().find((a) => a.id === accountId) || null);
      setTransactions(fetchAccountTransactions(accountId));
    };
    handleSync();
    window.addEventListener('splitmate_data_changed', handleSync);
    window.addEventListener('splitmate_accounts_changed', handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener('splitmate_data_changed', handleSync);
      window.removeEventListener('splitmate_accounts_changed', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [accountId]);

  if (!account) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground font-semibold">Account not found.</p>
        <button
          onClick={onBack}
          className="mt-4 px-5 py-2 rounded-2xl bg-secondary text-foreground font-bold active:scale-95 transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  const Icon = TYPE_ICONS[account.type] || Wallet;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    let d: Date;
    if (parts.length === 3 && parts[0].length === 4) {
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  };

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md px-4 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-border/10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all shrink-0"
            aria-label="Back to accounts"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black leading-tight tracking-tight text-foreground truncate">
                {account.name}
              </h1>
              {account.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary shrink-0">
                  <Star size={10} className="fill-current" />
                  Default
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">
              {account.type} Account Transactions
            </p>
          </div>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
      </div>

      <div className="px-4 pt-3 space-y-4 flex-1">
        {/* Account Balance Overview Card */}
        <div
          className="relative p-5 overflow-hidden rounded-2xl border border-border/15 bg-card"
          style={{
            boxShadow: '0 2px 14px -3px hsl(var(--glass-shadow) / 0.4), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
              Available Balance
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground/60">
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
            </span>
          </div>

          <p
            className={cn(
              'text-3xl font-black tracking-tight mb-4',
              account.available >= 0 ? 'text-emerald-500' : 'text-red-500'
            )}
          >
            <MoneyDisplay amount={account.available} />
          </p>

          <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-border/10">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/15 p-2.5">
              <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <ArrowDownRight size={13} strokeWidth={2.5} />
                <span>Inflow / Income</span>
              </div>
              <p className="text-sm font-black text-emerald-500">
                +<MoneyDisplay amount={account.income} />
              </p>
            </div>

            <div className="rounded-lg bg-rose-500/10 border border-rose-500/15 p-2.5">
              <div className="flex items-center gap-1 text-rose-500 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <ArrowUpRight size={13} strokeWidth={2.5} />
                <span>Outflow / Spent</span>
              </div>
              <p className="text-sm font-black text-rose-500">
                -<MoneyDisplay amount={account.personalSpent + account.sharedSpent} />
              </p>
            </div>
          </div>
        </div>

        {/* Informative Synchronized Sync Banner */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-secondary/30 border border-border/10 text-muted-foreground text-[11px] font-medium leading-tight">
          <Info size={14} className="text-primary shrink-0" />
          <span>
            Showing transactions linked to this account. Transactions removed from Transactions or Personal tabs update automatically here.
          </span>
        </div>

        {/* Transactions List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              Account History
            </h2>
          </div>

          {transactions.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-border/20 bg-secondary/10 flex flex-col items-center justify-center p-6">
              <div className="w-11 h-11 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground/60 mb-2.5">
                <ReceiptText size={22} />
              </div>
              <h3 className="font-bold text-sm text-foreground mb-1">No transactions yet</h3>
              <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
                Transactions paid or received using {account.name} will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="px-4 py-3 rounded-xl bg-card border border-border/15 flex items-center justify-between gap-3 active:scale-[0.99] hover:border-border/30 transition-all cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        tx.isIncome
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      )}
                    >
                      {tx.isIncome ? (
                        <ArrowDownRight size={16} strokeWidth={2.5} />
                      ) : (
                        <ArrowUpRight size={16} strokeWidth={2.5} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground truncate leading-tight">
                        {tx.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{tx.subtitle}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>{formatDate(tx.date)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        'text-sm font-black tabular-nums tracking-tight',
                        tx.isIncome ? 'text-emerald-500' : 'text-rose-500'
                      )}
                    >
                      {tx.isIncome ? '+' : '-'}
                      {currency.symbol}
                      {tx.amount.toLocaleString(currency.locale, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction Details Modal (Read-Only Portal over bottom nav) */}
      {selectedTx && createPortal(
        <div
          className="fixed inset-0 z-[10003] bg-black/65 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-auto"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border/20 p-5 space-y-4 animate-in slide-in-from-bottom duration-200 shadow-2xl relative"
            style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1.25rem))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted/30 rounded-full mx-auto -mt-1 mb-1 sm:hidden" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ReceiptText size={18} className="text-primary" />
                <h3 className="font-black text-lg">Transaction Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 active:scale-95 transition-all"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-secondary/20 border border-border/10 text-center space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount</p>
              <p
                className={cn(
                  'text-3xl font-black tracking-tight',
                  selectedTx.isIncome ? 'text-emerald-500' : 'text-rose-500'
                )}
              >
                {selectedTx.isIncome ? '+' : '-'}
                {currency.symbol}
                {selectedTx.amount.toLocaleString(currency.locale)}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/5">
                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
                  <Tag size={14} /> Description
                </span>
                <span className="font-bold text-foreground text-right truncate max-w-[200px]">
                  {selectedTx.title}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/5">
                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
                  <Calendar size={14} /> Date
                </span>
                <span className="font-bold text-foreground">{formatDate(selectedTx.date)}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/15 border border-border/5">
                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-2">
                  <Wallet size={14} /> Account
                </span>
                <span className="font-bold text-foreground">{account.name}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-secondary/10 border border-dashed border-border/20 text-center">
              <p className="text-[11px] text-muted-foreground font-medium">
                This is a read-only account entry. To remove or edit this transaction, manage it in the Transactions or Personal tab.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
