import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Tag, Wallet, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveSharedExpense, generateId, getUniquePersonNames, EXPENSE_CATEGORIES, getAccounts, getCurrency, getDefaultAccountId, getSuggestedReasons, getSuggestedPersons, type SharedExpense } from '@/lib/storage';
import { pushUpdateToCloud } from '@/integrations/firebase/sync';
import { getPersonProfile, getAccountProfile, savePersonProfile } from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';

interface AddSharedExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
  initialAmount?: string;
  initialReason?: string;
  initialDate?: string;
  initialPersonName?: string;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  'Food & Dining': '🍕',
  'Transportation': '🚗',
  'Shopping': '🛍️',
  'Entertainment': '🎬',
  'Bills & Utilities': '📄',
  'Healthcare': '💊',
  'Education': '📚',
  'Travel': '✈️',
  'Groceries': '🛒',
  'Other': '📦',
};

export function AddSharedExpenseModal({ isOpen, onClose, onAdd, initialAmount, initialReason, initialDate, initialPersonName }: AddSharedExpenseModalProps) {
  useBannerAd(isOpen);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]); // Default to Food & Dining
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [paidBy, setPaidBy] = useState<'me' | 'them'>('me');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestions = useMemo(() => getSuggestedReasons('shared'), [isOpen]);
  const suggestedPersons = useMemo(() => getSuggestedPersons(), [isOpen]);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const existingNames = getUniquePersonNames();
  const accounts = useMemo(() => getAccounts(), [isOpen]);
  const currency = getCurrency();

  useEffect(() => {
    if (isOpen) {
      if (initialAmount) setAmount(initialAmount);
      else setAmount('');
      if (initialReason) setReason(initialReason);
      else setReason('');
      if (initialDate) setDate(initialDate);
      else setDate(new Date().toISOString().split('T')[0]);

      // Also reset shared-specific fields
      setPersonName(initialPersonName || '');
      setPersonEmail('');
      setPaidBy('me');
      setAccountId(getDefaultAccountId() || getAccounts()[0]?.id || '');
      setCategory(EXPENSE_CATEGORIES[0]);

      if (amountRef.current) {
        setTimeout(() => amountRef.current?.focus(), 100);
      }
    }
  }, [isOpen, initialAmount, initialReason, initialDate, initialPersonName]);

  useEffect(() => {
    if (personName.trim()) {
      const profile = getPersonProfile(personName.trim());
      if (profile && profile.email) {
        setPersonEmail(profile.email);
      }
    }
  }, [personName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalAmount = parseFloat(amount);

    // Standard 1:1 Logic
    const expense: SharedExpense = {
      id: generateId(),
      amount: totalAmount,
      reason: reason.trim() || category || 'Shared expense',
      paidBy: paidBy === 'me' ? 'me' : personName.trim(),
      forPerson: paidBy === 'me' ? personName.trim() : 'me',
      personName: personName.trim(),
      date,
      createdAt: new Date().toISOString(),
      settled: false,
      category: category || undefined,
      accountId: paidBy === 'me' ? (accountId || undefined) : undefined,

      // 🔥 IMPORTANT
      fromEmail: getAccountProfile().email,
    };

    // Update the profile's email immediately if provided, so the sync can use it
    if (personEmail.trim()) {
      const existing = getPersonProfile(personName.trim()) || { name: personName.trim() };
      const profileSaved = savePersonProfile({
        ...existing,
        email: personEmail.trim()
      });
      if (!profileSaved) {
        setIsSubmitting(false);
        return;
      }
    }

    const expenseSaved = saveSharedExpense(expense);
    if (!expenseSaved) {
      setIsSubmitting(false);
      return;
    }

    // 🔥 PUSH TO CLOUD (IMPORTANT)
    let person = getPersonProfile(personName.trim());

    // 🔥 HARD REFRESH FROM STORAGE
    const allPersons = JSON.parse(localStorage.getItem("splitmate_persons") || "[]");

    const latest = allPersons.find(
      (p: any) => p.name === personName.trim()
    );

    if (latest) {
      person = latest;
    }
    const myProfile = getAccountProfile();

    if (person?.email && myProfile?.email) {
      pushUpdateToCloud(
        {
          type: "added",
          expense: {
            ...expense,
            fromEmail: expense.fromEmail // 🔥 ensure it stays
          }
        },
        person.email
      );
    } else {
      if (!person?.email) console.warn("❌ No person email → sync skipped");
      if (!myProfile?.email) console.warn("❌ No account email → sync skipped");
    }

    setAmount('');
    setReason('');
    setCategory('');
    setPersonName('');
    setPersonEmail('');
    setPaidBy('me');
    setDate(new Date().toISOString().split('T')[0]);
    setIsSubmitting(false);
    onAdd();
    onClose();
  };

  const summaryText = amount && personName
    ? paidBy === 'me'
      ? `${personName} owes you ${currency.symbol}${parseFloat(amount).toLocaleString(currency.locale)}`
      : `You owe ${personName} ${currency.symbol}${parseFloat(amount).toLocaleString(currency.locale)}`
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-background animate-in slide-in-from-bottom-10 duration-500 font-sans">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 rounded-[1.25rem] bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <h1 className="text-lg font-black tracking-tight uppercase absolute left-1/2 -translate-x-1/2">Shared Expense</h1>
        <div className="w-11" />
      </div>

      {/* Scrollable content */}
      <form ref={formRef} onSubmit={handleSubmit} className="flex-1 overflow-y-auto pb-10">
        <div className="px-5 py-6 space-y-6 max-w-lg mx-auto w-full">
          {/* Amount - hero */}
          <div className="text-center pt-2 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              How much?
            </p>
            <div className="inline-flex items-baseline gap-1">
              <span className="text-3xl font-bold text-muted-foreground/50">{currency.symbol}</span>
              <input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-5xl font-extrabold bg-transparent border-none outline-none text-center text-foreground w-48 placeholder:text-muted-foreground/45"
                style={{ caretColor: 'hsl(var(--primary))' }}
                step="0.01"
                min="0"
                required
              />
            </div>
            <div className="w-20 h-[3px] rounded-full mx-auto mt-3" style={{
              background: amount
                ? 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                : 'hsl(var(--border) / 0.5)',
              transition: 'background 0.3s ease',
            }} />
          </div>

          {/* With whom / Who paid section */}
          <div className="space-y-4">
            {!initialPersonName && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block opacity-40 whitespace-nowrap">
                    Splitting with?
                  </label>
                  {suggestedPersons.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5 overflow-x-auto no-scrollbar">
                       {suggestedPersons.map(p => (
                         <button 
                            key={p} 
                            type="button" 
                            onClick={() => setPersonName(p)}
                            className="px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-[9px] font-black text-primary uppercase active:scale-95 transition-all whitespace-nowrap"
                         >
                            {p}
                         </button>
                       ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[1.25rem] flex items-center justify-center bg-primary/10">
                    <User size={16} className="text-primary" />
                  </div>
                  <input
                    type="text"
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="Friend's name..."
                    className="w-full pl-14 pr-4 rounded-[1.5rem] text-sm font-black tracking-tight bg-card/50 outline-none transition-all"
                    style={{ height: '52px', border: '1px solid hsl(var(--border) / 0.3)' }}
                    required
                  />
                </div>

                <div className="relative mt-2">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[1.25rem] flex items-center justify-center bg-primary/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </div>
                  <input
                    type="email"
                    value={personEmail}
                    onChange={(e) => setPersonEmail(e.target.value)}
                    placeholder="Their email to enable sync (optional)"
                    className="w-full pl-14 pr-4 rounded-[1.5rem] text-sm font-medium tracking-tight bg-card/50 outline-none transition-all"
                    style={{ height: '52px', border: '1px solid hsl(var(--border) / 0.3)' }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaidBy('me')}
                  className={cn(
                    "h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    paidBy === 'me' ? "bg-primary text-white border-transparent shadow-lg shadow-primary/20" : "bg-secondary/10 border-transparent text-muted-foreground/30"
                  )}
                >
                  I Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPaidBy('them')}
                  className={cn(
                    "h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    paidBy === 'them' ? "bg-primary text-white border-transparent shadow-lg shadow-primary/20" : "bg-secondary/10 border-transparent text-muted-foreground/30"
                  )}
                >
                  {personName || 'They'} Paid
                </button>
              </div>

              {accounts.length > 0 && paidBy === 'me' && (
                <div className="space-y-2.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block opacity-40">
                    Paid From Account
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setAccountId(account.id)}
                        className={cn(
                          'px-5 py-3 rounded-[1.45rem] text-[12px] font-black uppercase tracking-wider transition-all border',
                          accountId === account.id
                            ? 'bg-primary/15 text-primary border-primary/25'
                            : 'bg-card/60 text-muted-foreground border-border/20',
                        )}
                      >
                        {account.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Note & Date */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-3 space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block opacity-40">Reason</label>
              <div className="relative">
                <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={category || "What for?"}
                  className="w-full pl-10 pr-4 h-12 rounded-[1.5rem] text-sm bg-card/50 outline-none transition-all font-medium"
                  style={{ border: '1px solid hsl(var(--border) / 0.3)' }} />
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block opacity-40">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full h-12 px-3 rounded-[1.5rem] text-sm bg-card/50 outline-none transition-all font-medium"
                style={{ border: '1px solid hsl(var(--border) / 0.3)' }} required />
            </div>
          </div>

          {/* Suggestion Pills */}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1 -mt-2">
              {suggestions.slice(0, 3).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setReason(s)}
                  className="px-3.5 py-2 rounded-xl bg-secondary/50 border border-border/5 text-[9px] font-black uppercase tracking-tight text-muted-foreground/50 hover:bg-primary/10 hover:text-primary hover:border-primary/20 active:scale-95 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Category */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block opacity-40">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button key={cat} type="button" onClick={() => setCategory(active ? '' : cat)}
                    className="px-3.5 py-2.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all duration-150 flex items-center gap-1.5"
                    style={{
                      background: active ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--card) / 0.6)',
                      color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      border: `1px solid ${active ? 'hsl(var(--primary) / 0.25)' : 'hsl(var(--border) / 0.2)'}`,
                    }}>
                    <span>{CATEGORY_EMOJIS[cat] || '📦'}</span> {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Summary */}
          {summaryText && (
            <div className="rounded-[1.5rem] p-4 flex items-center gap-3 animate-in zoom-in-95 duration-200"
              style={{
                background: paidBy === 'me' ? 'hsl(var(--success) / 0.07)' : 'hsl(var(--warning) / 0.07)',
                border: `1px solid ${paidBy === 'me' ? 'hsl(var(--success) / 0.12)' : 'hsl(var(--warning) / 0.12)'}`,
              }}>
              <Wallet size={16} className={paidBy === 'me' ? 'text-success' : 'text-warning'} />
              <div>
                <p className="text-sm font-black uppercase italic italic tracking-tight">{summaryText}</p>
                {(category || reason) && (
                  <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mt-0.5">{reason || category}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Fixed bottom action */}
      <div className="flex-shrink-0 px-5 pb-16 pt-3 bg-background/80 backdrop-blur-lg border-t border-border/10">
        <div className="flex gap-3 max-w-lg mx-auto w-full">
          <button type="button" onClick={onClose}
            className="flex-1 h-14 rounded-2xl bg-secondary/50 text-foreground font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95"
            disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="flex-[1.5] h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 disabled:opacity-40 active:scale-95 transition-all"
            disabled={isSubmitting || !amount || !personName.trim()}>
            {isSubmitting ? 'Adding...' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
