import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Tag, Wallet, ChevronLeft, Image as ImageIcon, X, CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { saveSharedExpense, generateId, getUniquePersonNames, EXPENSE_CATEGORIES, getAccounts, getCurrency, getDefaultAccountId, getSuggestedReasons, getSuggestedPersons, type SharedExpense, saveTransactionAttachment, resizeImageToDataUrl } from '@/lib/storage';
import { pushUpdateToCloud } from '@/integrations/firebase/sync';
import { getPersonProfile, getAccountProfile, savePersonProfile } from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';
import { AddFirstAccountModal } from '@/components/modals/AddFirstAccountModal';

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
  const { toast } = useToast();
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
  const suggestions = getSuggestedReasons('shared');
  const suggestedPersons = getSuggestedPersons();
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | null>(null);

  const existingNames = getUniquePersonNames();
  const accounts = getAccounts();
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
      setAttachmentDataUrl(null);
      setShowAllCategories(false);

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
    
    if (attachmentDataUrl) {
      try {
        const attachId = await saveTransactionAttachment(attachmentDataUrl, expense.id);
        expense.attachmentId = attachId;
      } catch (err) {
        toast({ title: 'Attachment Failed', description: 'Could not save the image.', variant: 'destructive' });
      }
    }

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
      (p: { name: string; email?: string }) => p.name === personName.trim()
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
    setAttachmentDataUrl(null);
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
        {/* Date pill — top right */}
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="relative flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/60 border border-border/15 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 hover:bg-secondary active:scale-95 transition-all"
        >
          <CalendarDays size={11} className="text-muted-foreground/50" />
          {(() => { const [,m,d] = date.split('-'); return `${d}/${m}`; })()}
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
                    paidBy === 'me' ? "bg-primary text-white border-transparent" : "bg-secondary/10 border-transparent text-muted-foreground/30"
                  )}
                >
                  I Paid
                </button>
                <button
                  type="button"
                  onClick={() => setPaidBy('them')}
                  className={cn(
                    "h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    paidBy === 'them' ? "bg-primary text-white border-transparent" : "bg-secondary/10 border-transparent text-muted-foreground/30"
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

          {/* Reason — with proof icon on the right */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block opacity-40">Reason</label>
            <div className="relative group">
              <Tag size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={category || "What for?"}
                className="w-full pl-10 pr-14 h-12 rounded-[1.5rem] text-sm bg-card/50 outline-none transition-all font-medium"
                style={{ border: '1px solid hsl(var(--border) / 0.3)' }} />
              {/* Proof / image icon inside input, right side */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Add proof / bill"
                className={cn(
                  "absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90",
                  attachmentDataUrl
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary/60 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                )}
              >
                <ImageIcon size={15} />
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
                    } catch (err) {
                      toast({ title: 'Error', description: 'Could not attach image', variant: 'destructive' });
                    }
                  }
                }}
              />
            </div>
            {/* Compact attachment preview */}
            {attachmentDataUrl && (
              <div className="relative w-full h-16 rounded-[1rem] overflow-hidden border border-border/20 group mt-1">
                <img src={attachmentDataUrl} alt="Attachment" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setAttachmentDataUrl(null)}
                    className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
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
            <div className="flex flex-wrap gap-1.5">
              {(showAllCategories ? EXPENSE_CATEGORIES : EXPENSE_CATEGORIES.slice(0, 2)).map((cat) => {
                const active = category === cat;
                return (
                  <button key={cat} type="button" onClick={() => setCategory(active ? '' : cat)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all duration-150 border backdrop-blur-sm"
                    style={{
                      background: active ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--card) / 0.6)',
                      color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                      border: `1px solid ${active ? 'hsl(var(--primary) / 0.25)' : 'hsl(var(--border) / 0.2)'}`,
                      transform: active ? 'scale(1.05)' : 'scale(1)',
                    }}>
                    <span className="text-sm">{CATEGORY_EMOJIS[cat] || '📦'}</span>
                    {cat}
                  </button>
                );
              })}
              {/* More / Less toggle */}
              <button
                type="button"
                onClick={() => setShowAllCategories((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-dashed border-border/20 bg-secondary/10 text-[8px] font-black uppercase tracking-wider text-muted-foreground/50 hover:bg-secondary/30 hover:text-muted-foreground transition-all active:scale-95"
              >
                {showAllCategories ? <><X size={9} />Less</> : <><Plus size={9} />More</>}
              </button>
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
            className="flex-[1.5] h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] disabled:opacity-40 active:scale-95 transition-all"
            disabled={isSubmitting || !amount || !personName.trim()}>
            {isSubmitting ? 'Adding...' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
