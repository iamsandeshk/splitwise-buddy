import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Calendar, 
  CreditCard, 
  AlertCircle, 
  Sparkles,
  Repeat,
  Gift,
  Tag,
  FileText,
  Zap
} from 'lucide-react';
import { 
  getAccountSummaries, 
  getDefaultAccountId, 
  getActiveSubscriptionCategories,
  type AppCategoryItem,
  type SubscriptionItem, 
  type SubscriptionCycle 
} from '@/lib/storage';
import { useCurrency } from '@/hooks/use-currency';
import { useBackHandler } from '@/hooks/useBackHandler';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SubscriptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<SubscriptionItem, 'id' | 'createdAt'> & { id?: string }) => void;
  initialData?: SubscriptionItem | null;
  title?: string;
}

const CYCLES: { id: SubscriptionCycle; label: string }[] = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'daily', label: 'Daily' },
  { id: 'lifetime', label: 'Lifetime' },
];

const CATEGORIES = [
  'Entertainment',
  'AI',
  'Streaming',
  'Music',
  'Productivity',
  'Cloud & Storage',
  'Work & Dev',
  'Lifestyle',
  'Utilities',
  'Gaming',
  'Other'
];

export function SubscriptionFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title,
}: SubscriptionFormModalProps) {
  const currency = useCurrency();
  const accounts = useMemo(() => getAccountSummaries(), []);
  const defaultAccountId = useMemo(() => getDefaultAccountId(), []);

  const [appName, setAppName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<SubscriptionCycle>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [subCategories, setSubCategories] = useState<AppCategoryItem[]>(getActiveSubscriptionCategories());
  const [logoUrl, setLogoUrl] = useState('');
  const [category, setCategory] = useState(() => getActiveSubscriptionCategories()[0]?.name || 'Entertainment');
  const [autoRenew, setAutoRenew] = useState(true);
  const [freeTrial, setFreeTrial] = useState(false);
  const [trialEndDate, setTrialEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [autoPay, setAutoPay] = useState(false);
  const [autoPayPlatform, setAutoPayPlatform] = useState('PhonePe');
  const [customPlatform, setCustomPlatform] = useState('');

  useEffect(() => {
    const handleSyncCats = () => setSubCategories(getActiveSubscriptionCategories());
    window.addEventListener('splitmate_categories_changed', handleSyncCats);
    return () => window.removeEventListener('splitmate_categories_changed', handleSyncCats);
  }, []);

  // Sync state whenever opened or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setAppName(initialData.appName || '');
        setAmount(initialData.amount ? String(initialData.amount) : '');
        setCycle(initialData.cycle || 'monthly');
        setStartDate(initialData.startDate || initialData.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]);
        setAccountId(initialData.accountId || '');
        setLogoUrl(initialData.logoUrl || '');
        setCategory(initialData.category || 'Entertainment');
        setAutoRenew(initialData.autoRenew !== false);
        setFreeTrial(Boolean(initialData.freeTrial));
        setTrialEndDate(initialData.trialEndDate || '');
        setNotes(initialData.notes || '');
        setAutoPay(Boolean(initialData.autoPay));
        const plat = initialData.autoPayPlatform || 'PhonePe';
        const isStandard = ['PhonePe', 'Paytm', 'Slice', 'GPay'].includes(plat);
        if (isStandard) {
          setAutoPayPlatform(plat);
          setCustomPlatform('');
        } else {
          setAutoPayPlatform('Custom');
          setCustomPlatform(plat);
        }
      } else {
        setAppName('');
        setAmount('');
        setCycle('monthly');
        setStartDate(new Date().toISOString().split('T')[0]);
        setAccountId(defaultAccountId || accounts[0]?.id || '');
        setLogoUrl('');
        setCategory('Entertainment');
        setAutoRenew(true);
        setFreeTrial(false);
        setTrialEndDate('');
        setNotes('');
        setAutoPay(false);
        setAutoPayPlatform('PhonePe');
        setCustomPlatform('');
      }
    }
  }, [isOpen, initialData, defaultAccountId, accounts]);

  useBackHandler(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);

    if (!appName.trim()) {
      toast.error('Please enter a service or subscription name');
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid subscription price');
      return;
    }

    if (freeTrial && !trialEndDate) {
      toast.error('Please specify when the free trial ends');
      return;
    }

    const finalAutoPayPlatform = autoPay
      ? (autoPayPlatform === 'Custom' ? customPlatform.trim() || 'Custom' : autoPayPlatform)
      : undefined;

    onSave({
      id: initialData?.id,
      appName: appName.trim(),
      amount: parsedAmount,
      cycle,
      startDate,
      accountId: accountId || undefined,
      logoUrl: logoUrl || undefined,
      category,
      autoRenew,
      freeTrial,
      trialEndDate: freeTrial ? trialEndDate : undefined,
      notes: notes.trim() || undefined,
      autoPay,
      autoPayPlatform: finalAutoPayPlatform,
    });
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[10005] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-[2.25rem] bg-card border border-border/20 shadow-xl overflow-hidden font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border/10 shrink-0">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              {title || (initialData ? 'Edit Subscription' : 'New Subscription')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {initialData ? 'Update renewal, trial, and payment terms' : 'Track recurring payments, trials, and cycles'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-secondary/80 hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 no-scrollbar">

          {/* Service Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
              Service Name
            </label>
            <input
              type="text"
              value={appName}
              onChange={e => setAppName(e.target.value)}
              placeholder="e.g. Claude, Netflix, Spotify"
              className="w-full h-12 rounded-2xl bg-secondary/35 border border-border/15 px-4 text-sm font-bold text-foreground outline-none focus:border-border/40 focus:ring-1 focus:ring-border/40 transition-all"
            />
          </div>

          {/* Price & Billing Cycle Pill Selector */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                Price ({currency.symbol})
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-12 rounded-2xl bg-secondary/35 border border-border/15 px-4 text-sm font-bold text-foreground outline-none focus:border-border/40 focus:ring-1 focus:ring-border/40 transition-all"
              />
            </div>

            {/* Custom Pill Buttons for Cycle — No ugly desktop browser select menu! */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1.5">
                <Repeat size={12} className="text-muted-foreground" />
                Billing Frequency
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CYCLES.map(c => {
                  const isSelected = cycle === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCycle(c.id)}
                      className={cn(
                        "h-11 rounded-xl text-xs font-bold transition-all border",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground border-border/10"
                      )}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1.5">
              <Calendar size={12} />
              Start Date / Next Payment Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full h-12 rounded-2xl bg-secondary/35 border border-border/15 px-4 text-xs font-semibold text-foreground outline-none focus:border-border/40"
            />
          </div>

          {/* Auto-Renew / Non-Recurring Toggle Card */}
          <div className="rounded-2xl bg-secondary/25 border border-border/15 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Repeat size={13} className="text-muted-foreground" />
                  Auto-Renewing Subscription
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {autoRenew 
                    ? `Renews continuously every ${cycle === 'monthly' ? 'month' : cycle}.` 
                    : 'Paid for one time only. No recurring renewals.'}
                </p>
              </div>

              {/* Clean tactile switch */}
              <button
                type="button"
                role="switch"
                aria-checked={autoRenew}
                onClick={() => setAutoRenew(!autoRenew)}
                className={cn(
                  "w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative shrink-0 border flex items-center focus:outline-none",
                  autoRenew ? "bg-primary border-primary" : "bg-secondary/70 border-border/20"
                )}
              >
                <span 
                  className={cn(
                    "w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 block pointer-events-none transform",
                    autoRenew ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {!autoRenew && (
              <div className="pt-2 border-t border-border/10 text-[11px] text-amber-400 font-medium flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0" />
                <span>Monthly plan paid for one time only: charges once without automatic renewals.</span>
              </div>
            )}
          </div>

          {/* Free Trial Toggle Card */}
          <div className="rounded-2xl bg-secondary/25 border border-border/15 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Gift size={13} className="text-muted-foreground" />
                  Free Trial
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {freeTrial 
                    ? 'Free trial period active. No charges until trial finishes.' 
                    : 'Subscription does not have a free trial period.'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={freeTrial}
                onClick={() => {
                  const next = !freeTrial;
                  setFreeTrial(next);
                  if (next && !trialEndDate) {
                    setTrialEndDate(startDate);
                  }
                }}
                className={cn(
                  "w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative shrink-0 border flex items-center focus:outline-none",
                  freeTrial ? "bg-primary border-primary" : "bg-secondary/70 border-border/20"
                )}
              >
                <span 
                  className={cn(
                    "w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 block pointer-events-none transform",
                    freeTrial ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {freeTrial && (
              <div className="pt-2 border-t border-border/10 space-y-1.5 animate-in fade-in">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  When Does Free Trial End?
                </label>
                <input
                  type="date"
                  value={trialEndDate}
                  onChange={e => setTrialEndDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="w-full h-11 rounded-xl bg-background border border-border/20 px-3.5 text-xs font-semibold text-foreground outline-none"
                />
              </div>
            )}
          </div>

          {/* Payment Mode / Account Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1.5">
              <CreditCard size={12} />
              Payment Mode Used (Account)
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountId('')}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between",
                  !accountId
                    ? "bg-primary/10 border-primary/50 text-foreground"
                    : "bg-secondary/30 border-border/10 text-muted-foreground hover:bg-secondary/50"
                )}
              >
                <span className="text-xs font-bold text-foreground">Default Account</span>
                <span className="text-[10px] font-medium text-muted-foreground/70 mt-0.5">Primary cash / wallet</span>
              </button>

              {accounts.map(acc => {
                const isSelected = accountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setAccountId(acc.id)}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between",
                      isSelected
                        ? "bg-primary/10 border-primary/50 text-foreground"
                        : "bg-secondary/30 border-border/10 text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    <span className="text-xs font-bold truncate text-foreground">{acc.name}</span>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground/80 mt-0.5">
                      {acc.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Auto-Pay Active Card */}
          <div className="rounded-2xl bg-secondary/25 border border-border/15 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Zap size={13} className="text-muted-foreground" />
                  Auto-Pay Active
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {autoPay 
                    ? `Automatic debit mandate configured via ${autoPayPlatform === 'Custom' ? (customPlatform.trim() || 'Custom platform') : autoPayPlatform}.` 
                    : 'No automatic mandate configured (paid manually).'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={autoPay}
                onClick={() => setAutoPay(!autoPay)}
                className={cn(
                  "w-12 h-7 rounded-full p-1 transition-colors duration-200 ease-in-out relative shrink-0 border flex items-center focus:outline-none",
                  autoPay ? "bg-primary border-primary" : "bg-secondary/70 border-border/20"
                )}
              >
                <span 
                  className={cn(
                    "w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 block pointer-events-none transform",
                    autoPay ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {autoPay && (
              <div className="pt-2 border-t border-border/10 space-y-2 animate-in fade-in">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Where is Auto-Pay Active?
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {['PhonePe', 'Paytm', 'Slice', 'GPay', 'Custom'].map(plat => {
                    const isSelected = autoPayPlatform === plat;
                    return (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => setAutoPayPlatform(plat)}
                        className={cn(
                          "h-9 rounded-xl text-[11px] font-bold transition-all border",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground border-border/10"
                        )}
                      >
                        {plat === 'Custom' ? 'Other' : plat}
                      </button>
                    );
                  })}
                </div>

                {autoPayPlatform === 'Custom' && (
                  <div className="pt-1">
                    <input
                      type="text"
                      value={customPlatform}
                      onChange={e => setCustomPlatform(e.target.value)}
                      placeholder="Enter platform (e.g. Cred, Amazon Pay, NetBanking, ICICI)"
                      className="w-full h-11 rounded-xl bg-background border border-border/20 px-3.5 text-xs font-semibold text-foreground outline-none focus:border-border/40"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category Pill Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1.5">
              <Tag size={12} />
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {subCategories.map(catItem => {
                const cat = catItem.name;
                const isSelected = category === cat;
                return (
                  <button
                    key={catItem.id || cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border flex items-center gap-1",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/30 hover:bg-secondary/50 text-muted-foreground hover:text-foreground border-border/10"
                    )}
                  >
                    {catItem.emoji && <span>{catItem.emoji}</span>}
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex items-center gap-1.5">
              <FileText size={12} />
              Notes / Description (Optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Student plan, shared account with family, card auto-debit on 5th..."
              rows={2}
              className="w-full rounded-2xl bg-secondary/35 border border-border/15 p-3 text-xs font-medium text-foreground outline-none resize-none focus:border-border/40"
            />
          </div>

          </div>

          {/* Sticky Pinned Footer with Save Button */}
          <div className="p-4 sm:px-6 pt-3 pb-5 border-t border-border/10 bg-card/95 backdrop-blur-sm shrink-0">
            <button
              type="submit"
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide transition-all active:scale-[0.98] border border-primary/20 hover:brightness-105 shadow-md flex items-center justify-center gap-2"
            >
              {initialData ? 'Save Changes' : 'Add Subscription'}
            </button>
          </div>

        </form>
      </div>
    </div>,
    document.body
  );
}
