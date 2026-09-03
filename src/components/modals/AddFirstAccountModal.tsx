import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Wallet, Landmark, Banknote, CreditCard, Box, Check, Plus, ArrowRight, ShieldCheck } from 'lucide-react';
import { saveAccount, savePersonalExpense, generateId, getCurrency, type FinancialAccount, type FinancialAccountType } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AddFirstAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (account: FinancialAccount) => void;
  title?: string;
  subtitle?: string;
}

const ACCOUNT_TYPES: { type: FinancialAccountType; label: string; icon: string }[] = [
  { type: 'bank', label: 'Bank', icon: '🏦' },
  { type: 'savings', label: 'Savings', icon: '💰' },
  { type: 'cash', label: 'Cash', icon: '💵' },
  { type: 'credit-card', label: 'Credit Card', icon: '💳' },
  { type: 'wallet', label: 'Wallet', icon: '👛' },
  { type: 'other', label: 'Other', icon: '📦' },
];

const SUGGESTED_NAMES = ['Main Bank', 'Savings', 'Cash in Hand', 'Credit Card', 'Salary Account'];

export function AddFirstAccountModal({
  isOpen,
  onClose,
  onAccountCreated,
  title = "Add Your Account First",
  subtitle = "Before adding transactions, please set up your account and its starting balance.",
}: AddFirstAccountModalProps) {
  const { toast } = useToast();
  const currency = getCurrency();
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialAccountType>('bank');
  const [balance, setBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const accountName = name.trim();
    if (!accountName) {
      toast({
        title: "Account Name Required",
        description: "Please enter a name for your account.",
        variant: "destructive"
      });
      return;
    }

    const initialAmount = Number(balance) || 0;
    if (initialAmount < 0) {
      toast({
        title: "Invalid Balance",
        description: "Starting balance cannot be negative.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    const newAccount: FinancialAccount = {
      id: generateId(),
      name: accountName,
      type: type,
      budget: 0,
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = saveAccount(newAccount);

    if (!saved) {
      setIsSubmitting(false);
      return;
    }

    if (initialAmount > 0) {
      savePersonalExpense({
        id: generateId(),
        amount: initialAmount,
        reason: `Initial Balance for ${accountName}`,
        category: 'Other',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isIncome: true,
        isMirror: false,
        accountId: newAccount.id,
      });
    }

    window.dispatchEvent(new Event('splitmate_accounts_changed'));
    window.dispatchEvent(new Event('splitmate_data_changed'));

    toast({
      title: "Account Added!",
      description: `${accountName} set up with ${currency.symbol}${initialAmount.toLocaleString()}.`,
    });

    setIsSubmitting(false);
    onAccountCreated(newAccount);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card/95 border border-border/40 rounded-3xl p-6 shadow-2xl space-y-6 overflow-hidden relative">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto shadow-inner">
            <Landmark size={28} />
          </div>
          <h2 className="text-xl font-heading font-extrabold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed px-2">
            {subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Account Name */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-bold">
              Account Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Bank, Main Savings, Cash"
              className="w-full h-12 px-4 rounded-xl bg-secondary/40 border border-border/40 text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
            {/* Suggestions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTED_NAMES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setName(s)}
                  className="px-2.5 py-1 text-[10px] rounded-lg bg-secondary/60 hover:bg-secondary border border-border/20 text-muted-foreground hover:text-foreground transition-all"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Account Type */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-bold">
              Account Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map((item) => {
                const active = type === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setType(item.type)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all text-left",
                      active
                        ? "bg-primary/10 border-primary/50 text-primary shadow-sm"
                        : "bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current / Starting Balance */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground font-bold flex justify-between items-center">
              <span>Current Account Balance</span>
              <span className="text-[10px] text-primary lowercase font-sans">starting amount</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-muted-foreground font-bold text-base">
                {currency.symbol}
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className="w-full h-12 pl-9 pr-4 rounded-xl bg-secondary/40 border border-border/40 text-foreground text-sm font-semibold focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              How much money do you currently have in this account?
            </p>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-border/40 font-bold text-xs uppercase tracking-wider text-muted-foreground hover:bg-secondary/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md"
            >
              <span>Continue</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
