import { useEffect, useMemo, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowUpRight, CircleArrowOutUpRight, MessageSquare, User, Users, X, Trash2, ChevronLeft } from 'lucide-react';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useBannerAd } from '@/hooks/useBannerAd';
import { cn } from '@/lib/utils';
import { type AppTransactionItem, getAllAppTransactions } from '@/lib/transactions';
import { NativeAdCard } from '@/components/NativeAdCard';
import { deletePersonalExpense, deleteSharedExpense, getTransactionAttachment } from '@/lib/storage';

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
};

export function TransactionsTab({ onOpenAccount, onBack, onNavigateToTab, bannerAdActive = true }: TransactionsTabProps) {
  useBannerAd(bannerAdActive);
  const [items, setItems] = useState<AppTransactionItem[]>(() => getAllAppTransactions());
  const [viewing, setViewing] = useState<AppTransactionItem | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<AppTransactionItem | null>(null);

  useBackHandler(!!viewing, () => setViewing(null));
  useBackHandler(!!deletingItem, () => setDeletingItem(null));

  useEffect(() => {
    if (viewing) {
      getTransactionAttachment(viewing.sourceId).then(data => {
        setViewingAttachment(data);
      });
    } else {
      setViewingAttachment(null);
    }
  }, [viewing]);

  useEffect(() => {
    const sync = () => setItems(getAllAppTransactions());
    window.addEventListener('splitmate_data_changed', sync);
    return () => {
      window.removeEventListener('splitmate_data_changed', sync);
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

  const confirmDelete = () => {
    if (!deletingItem) return;
    if (deletingItem.sourceTab === 'personal') {
      deletePersonalExpense(deletingItem.sourceId);
    } else {
      deleteSharedExpense(deletingItem.sourceId);
    }
    setDeletingItem(null);
  };

  return (
    <div className="w-full h-full overflow-y-auto pb-40 scroll-smooth flex flex-col">
      {/* Header — sticky */}
      <div className="sticky top-0 z-30 bg-background px-4 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-border/5">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center active:scale-90 transition-all mt-0.5"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-0.5">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Transactions<span className="text-primary">.</span></h1>
            <p className="text-xs text-muted-foreground mt-1.5 tracking-wide">All your transactions in one place</p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      <div className="p-4 space-y-5">

      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-5 flex flex-col justify-between"
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border) / 0.15)',
            borderRadius: '1.75rem',
            boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/70 font-bold">Incoming</p>
          <MoneyDisplay amount={summary.incoming} size="sm" className="text-emerald-500 font-black mt-1" />
        </div>
        <div
          className="p-5 flex flex-col justify-between"
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border) / 0.15)',
            borderRadius: '1.75rem',
            boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.2em] text-rose-500/70 font-bold">Outgoing</p>
          <MoneyDisplay amount={summary.outgoing} size="sm" className="text-rose-500 font-black mt-1" />
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div
            className="p-6 text-center text-sm text-muted-foreground"
            style={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border) / 0.15)',
              borderRadius: '1.75rem',
              boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
            }}
          >
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
                className="w-full text-left px-5 py-4 active:scale-[0.99] transition-all"
                style={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border) / 0.15)',
                  borderRadius: '1.75rem',
                  boxShadow: '0 2px 16px -4px hsl(var(--glass-shadow) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-full border flex items-center justify-center shrink-0 bg-transparent',
                      item.direction === 'incoming' ? 'border-border/20 text-emerald-500' : 'border-border/20 text-rose-500',
                    )}>
                      <DirIcon size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{item.reason}</p>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <meta.Icon size={12} />
                        <span>{meta.label}</span>
                        <span className="opacity-30">•</span>
                        <span className="truncate">{item.subtitle}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className={cn('font-bold tracking-tight', amountClass)}>
                        {item.direction === 'incoming' ? '+' : '-'}₹{Math.abs(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingItem(item);
                      }}
                      className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500/20 active:scale-95 transition-all shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </button>
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

            {viewingAttachment && (
              <div className="space-y-1.5">
                <div className="relative w-full h-36 rounded-2xl overflow-hidden border border-border/10 bg-black/10">
                  <img src={viewingAttachment} alt="Proof" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest px-1">Proof Attached</span>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground/60 tracking-wider text-center">
                  🔒 Stored locally on this device for privacy
                </p>
              </div>
            )}

            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-[0.2em]">Tap top-right to open original location</p>
          </div>
        </div>,
        document.body,
      )}

      {deletingItem && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setDeletingItem(null)}>
          <div
            className="w-full max-w-md bg-card rounded-[3rem] p-8 pt-10 pb-12 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-[2.5rem] bg-destructive/10 flex items-center justify-center mx-auto mb-4 animate-pulse border border-destructive/20">
                <Trash2 size={36} className="text-destructive" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-destructive uppercase">Delete Entry?</h2>
              <p className="text-[13px] text-muted-foreground px-4 leading-relaxed font-semibold italic opacity-80">
                This record will be permanently deleted from your records.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => setDeletingItem(null)}
                className="h-14 rounded-2xl bg-secondary font-bold uppercase tracking-wider text-[11px] active:scale-95 transition-all text-muted-foreground"
              >
                KEEP
              </button>
              <button
                onClick={confirmDelete}
                className="h-14 rounded-2xl bg-destructive text-white font-bold uppercase tracking-wider text-[11px] active:scale-95 transition-all"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </div>
  );
}
