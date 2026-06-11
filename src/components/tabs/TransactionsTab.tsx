import { useEffect, useMemo, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowUpRight, CircleArrowOutUpRight, MessageSquare, User, Users, X } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';
import { cn } from '@/lib/utils';
import { type AppTransactionItem, getAllAppTransactions } from '@/lib/transactions';
import { syncDemoTransactions } from '@/lib/storage';
import { NativeAdCard } from '@/components/NativeAdCard';

interface TransactionsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  onNavigateToTab: (tabId: string) => void;
  bannerAdActive?: boolean;
}

const typeMeta: Record<AppTransactionItem['type'], { label: string; Icon: typeof User }> = {
  personal: { label: 'Personal', Icon: User },
  'split-person': { label: 'Split', Icon: ArrowLeftRight },
  group: { label: 'Group', Icon: Users },
  sms: { label: 'SMS', Icon: MessageSquare },
};

export function TransactionsTab({ onOpenAccount, onBack, onNavigateToTab, bannerAdActive = true }: TransactionsTabProps) {
  useBannerAd(bannerAdActive);
  const [items, setItems] = useState<AppTransactionItem[]>(() => getAllAppTransactions());
  const [viewing, setViewing] = useState<AppTransactionItem | null>(null);

  useBackHandler(!!viewing, () => setViewing(null));

  useEffect(() => {
    const storedValue = localStorage.getItem('splitmate_sms_auto_approve_enabled');
    const autoApprove = storedValue === null ? true : storedValue === 'true';
    syncDemoTransactions(autoApprove);
  }, []);

  useEffect(() => {
    const sync = () => setItems(getAllAppTransactions());
    window.addEventListener('splitmate_data_changed', sync);
    window.addEventListener('splitmate_sms_transactions_changed', sync);
    return () => {
      window.removeEventListener('splitmate_data_changed', sync);
      window.removeEventListener('splitmate_sms_transactions_changed', sync);
    };
  }, []);

  const summary = useMemo(() => {
    const incoming = items.filter((item) => item.direction === 'incoming').reduce((sum, item) => sum + item.amount, 0);
    const outgoing = items.filter((item) => item.direction === 'outgoing').reduce((sum, item) => sum + item.amount, 0);
    return { incoming, outgoing };
  }, [items]);

  const openSource = (item: AppTransactionItem) => {
    window.dispatchEvent(new CustomEvent('splitmate_open_transaction', {
      detail: {
        tabId: item.sourceTab,
        transactionId: item.sourceId,
      },
    }));
    setViewing(null);
    onNavigateToTab(item.sourceTab);
  };

  return (
    <div className="p-4 pb-40 space-y-5">
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
            <h1 className="text-2xl font-bold tracking-tight leading-none">Transactions</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80 max-w-[320px] leading-tight">
              Incoming, outgoing, personal, split, group, and SMS transactions in one place.
            </p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-600/70 font-bold">Incoming</p>
          <MoneyDisplay amount={summary.incoming} size="sm" className="text-emerald-500 font-black mt-1" />
        </div>
        <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-rose-600/70 font-bold">Outgoing</p>
          <MoneyDisplay amount={summary.outgoing} size="sm" className="text-rose-500 font-black mt-1" />
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border/10 bg-card p-6 text-center text-sm text-muted-foreground">
            No transactions yet.
          </div>
        ) : (
          items.map((item, idx) => {
            const meta = typeMeta[item.type];
            const amountClass = item.direction === 'incoming' ? 'text-emerald-500' : 'text-rose-500';
            const DirIcon = item.direction === 'incoming' ? ArrowDownRight : ArrowUpRight;

            return (
              <Fragment key={item.id}>
              <button
                type="button"
                onClick={() => setViewing(item)}
                className="w-full text-left rounded-2xl border border-border/10 bg-card px-4 py-3.5 active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      item.direction === 'incoming' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500',
                    )}>
                      <DirIcon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{item.reason}</p>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <meta.Icon size={12} />
                        <span>{meta.label}</span>
                        <span className="opacity-30">•</span>
                        <span className="truncate">{item.subtitle}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('font-bold tracking-tight', amountClass)}>
                      {item.direction === 'incoming' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                  </div>
                </div>
              </button>
              {(idx + 4) % 5 === 0 && <NativeAdCard />}
              </Fragment>
            );
          })
        )}
      </div>

      {viewing && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center pointer-events-auto" onClick={() => setViewing(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div
            className="w-full max-w-md bg-card rounded-[3rem] p-6 pb-12 space-y-5 animate-in slide-in-from-bottom-full border border-border/10 duration-500 shadow-2xl relative overflow-hidden mb-4 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

            <div className="flex items-center justify-between">
              <button
                onClick={() => setViewing(null)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all border border-border/5"
              >
                <X size={16} className="text-muted-foreground" />
              </button>
              <button
                onClick={() => openSource(viewing)}
                className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center active:scale-90 transition-all border border-primary/20"
                aria-label="Go to source transaction"
                title="Go to source"
              >
                <CircleArrowOutUpRight size={16} />
              </button>
            </div>

            <div className="text-center space-y-1 py-1">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">Transaction</p>
              <MoneyDisplay
                amount={viewing.amount}
                size="xl"
                className={cn(
                  'font-black text-5xl tracking-tighter block',
                  viewing.direction === 'incoming' ? 'text-emerald-500' : 'text-rose-500',
                )}
              />
            </div>

            <div className="space-y-2 bg-secondary/20 p-4 rounded-2xl border border-border/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Reason</p>
              <p className="text-lg font-black tracking-tight uppercase">{viewing.reason}</p>
            </div>

            <div className="space-y-2 bg-secondary/20 p-4 rounded-2xl border border-border/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Source</p>
              <p className="text-sm font-bold">{viewing.sourceLabel}</p>
              <p className="text-xs text-muted-foreground">{viewing.subtitle}</p>
              {viewing.status && <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">{viewing.status}</p>}
            </div>

            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-[0.2em]">Tap top-right to open original location</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
