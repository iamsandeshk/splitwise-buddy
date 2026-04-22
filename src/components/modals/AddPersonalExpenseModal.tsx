import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { savePersonalExpense, generateId, EXPENSE_CATEGORIES, getAccounts, getCurrency, getDefaultAccountId, getSuggestedReasons, type PersonalExpense } from '@/lib/storage';
import { Receipt, Tag, CalendarDays, ChevronLeft, ArrowRight, Save, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useBannerAd } from '@/hooks/useBannerAd';

interface AddPersonalExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  'Food & Dining': '🍕',
  Transportation: '🚗',
  Shopping: '🛍️',
  Entertainment: '🎬',
  'Bills & Utilities': '📄',
  Healthcare: '💊',
  Education: '📚',
  Travel: '✈️',
  Groceries: '🛒',
  Other: '📦',
};

export function AddPersonalExpenseModal({ isOpen, onClose, onAdd }: AddPersonalExpenseModalProps) {
  const { toast } = useToast();
  useBannerAd(isOpen);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIncome, setIsIncome] = useState(false);
  const [accountId, setAccountId] = useState('');
  const accounts = useMemo(() => getAccounts(), [isOpen]);

  const suggestions = useMemo(() => getSuggestedReasons('personal', isIncome), [isOpen, isIncome]);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReason('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
      setIsIncome(false);
      setAccountId(getDefaultAccountId() || getAccounts()[0]?.id || '');
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount)) return;
    
    setIsSubmitting(true);
    
    const expense: PersonalExpense = {
      id: generateId(),
      amount: numAmount,
      reason: reason.trim() || (isIncome ? "Miscellaneous Income" : "Miscellaneous Expense"),
      category: isIncome ? "Income" : category,
      date,
      createdAt: new Date().toISOString(),
      accountId: accountId || undefined,
      isIncome
    };
    
    const saved = savePersonalExpense(expense);
    if (!saved) {
      setIsSubmitting(false);
      return;
    }
    
    toast({
       title: isIncome ? "Income Logged" : "Expense Logged",
       description: `Added "${expense.reason}" to ${expense.category}.`
    });

    setAmount('');
    setReason('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setDate(new Date().toISOString().split('T')[0]);
    setIsSubmitting(false);
    setIsIncome(false);
    
    onAdd();
    onClose();
  };
  
  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-background animate-in slide-in-from-bottom-10 duration-500 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <button 
          type="button" 
          onClick={onClose} 
          className="w-11 h-11 rounded-[1.5rem] bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <h1 className="text-lg font-black tracking-tight uppercase">{isIncome ? 'New Income' : 'New Expense'}</h1>
        <div className="w-11" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        <form onSubmit={handleSubmit} className="space-y-8 max-w-lg mx-auto">
          {/* Amount Hero Section */}
          <div className="text-center py-4">
            <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mb-4">Entry Amount</label>
            <div className="relative inline-flex items-center justify-center">
              <span className="text-2xl font-black text-primary/40 mr-3">{getCurrency().symbol}</span>
              <input
                type="number"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={cn(
                  "bg-transparent border-none outline-none text-center font-black tracking-tighter transition-all placeholder:text-muted-foreground/10 text-5xl",
                  isIncome ? "text-emerald-500" : "text-foreground"
                )}
                step="0.01"
                min="0"
                required
                style={{ width: `${Math.max(120, amount.length * 40)}px` }}
              />
            </div>
          </div>

          <div className="space-y-6">
            {/* Type Toggle */}
            <div className="flex bg-secondary/30 p-1.5 rounded-[1.75rem] border border-border/5">
              <button 
                type="button"
                onClick={() => setIsIncome(false)}
                className={cn(
                  "flex-1 py-3 px-6 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300",
                  !isIncome ? "bg-primary text-white shadow-xl shadow-primary/20 scale-100" : "text-muted-foreground/40 hover:text-muted-foreground/60 scale-95"
                )}
              >
                Expense
              </button>
              <button 
                type="button"
                onClick={() => setIsIncome(true)}
                className={cn(
                  "flex-1 py-3 px-6 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300",
                  isIncome ? "bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 scale-100" : "text-muted-foreground/40 hover:text-muted-foreground/60 scale-95"
                )}
              >
                Income
              </button>
            </div>

            {accounts.length > 0 && (
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">
                  {isIncome ? 'Credited To Account' : 'Paid From Account'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setAccountId(account.id)}
                      className={cn(
                        'px-5 py-3 rounded-[1.1rem] border text-[12px] font-black uppercase tracking-wider transition-all',
                        accountId === account.id
                          ? isIncome
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                            : 'bg-primary/15 border-primary/30 text-primary'
                          : 'bg-secondary/30 border-border/10 text-muted-foreground/60',
                      )}
                    >
                      {account.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">
                {isIncome ? 'Source' : 'Purpose'}
              </label>
              <div className="relative group">
                <Tag size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isIncome ? "Where did this come from?" : "What was this for?"}
                  className="w-full h-14 pl-12 pr-6 rounded-[1.75rem] text-[14px] font-bold bg-secondary/30 border focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-[10px] placeholder:font-black placeholder:tracking-widest placeholder:text-muted-foreground/60"
                  style={{ borderColor: 'hsl(var(--foreground) / 0.14)' }}
                />
              </div>

              {/* Suggestions Pills */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1 pt-1">
                  {suggestions.slice(0, 3).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReason(s)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl bg-secondary/40 border border-border/5 text-[10px] font-black uppercase tracking-tight active:scale-95 transition-all text-muted-foreground/60",
                        isIncome ? "hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20" : "hover:bg-primary/10 hover:text-primary hover:border-primary/20"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category Pillars - HIDDEN FOR INCOME */}
            {!isIncome && (
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">Internal Ledger Category</label>
                <div className="flex flex-wrap gap-2.5">
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const isActive = category === cat;
                    const catThemes: Record<string, { text: string, border: string, bg: string }> = {
                      'Food & Dining': { text: 'text-orange-500', border: 'border-orange-500/40', bg: 'bg-orange-500/10' },
                      'Transportation': { text: 'text-blue-500', border: 'border-blue-500/40', bg: 'bg-blue-500/10' },
                      'Shopping': { text: 'text-pink-500', border: 'border-pink-500/40', bg: 'bg-pink-500/10' },
                      'Entertainment': { text: 'text-purple-500', border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
                      'Bills & Utilities': { text: 'text-cyan-500', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
                      'Healthcare': { text: 'text-rose-500', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
                      'Education': { text: 'text-indigo-500', border: 'border-indigo-500/40', bg: 'bg-indigo-500/10' },
                      'Travel': { text: 'text-sky-500', border: 'border-sky-500/40', bg: 'bg-sky-500/10' },
                      'Groceries': { text: 'text-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
                      'Other': { text: 'text-slate-500', border: 'border-slate-500/40', bg: 'bg-slate-500/10' },
                    };
                    const theme = catThemes[cat] || { text: 'text-primary', border: 'border-primary/40', bg: 'bg-primary/10' };

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-300 border backdrop-blur-sm",
                          isActive 
                            ? cn("scale-105 z-10 border-2", theme.bg, theme.border) 
                            : "bg-secondary/20 border-border/10 hover:bg-secondary/30"
                        )}
                      >
                        <span className={cn("text-base transition-transform duration-500", isActive ? "scale-110 rotate-3" : "scale-100")}>
                          {CATEGORY_EMOJIS[cat] || '📦'}
                        </span>
                        <span className={cn("text-[9px] font-bold uppercase tracking-wider leading-none", isActive ? theme.text : "text-muted-foreground")}>
                          {cat}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date Selection */}
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-1">Effective Date</label>
              <div className="relative">
                <CalendarDays size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-14 pl-12 pr-6 rounded-[1.5rem] text-[14px] font-bold bg-secondary/30 border-0 focus:ring-2 focus:ring-primary/20 transition-all uppercase"
                  required
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={isSubmitting || !amount}
              className={cn(
                "h-16 flex-1 rounded-[2rem] text-white font-bold text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40",
                isIncome ? "bg-emerald-600 shadow-emerald-500/30" : "bg-blue-600 shadow-blue-500/30"
              )}
            >
              {isSubmitting ? (
                'Processing...'
              ) : (
                <>
                  <Save size={18} />
                  {isIncome ? 'Save Income' : 'Add Expense'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
