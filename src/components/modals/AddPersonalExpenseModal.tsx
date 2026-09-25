import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  savePersonalExpense, generateId, EXPENSE_CATEGORIES, getAccounts, getCurrency,
  getDefaultAccountId, getSuggestedReasons, saveSharedExpense, getUniquePersonNames,
  type PersonalExpense, type SharedExpense, type FinancialAccountType,
  saveTransactionAttachment, resizeImageToDataUrl
} from '@/lib/storage';
import {
  Tag, CalendarDays, ChevronLeft, Save, Plus, Image as ImageIcon, X,
  UserPlus, User, Check, ChevronDown, ChevronUp,
  PiggyBank, Wallet, CreditCard
} from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useBannerAd } from '@/hooks/useBannerAd';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';

interface AddPersonalExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
  initialIsIncome?: boolean;
}

// Account type → icon (matches AccountsTab)
const ACCOUNT_TYPE_ICONS: Record<FinancialAccountType, LucideIcon> = {
  savings: PiggyBank,
  bank: Wallet,
  'credit-card': CreditCard,
  cash: Wallet,
  wallet: Wallet,
  other: Wallet,
};

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

export function AddPersonalExpenseModal({ isOpen, onClose, onAdd, initialIsIncome = false }: AddPersonalExpenseModalProps) {
  const { toast } = useToast();
  useBannerAd(isOpen);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIncome, setIsIncome] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const accounts = getAccounts();

  // Person state
  const [personName, setPersonName] = useState('');
  const [showPersonInput, setShowPersonInput] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const personInputRef = useRef<HTMLInputElement>(null);

  // Recent people (from shared expenses, last used first)
  const recentPeople = useMemo(() => getUniquePersonNames(), []);
  const PEOPLE_VISIBLE = 2;
  const visiblePeople = showAllPeople ? recentPeople : recentPeople.slice(0, PEOPLE_VISIBLE);
  const hasMorePeople = recentPeople.length > PEOPLE_VISIBLE;

  const suggestions = useMemo(() => getSuggestedReasons('personal', isIncome), [isIncome]);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setReason('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
      setIsIncome(initialIsIncome);
      setAccountId(getDefaultAccountId() || getAccounts()[0]?.id || '');
      setAttachmentDataUrl(null);
      setShowAllCategories(false);
      setPersonName('');
      setShowPersonInput(false);
      setShowAllPeople(false);
    }
  }, [initialIsIncome, isOpen]);

  useEffect(() => {
    if (showPersonInput) {
      setTimeout(() => personInputRef.current?.focus(), 100);
    }
  }, [showPersonInput]);

  if (!isOpen) return null;

  if (accounts.length === 0) {
    return (
      <AddFirstAccountModal
        isOpen={isOpen}
        onClose={onClose}
        onAccountCreated={(createdAccount) => {
          setAccountId(createdAccount.id);
        }}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount)) return;
    setIsSubmitting(true);

    const trimmedPerson = personName.trim();

    if (trimmedPerson) {
      // With person: create only a SharedExpense — saveSharedExpense auto-mirrors
      // it into PersonalExpenses with the correct mirrorFromId for cascade deletes
      const sharedExpense: SharedExpense = {
        id: generateId(),
        amount: numAmount,
        reason: reason.trim() || (isIncome ? 'Income' : category),
        paidBy: isIncome ? trimmedPerson : 'me',
        forPerson: isIncome ? 'me' : trimmedPerson,
        personName: trimmedPerson,
        date,
        createdAt: new Date().toISOString(),
        settled: false,
        category: isIncome ? 'Income' : category,
        accountId: isIncome ? undefined : (accountId || undefined),
      };
      const saved = saveSharedExpense(sharedExpense);
      if (!saved) { setIsSubmitting(false); return; }
    } else {
      // No person: standalone personal expense
      const expense: PersonalExpense = {
        id: generateId(),
        amount: numAmount,
        reason: reason.trim() || (isIncome ? 'Income' : category),
        category: isIncome ? 'Income' : category,
        date,
        createdAt: new Date().toISOString(),
        accountId: accountId || undefined,
        isIncome,
      };

      if (attachmentDataUrl) {
        try {
          const attachId = await saveTransactionAttachment(attachmentDataUrl, expense.id);
          expense.attachmentId = attachId;
        } catch {
          toast({ title: 'Attachment Failed', description: 'Could not save the image.', variant: 'destructive' });
        }
      }

      const saved = savePersonalExpense(expense);
      if (!saved) { setIsSubmitting(false); return; }
    }

    const displayReason = reason.trim() || (isIncome ? 'Income' : category);
    toast({
      title: isIncome ? 'Income Logged' : 'Expense Logged',
      description: trimmedPerson
        ? `Added "${displayReason}" ${isIncome ? `from ${trimmedPerson}` : `to ${trimmedPerson}`}.`
        : `Added "${displayReason}".`,
    });

    setAmount('');
    setReason('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setDate(new Date().toISOString().split('T')[0]);
    setIsSubmitting(false);
    setIsIncome(false);
    setAttachmentDataUrl(null);
    setPersonName('');
    setShowPersonInput(false);
    setShowAllPeople(false);
    onAdd();
    onClose();
  };

  const formatDatePill = (dateStr: string) => {
    const [, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  };

  const VISIBLE_CATEGORIES = 2;
  const visibleCats = showAllCategories ? EXPENSE_CATEGORIES : EXPENSE_CATEGORIES.slice(0, VISIBLE_CATEGORIES);

  const catThemes: Record<string, { text: string; border: string; bg: string }> = {
    'Food & Dining': { text: 'text-orange-500', border: 'border-orange-500/40', bg: 'bg-orange-500/10' },
    Transportation: { text: 'text-blue-500', border: 'border-blue-500/40', bg: 'bg-blue-500/10' },
    Shopping: { text: 'text-pink-500', border: 'border-pink-500/40', bg: 'bg-pink-500/10' },
    Entertainment: { text: 'text-purple-500', border: 'border-purple-500/40', bg: 'bg-purple-500/10' },
    'Bills & Utilities': { text: 'text-cyan-500', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
    Healthcare: { text: 'text-rose-500', border: 'border-rose-500/40', bg: 'bg-rose-500/10' },
    Education: { text: 'text-indigo-500', border: 'border-indigo-500/40', bg: 'bg-indigo-500/10' },
    Travel: { text: 'text-sky-500', border: 'border-sky-500/40', bg: 'bg-sky-500/10' },
    Groceries: { text: 'text-emerald-500', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
    Other: { text: 'text-slate-500', border: 'border-slate-500/40', bg: 'bg-slate-500/10' },
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-background animate-in slide-in-from-bottom-10 duration-500 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-[1.5rem] bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
        >
          <ChevronLeft size={19} strokeWidth={2.5} />
        </button>
        <h1 className="text-lg font-black tracking-tight uppercase">{isIncome ? 'New Income' : 'New Expense'}</h1>
        {/* Date pill */}
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="relative flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/60 border border-border/15 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 active:scale-95 transition-all"
        >
          <CalendarDays size={11} className="text-muted-foreground/50" />
          {formatDatePill(date)}
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-24">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-lg mx-auto">
          {/* Amount Hero */}
          <div className="text-center py-2">
            <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mb-3">Entry Amount</label>
            <div className="relative inline-flex items-center justify-center">
              <span className="text-2xl font-black text-primary/40 mr-3">{getCurrency().symbol}</span>
              <input
                type="number"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={cn(
                  'bg-transparent border-none outline-none text-center font-black tracking-tighter transition-all placeholder:text-muted-foreground/10 text-5xl',
                  isIncome ? 'text-emerald-500' : 'text-foreground',
                )}
                step="0.01"
                min="0"
                required
                style={{ width: `${Math.max(120, amount.length * 40)}px` }}
              />
            </div>
          </div>

          <div className="space-y-4">
            {/* Type Toggle */}
            <div className="flex bg-secondary/30 p-1.5 rounded-[1.75rem] border border-border/5">
              <button
                type="button"
                onClick={() => setIsIncome(false)}
                className={cn(
                  'flex-1 py-2.5 px-6 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300',
                  !isIncome ? 'bg-primary text-white scale-100' : 'text-muted-foreground/40 scale-95',
                )}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setIsIncome(true)}
                className={cn(
                  'flex-1 py-2.5 px-6 rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300',
                  isIncome ? 'bg-emerald-500 text-white scale-100' : 'text-muted-foreground/40 scale-95',
                )}
              >
                Income
              </button>
            </div>

            {/* ── PEOPLE ROW ── */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-0.5">
                {isIncome ? 'Received From' : 'Paid To (Person)'}
              </label>

              {!showPersonInput ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Recent people quick-pick pills */}
                  {visiblePeople.map((name) => {
                    const isSelected = personName === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setPersonName(isSelected ? '' : name)}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95',
                          isSelected
                            ? isIncome
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                              : 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-secondary/25 border-border/10 text-muted-foreground/60 hover:border-border/25',
                        )}
                      >
                        <User size={10} />
                        {name}
                        {isSelected && (
                          <X
                            size={9}
                            className="ml-0.5 opacity-70"
                            onClick={(e) => { e.stopPropagation(); setPersonName(''); }}
                          />
                        )}
                      </button>
                    );
                  })}

                  {/* Expand / collapse if more than 2 */}
                  {hasMorePeople && (
                    <button
                      type="button"
                      onClick={() => setShowAllPeople((v) => !v)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-full border border-dashed border-border/20 bg-secondary/10 text-[9px] font-black text-muted-foreground/40 hover:bg-secondary/20 transition-all active:scale-95"
                    >
                      {showAllPeople ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {showAllPeople ? 'Less' : `+${recentPeople.length - PEOPLE_VISIBLE}`}
                    </button>
                  )}

                  {/* Add new person pill */}
                  <button
                    type="button"
                    onClick={() => setShowPersonInput(true)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95',
                      personName && !recentPeople.includes(personName)
                        ? isIncome
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                          : 'bg-primary/15 border-primary/30 text-primary'
                        : 'bg-secondary/20 border-dashed border-border/20 text-muted-foreground/50 hover:border-primary/25 hover:text-primary/60',
                    )}
                  >
                    <UserPlus size={10} />
                    {personName && !recentPeople.includes(personName) ? personName : 'Add'}
                    {personName && !recentPeople.includes(personName) && (
                      <X
                        size={9}
                        className="ml-0.5 opacity-70"
                        onClick={(e) => { e.stopPropagation(); setPersonName(''); }}
                      />
                    )}
                  </button>
                </div>
              ) : (
                /* Inline person input */
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <input
                      ref={personInputRef}
                      type="text"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); setShowPersonInput(false); }
                        if (e.key === 'Escape') { setShowPersonInput(false); }
                      }}
                      placeholder={isIncome ? 'Who paid you?' : 'Who did you pay?'}
                      className="w-full h-10 pl-9 pr-3 rounded-full text-[12px] font-bold bg-secondary/30 border border-border/10 focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-[9px] placeholder:font-black placeholder:tracking-widest placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPersonInput(false)}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0',
                      personName.trim()
                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                        : 'bg-secondary/60 text-muted-foreground/60',
                    )}
                  >
                    <Check size={15} strokeWidth={3} />
                  </button>
                </div>
              )}

              {personName.trim() && (
                <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest px-0.5">
                  {isIncome ? `${personName} gave you this amount` : `You paid this to ${personName}`}
                </p>
              )}
            </div>

            {/* ── ACCOUNTS ROW ── */}
            {accounts.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-0.5">
                  {isIncome ? 'Credited To Account' : 'Paid From Account'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {accounts.map((account) => {
                    const Icon = ACCOUNT_TYPE_ICONS[account.type as FinancialAccountType] || Wallet;
                    const isSelected = accountId === account.id;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setAccountId(account.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95',
                          isSelected
                            ? isIncome
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                              : 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-secondary/25 border-border/10 text-muted-foreground/60 hover:border-border/25',
                        )}
                      >
                        <Icon size={11} />
                        {account.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── REASON ── */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-0.5">
                {isIncome ? 'Source' : 'Reason'}
              </label>
              <div className="relative group">
                <Tag size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isIncome ? 'Where did this come from?' : 'What was this for?'}
                  className="w-full h-11 pl-11 pr-14 rounded-[1.75rem] text-[13px] font-bold bg-secondary/30 border focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-[9px] placeholder:font-black placeholder:tracking-widest placeholder:text-muted-foreground/60 outline-none"
                  style={{ borderColor: 'hsl(var(--foreground) / 0.14)' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Add proof / bill"
                  className={cn(
                    'absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90',
                    attachmentDataUrl
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary/60 text-muted-foreground/50 hover:text-primary hover:bg-primary/10',
                  )}
                >
                  <ImageIcon size={13} />
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const dataUrl = await resizeImageToDataUrl(file);
                        setAttachmentDataUrl(dataUrl);
                      } catch {
                        toast({ title: 'Error', description: 'Could not attach image', variant: 'destructive' });
                      }
                    }
                  }}
                />
              </div>

              {/* Attachment preview */}
              {attachmentDataUrl && (
                <div className="relative w-full h-14 rounded-[1rem] overflow-hidden border border-border/20 group mt-1">
                  <img src={attachmentDataUrl} alt="Attachment" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setAttachmentDataUrl(null)}
                      className="w-7 h-7 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-0.5 pt-0.5">
                  {suggestions.slice(0, 2).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReason(s)}
                      className={cn(
                        'px-2.5 py-1 rounded-xl bg-secondary/40 border border-border/5 text-[9px] font-black uppercase tracking-tight active:scale-95 transition-all text-muted-foreground/60',
                        isIncome
                          ? 'hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20'
                          : 'hover:bg-primary/10 hover:text-primary hover:border-primary/20',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── CATEGORY ── hidden for income */}
            {!isIncome && (
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] px-0.5">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {visibleCats.map((cat) => {
                    const isActive = category === cat;
                    const theme = catThemes[cat] || { text: 'text-primary', border: 'border-primary/40', bg: 'bg-primary/10' };
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-full border transition-all duration-200',
                          isActive
                            ? cn('border-2', theme.bg, theme.border)
                            : 'bg-secondary/20 border-border/10 hover:bg-secondary/30',
                        )}
                      >
                        <span className={cn('text-[11px] transition-transform', isActive ? 'scale-110' : 'scale-100')}>
                          {CATEGORY_EMOJIS[cat] || '📦'}
                        </span>
                        <span className={cn('text-[8px] font-bold uppercase tracking-wider leading-none', isActive ? theme.text : 'text-muted-foreground')}>
                          {cat}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setShowAllCategories((v) => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border/20 bg-secondary/10 text-[8px] font-black uppercase tracking-wider text-muted-foreground/50 hover:bg-secondary/30 transition-all active:scale-95"
                  >
                    {showAllCategories ? <><X size={8} />Less</> : <><Plus size={8} />More</>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !amount}
              className={cn(
                'h-14 w-full rounded-[2rem] text-white font-bold text-sm uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40',
                isIncome ? 'bg-emerald-600' : 'bg-blue-600',
              )}
            >
              {isSubmitting ? (
                'Processing...'
              ) : (
                <>
                  <Save size={17} />
                  {isIncome ? 'Save Income' : 'Add Expense'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
