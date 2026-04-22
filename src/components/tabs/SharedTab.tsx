
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, CheckCircle2, Trash2, Users, BarChart3, ArrowDownRight, ArrowUpRight, Search, X, Calendar, AlertCircle, ChevronRight, Pencil, Check, Edit3, Lock } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { ExpenseChart } from '@/components/ExpenseChart';
import { getPersonBalances, getSharedExpenses, deleteSharedExpense, updateSharedExpenseReason, deleteFriendGroup, settleExpenseWithPerson, getGroupBalances, settleGroup, deletePerson, FREE_LIMITS, getFriendGroups, saveSharedExpense, updateSmsTransaction, type PersonBalance, type SharedExpense, type GroupBalance } from '@/lib/storage';
import { AddSharedExpenseModal } from '@/components/modals/AddSharedExpenseModal';
import { useCurrency } from '@/hooks/use-currency';
import { useToast } from '@/hooks/use-toast';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { cn } from '@/lib/utils';
import { useBackHandler } from '@/hooks/useBackHandler';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useAdFree } from '@/hooks/useAdFree';
import { useBannerAd } from '@/hooks/useBannerAd';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';

interface SharedTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

export function SharedTab({ onOpenAccount, onBack, bannerAdActive = true }: SharedTabProps) {
  useBannerAd(bannerAdActive);
  const { isPro } = useProGate();
  const { isAdFree } = useAdFree();
  const [personBalances, setPersonBalances] = useState<PersonBalance[]>(getPersonBalances());
  const [groupBalances, setGroupBalances] = useState<GroupBalance[]>(getGroupBalances());
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const [recentTransactions, setRecentTransactions] = useState(() =>
    getSharedExpenses()
      .filter(e => !e.groupId) // Hide group transactions from main list
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
  );
  const navigate = useNavigate();
  const { toast } = useToast();
  const currency = useCurrency();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settlingPerson, setSettlingPerson] = useState<PersonBalance | null>(null);
  const [settlingGroupObj, setSettlingGroupObj] = useState<GroupBalance | null>(null);
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<GroupBalance | null>(null);
  const [deleteConfirmPerson, setDeleteConfirmPerson] = useState<PersonBalance | null>(null);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const [showDeleteFor, setShowDeleteFor] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<SharedExpense | null>(null);
  const [isEditingReason, setIsEditingReason] = useState(false);
  const [editedReason, setEditedReason] = useState('');

  useBackHandler(!!viewingTransaction, () => {
    setViewingTransaction(null);
    setIsEditingReason(false);
  });
  useBackHandler(!!deletingId, () => setDeletingId(null));
  useBackHandler(!!settlingPerson, () => setSettlingPerson(null));
  useBackHandler(!!settlingGroupObj, () => setSettlingGroupObj(null));
  useBackHandler(showAddModal, () => setShowAddModal(false));
  useBackHandler(showSearch, () => setShowSearch(false));

  const isSearching = searchQuery.trim().length > 0;

  // Sort people: most recent transaction first, then filter by search
  const sortedBalances = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return [...personBalances]
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const latestA = a.transactions.reduce((latest, t) => {
          const d = new Date(t.createdAt).getTime();
          return d > latest ? d : latest;
        }, 0);
        const latestB = b.transactions.reduce((latest, t) => {
          const d = new Date(t.createdAt).getTime();
          return d > latest ? d : latest;
        }, 0);
        return latestB - latestA;
      });
  }, [personBalances, searchQuery]);

  const { netBalance, balanceData, owedToYou, youOwe } = useMemo(() => {
    const net = personBalances.reduce((sum, person) => sum + person.netBalance, 0);

    const positiveBalances = personBalances.filter(p => p.netBalance > 0);
    const negativeBalances = personBalances.filter(p => p.netBalance < 0);
    const owed = positiveBalances.reduce((sum, p) => sum + p.netBalance, 0);
    const owe = Math.abs(negativeBalances.reduce((sum, p) => sum + p.netBalance, 0));

    const chartData = [
      { name: 'Incoming', value: Math.abs(positiveBalances.reduce((sum, p) => sum + p.netBalance, 0)), color: 'hsl(149, 88%, 52%)' },
      { name: 'Outgoing', value: Math.abs(negativeBalances.reduce((sum, p) => sum + p.netBalance, 0)), color: 'hsl(0, 85%, 65%)' }
    ].filter(item => item.value > 0);

    return { netBalance: net, balanceData: chartData, owedToYou: owed, youOwe: owe };
  }, [personBalances]);

  const handleAddExpense = () => {
    setPersonBalances(getPersonBalances());
    setGroupBalances(getGroupBalances());
    setRecentTransactions(getSharedExpenses()
      .filter(e => !e.groupId)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
    setShowAddModal(false);
  };

  const handleSettleTrigger = (person: PersonBalance) => {
    setSettlingPerson(person);
  };

  const confirmSettleGroup = () => {
    if (!settlingGroupObj) return;
    settleGroup(settlingGroupObj.groupId);
    setPersonBalances(getPersonBalances());
    setGroupBalances(getGroupBalances());
    setRecentTransactions(getSharedExpenses()
      .filter(e => !e.groupId)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
    setSettlingGroupObj(null);
    toast({
      title: "Group Settled",
      description: `All expenses in ${settlingGroupObj.name} have been marked as settled.`,
    });
  };

  const confirmSettle = () => {
    if (!settlingPerson) return;
    settleExpenseWithPerson(settlingPerson.name);
    refreshData();
    setSettlingPerson(null);
  };

  const refreshData = () => {
    setPersonBalances(getPersonBalances());
    setRecentTransactions(getSharedExpenses()
      .filter(e => !e.groupId)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
  };

  const handleDeleteTrigger = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = () => {
    if (!deletingId) return;
    deleteSharedExpense(deletingId);
    setPersonBalances(getPersonBalances());
    setRecentTransactions(getSharedExpenses()
      .filter(e => !e.groupId)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
    setDeletingId(null);
  };

  const handleStartPress = (id: string, e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // Already in delete mode for this card? ignore
    if (showDeleteFor === id) return;

    pressTimer.current = setTimeout(() => {
      setShowDeleteFor(id);
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, 600);
  };

  const handleEndPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleDeleteGroup = () => {
    if (deleteConfirmGroup) {
      deleteFriendGroup(deleteConfirmGroup.groupId);
      setDeleteConfirmGroup(null);
      setShowDeleteFor(null);
      setGroupBalances(getGroupBalances());
      setPersonBalances(getPersonBalances());
    }
  };

  const handleDeletePerson = () => {
    if (deleteConfirmPerson) {
      deletePerson(deleteConfirmPerson.name);
      setDeleteConfirmPerson(null);
      setShowDeleteFor(null);
      setPersonBalances(getPersonBalances());
    }
  };

  const monthSections = useMemo(() => {
    const groups = new Map<string, typeof recentTransactions>();

    recentTransactions.forEach((expense) => {
      const date = new Date(expense.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = groups.get(monthKey) || [];
      groups.set(monthKey, [...existing, expense]);
    });

    return Array.from(groups.entries()).map(([key, items]) => {
      const [year, month] = key.split('-').map(Number);
      return {
        key,
        label: new Date(year, month - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        transactions: items,
      };
    });
  }, [recentTransactions]);

  useEffect(() => {
    if (monthSections.length === 0) {
      setSelectedMonthKey(null);
      return;
    }

    const monthExists = selectedMonthKey && monthSections.some((section) => section.key === selectedMonthKey);
    if (!monthExists) {
      setSelectedMonthKey(monthSections[0].key);
    }
  }, [monthSections, selectedMonthKey]);

  useEffect(() => {
    const handleTriggerAdd = (e: any) => {
      if (e.detail?.tabId === 'shared') setShowAddModal(true);
    };
    const handleOpenTransaction = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string; transactionId?: string }>).detail;
      if (!detail || detail.tabId !== 'shared' || !detail.transactionId) return;

      const all = getSharedExpenses();
      setPersonBalances(getPersonBalances());
      setGroupBalances(getGroupBalances());
      setRecentTransactions(
        all
        .filter((item) => !item.groupId)
        .sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
      );

      const target = all.find((item) => item.id === detail.transactionId);
      if (!target) return;
      const monthKey = `${new Date(target.date).getFullYear()}-${String(new Date(target.date).getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonthKey(monthKey);
      setViewingTransaction(target);
      setIsEditingReason(false);
    };
    const sync = () => {
      setPersonBalances(getPersonBalances());
      setGroupBalances(getGroupBalances());
      setRecentTransactions(getSharedExpenses().sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }));
    };
    window.addEventListener('splitmate_trigger_add', handleTriggerAdd);
    window.addEventListener('splitmate_data_changed', sync);
    window.addEventListener('splitmate_open_transaction', handleOpenTransaction);
    return () => {
      window.removeEventListener('splitmate_trigger_add', handleTriggerAdd);
      window.removeEventListener('splitmate_data_changed', sync);
      window.removeEventListener('splitmate_open_transaction', handleOpenTransaction);
    };
  }, []);

  const selectedMonthIndex = useMemo(() => {
    if (!selectedMonthKey) return -1;
    return monthSections.findIndex((section) => section.key === selectedMonthKey);
  }, [monthSections, selectedMonthKey]);

  const visibleTransactions = useMemo(() => {
    if (selectedMonthIndex < 0) return [] as typeof recentTransactions;
    return monthSections[selectedMonthIndex]?.transactions ?? [];
  }, [monthSections, selectedMonthIndex]);

  const shiftMonth = (direction: 'left' | 'right') => {
    if (selectedMonthIndex < 0) return;
    const delta = direction === 'left' ? 1 : -1;
    const nextIndex = selectedMonthIndex + delta;
    if (nextIndex < 0 || nextIndex >= monthSections.length) return;
    setSelectedMonthKey(monthSections[nextIndex].key);
  };

  const handleMonthSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const handleMonthSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;

    const endX = event.changedTouches[0]?.clientX;
    if (typeof endX !== 'number') return;

    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 45) return;
    if (deltaX < 0) {
      shiftMonth('left');
      return;
    }
    shiftMonth('right');
  };

  const handlePersonClick = (person: PersonBalance) => {
    navigate(`/person/${encodeURIComponent(person.name)}`);
  };

  return (
    <div className="p-4 pb-40 space-y-5 relative">
      {/* Dismiss layer when a delete button is active */}
      {showDeleteFor && (
        <div
          className="fixed inset-0 z-10 animate-in fade-in duration-300"
          onClick={() => setShowDeleteFor(null)}
        />
      )}

      {/* Header */}
      <div className="pt-4 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-11 h-11 rounded-2xl bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm mt-0.5"
                aria-label="Back"
              >
                <ChevronLeft size={20} strokeWidth={2.5} />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold">Split</h1>
              <p className="text-sm text-muted-foreground">Split expenses with others</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {personBalances.length > 0 && (
              <button
                onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200"
                style={{
                  background: showSearch ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--secondary))',
                  border: `1px solid ${showSearch ? 'hsl(var(--primary) / 0.3)' : 'hsl(var(--border) / 0.4)'}`,
                }}
              >
                {showSearch ? <X size={16} className="text-primary" /> : <Search size={16} className="text-muted-foreground" />}
              </button>
            )}
            <AccountQuickButton onClick={onOpenAccount} />
          </div>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 h-11 rounded-2xl text-sm bg-card/50 border border-border/30 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
      )}

      {/* Balance Overview Card */}
      {!isSearching && (
        <div
          className="p-5 relative overflow-hidden"
          style={{
            background: netBalance >= 0
              ? 'linear-gradient(135deg, hsl(var(--success) / 0.1) 0%, hsl(var(--card) / 0.95) 60%)'
              : 'linear-gradient(135deg, hsl(var(--danger) / 0.1) 0%, hsl(var(--card) / 0.95) 60%)',
            border: `1px solid ${netBalance >= 0 ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--danger) / 0.15)'}`,
            borderRadius: '2.25rem',
            boxShadow: `0 8px 28px -8px ${netBalance >= 0 ? 'hsl(var(--success) / 0.15)' : 'hsl(var(--danger) / 0.15)'}`,
          }}
        >
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2" style={{ letterSpacing: '0.08em' }}>
            Overall Balance
          </p>
          <MoneyDisplay amount={netBalance} size="lg" showSign={true} />
          <p className="text-xs text-muted-foreground mt-1.5">
            {netBalance > 0 ? "You have incoming overall" : netBalance < 0 ? "You have outgoing overall" : "All balanced! 🎉"}
          </p>

          {/* Mini breakdown */}
          <div className="flex gap-3 mt-4 pt-3" style={{ borderTop: '1px solid hsl(var(--border) / 0.12)' }}>
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl" style={{ background: 'hsl(var(--success) / 0.08)' }}>
              <ArrowDownRight size={13} className="text-success" />
              <div>
                <p className="text-[10px] text-muted-foreground">Incoming</p>
                <p className="text-xs font-bold text-success">{currency.symbol}{owedToYou.toLocaleString(currency.locale)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl" style={{ background: 'hsl(var(--danger) / 0.08)' }}>
              <ArrowUpRight size={13} className="text-danger" />
              <div>
                <p className="text-[10px] text-muted-foreground">Outgoing</p>
                <p className="text-xs font-bold text-danger">{currency.symbol}{youOwe.toLocaleString(currency.locale)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance Distribution Chart */}
      {!isSearching && balanceData.length > 0 && (
        <div className="ios-card-modern p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <div className="w-8 h-8 bg-success/15 rounded-xl flex items-center justify-center">
              <BarChart3 size={15} className="text-success" />
            </div>
            Balance Overview
          </h3>
          <ExpenseChart data={balanceData} type="pie" height={200} />
        </div>
      )}


      {/* Groups & People List */}
      {sortedBalances.length === 0 && groupBalances.length === 0 ? (
        <div className="ios-card-modern p-10 text-center mt-4">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'hsl(var(--muted) / 0.5)' }}>
            <Users size={28} className="text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold">No shared expenses yet</p>
          <p className="text-sm text-muted-foreground mt-1">Tap + to add your first shared expense</p>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          {/* Groups Section */}
          {!isSearching && groupBalances.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-muted-foreground text-[10px] uppercase tracking-[0.2em] px-1 opacity-70">
                Active Groups ({groupBalances.length})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {groupBalances.map((group, index) => {
                  const isLockedGroup = !isPro && index >= FREE_LIMITS.MAX_SHARED_GROUPS;
                  return (
                  <div
                    key={group.groupId}
                    onPointerDown={(e) => handleStartPress(group.groupId, e)}
                    onPointerUp={handleEndPress}
                    onPointerLeave={handleEndPress}
                    onClick={() => {
                      if (showDeleteFor) {
                        setShowDeleteFor(null);
                        return;
                      }
                      navigate(`/group/${group.groupId}`);
                    }}
                    className={cn(
                      "ios-card-modern p-4 relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer",
                      isLockedGroup && "opacity-40",
                      showDeleteFor === group.groupId && "z-20 ring-2 ring-rose-500/20"
                    )}
                  >
                    {isLockedGroup && (
                      <>
                        <div className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                          <Lock size={12} className="text-white" />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestProUpgrade('groups', 'Free users can create and manage only 1 group. Upgrade to Pro for unlimited groups.');
                          }}
                          className="absolute inset-0 z-40 pointer-events-auto"
                          aria-label="Upgrade to unlock this group"
                        />
                      </>
                    )}
                    {/* Delete Overlay Icon */}
                    {showDeleteFor === group.groupId && !isLockedGroup && (
                      <div
                        className="absolute inset-0 z-20 bg-rose-500/10 backdrop-blur-[2px] flex items-center justify-end pr-4 animate-in slide-in-from-right-10"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmGroup(group);
                          }}
                          className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
                        >
                          <Trash2 size={24} />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg relative overflow-hidden"
                          style={{ backgroundColor: group.color }}
                        >
                          <div className="absolute inset-0 bg-white/10" />
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base text-foreground truncate">{group.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                            <span>{group.transactions.length} txn</span>
                            <span className="opacity-30">•</span>
                            <span>{group.members.length} people</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <MoneyDisplay
                            amount={group.totalSpend}
                            size="md"
                            showSign={false}
                            className="font-black tracking-tight text-rose-500"
                          />
                        </div>
                        <p className="text-[9px] text-rose-500/60 font-black uppercase tracking-widest">
                          Total Paid
                        </p>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          <div className="space-y-3 pb-4">
            <h3 className="font-semibold text-muted-foreground text-[10px] uppercase tracking-[0.2em] px-1 opacity-70">
              Individual Balances ({sortedBalances.length})
            </h3>
            {sortedBalances.map((person, index) => {
              const isLockedPerson = !isPro && index >= FREE_LIMITS.MAX_PERSONS;
              return (
              <div key={person.name} className="flex flex-col gap-3">
                <div
                  onPointerDown={(e) => person.name !== 'me' && handleStartPress(person.name, e)}
                  onPointerUp={handleEndPress}
                  onPointerLeave={handleEndPress}
                  onClick={() => {
                    if (showDeleteFor) {
                      setShowDeleteFor(null);
                      return;
                    }
                    handlePersonClick(person);
                  }}
                  className={cn(
                    "ios-card-modern p-4 relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer",
                    isLockedPerson && "opacity-40",
                    showDeleteFor === person.name && "z-20 ring-2 ring-rose-500/20"
                  )}
                >
                  {isLockedPerson && (
                    <>
                      <div className="absolute top-3 right-3 z-30 w-7 h-7 rounded-lg bg-black/50 border border-white/20 flex items-center justify-center">
                        <Lock size={12} className="text-white" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestProUpgrade('persons', 'Free users can manage up to 3 people. Upgrade to Pro for unlimited people.');
                        }}
                        className="absolute inset-0 z-40 pointer-events-auto"
                        aria-label="Upgrade to unlock this person"
                      />
                    </>
                  )}
                  {/* Delete Overlay Icon */}
                  {showDeleteFor === person.name && !isLockedPerson && (
                    <div
                      className="absolute inset-0 z-20 bg-rose-500/10 backdrop-blur-[2px] flex items-center justify-end pr-4 animate-in slide-in-from-right-10"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmPerson(person);
                        }}
                        className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 active:scale-90 transition-all"
                      >
                        <Trash2 size={24} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3 flex-1 text-left group">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{
                          background: person.netBalance > 0
                            ? 'hsl(var(--success) / 0.12)' : person.netBalance < 0
                              ? 'hsl(var(--danger) / 0.12)' : 'hsl(var(--muted) / 0.3)',
                          color: person.netBalance > 0
                            ? 'hsl(var(--success))' : person.netBalance < 0
                              ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))',
                          border: `1px solid ${person.netBalance > 0
                            ? 'hsl(var(--success) / 0.2)' : person.netBalance < 0
                              ? 'hsl(var(--danger) / 0.2)' : 'hsl(var(--border) / 0.3)'}`,
                        }}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary" style={{ transition: 'color 0.15s ease' }}>
                          {person.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{person.transactions.length} txn{person.transactions.length !== 1 ? 's' : ''}</span>
                          {person.netBalance === 0 && (
                            <span className="text-success font-semibold flex items-center gap-0.5">
                              <CheckCircle2 size={10} /> Settled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <MoneyDisplay amount={person.netBalance} size="sm" showSign={true} />
                      {person.netBalance !== 0 && !isLockedPerson && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSettleTrigger(person);
                          }}
                          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 bg-primary/10 text-primary border border-primary/20 active:scale-90"
                        >
                          <ChevronRight size={14} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {!isAdFree && index === 0 && <NativeAdCard />}
              </div>
            )})}
          </div>
        </div>
      )}

          {/* Recent Transactions */}
          {!isSearching && recentTransactions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-widest px-1" style={{ letterSpacing: '0.08em' }}>
                Recent Transactions
              </h3>

              {monthSections.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {monthSections.map((month) => {
                    const isActive = selectedMonthKey === month.key;
                    return (
                      <button
                        key={month.key}
                        onClick={() => setSelectedMonthKey(month.key)}
                        className="px-3.5 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap border flex items-center gap-1.5 flex-shrink-0 transition-all duration-200"
                        style={{
                          background: isActive ? 'hsl(var(--primary))' : 'hsl(var(--secondary) / 0.5)',
                          color: isActive ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                          borderColor: isActive ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--border) / 0.2)',
                          boxShadow: isActive ? '0 4px 12px -4px hsl(var(--primary) / 0.3)' : 'none',
                        }}
                      >
                        {month.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div onTouchStart={handleMonthSwipeStart} onTouchEnd={handleMonthSwipeEnd} className="space-y-3.5">
                {visibleTransactions.map((expense, idx) => (
                  <div key={expense.id} className="flex flex-col gap-3.5">
                    <div
                      onClick={() => setViewingTransaction(expense)}
                      className="ios-card-modern px-4 py-3.5 group active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                              background: expense.paidBy === 'me' ? 'hsl(var(--danger) / 0.1)' : 'hsl(var(--success) / 0.1)',
                            }}>
                            {expense.paidBy === 'me'
                              ? <ArrowUpRight size={14} className="text-danger" />
                              : <ArrowDownRight size={14} className="text-success" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{expense.reason || 'Shared expense'}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="font-medium">{expense.personName}</span>
                              <span className="opacity-40">·</span>
                              <span>{new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                              {expense.settled && (
                                <>
                                  <span className="opacity-40">·</span>
                                  <span className="text-success font-semibold">Settled</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <MoneyDisplay
                              amount={expense.amount}
                              size="sm"
                              className={expense.paidBy === 'me' ? 'text-red-400' : 'text-green-400'}
                            />
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {expense.paidBy === 'me' ? 'You paid' : `${expense.personName} paid`}
                            </p>
                          </div>
                          {/* Deletion Permission based on Ownership (Created By Me) */}
                          {(expense.createdByMe !== false && !expense.isIncoming) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTrigger(expense.id);
                              }}
                              className="w-10 h-10 flex items-center justify-center text-destructive/60 bg-danger/5 rounded-2xl active:scale-90 transition-all border border-destructive/5 shadow-sm"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isAdFree && idx % 5 === 0 && (
                      <div className="pt-1.5">
                        <NativeAdCard />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modals */}
          <AddSharedExpenseModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddExpense}
          />
          {/* Transaction Detail Sheet */}
          {viewingTransaction && createPortal(
            <div className="fixed inset-0 z-[10001] flex items-end justify-center pointer-events-auto" onClick={() => setViewingTransaction(null)}>
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
              <div
                className="w-full max-w-md bg-card rounded-[3rem] p-6 pb-12 space-y-5 animate-in slide-in-from-bottom-full border border-border/10 duration-500 shadow-2xl relative overflow-hidden mb-4 mx-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setViewingTransaction(null);
                      setIsEditingReason(false);
                    }}
                    className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center active:scale-90 transition-all border border-border/5"
                  >
                    <X size={16} className="text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-2">
                    {(viewingTransaction.createdByMe !== false && !viewingTransaction.isIncoming) && (
                      <>
                        <button
                          onClick={() => {
                            setIsEditingReason(!isEditingReason);
                            setEditedReason(viewingTransaction.reason);
                          }}
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all border group",
                            isEditingReason ? "bg-primary/20 border-primary/30 text-primary" : "bg-secondary border-border/10 text-muted-foreground"
                          )}
                        >
                          <Pencil size={15} className={cn(isEditingReason && "animate-pulse")} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = viewingTransaction.id;
                            handleDeleteTrigger(id);
                            // Use a small timeout to allow the portal to mount correctly
                            setTimeout(() => setViewingTransaction(null), 100);
                          }}
                          className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center active:scale-90 transition-all border border-destructive/10 group"
                        >
                          <Trash2 size={16} className="text-destructive group-hover:scale-110 transition-transform" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-center space-y-1 py-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">Contribution</p>
                  <MoneyDisplay
                    amount={viewingTransaction.amount}
                    size="xl"
                    className={cn(
                      "font-black text-5xl tracking-tighter block",
                      viewingTransaction.paidBy === 'me' ? "text-red-500" : "text-green-500"
                    )}
                  />
                </div>

                <div className="flex items-center justify-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                    <span className="text-sm">
                      {viewingTransaction.category === 'Food & Dining' ? '🍕' :
                        viewingTransaction.category === 'Transportation' ? '🚗' :
                          viewingTransaction.category === 'Shopping' ? '🛍️' :
                            viewingTransaction.category === 'Entertainment' ? '🎬' :
                              viewingTransaction.category === 'Bills & Utilities' ? '📄' :
                                viewingTransaction.category === 'Healthcare' ? '💊' :
                                  viewingTransaction.category === 'Education' ? '📚' :
                                    viewingTransaction.category === 'Travel' ? '✈️' :
                                      viewingTransaction.category === 'Groceries' ? '🛒' : '📦'}
                    </span>
                    <span className="text-[9px] font-black text-primary uppercase tracking-[0.1em]">{viewingTransaction.category || 'Shared'}</span>
                  </div>
                  <div className={cn(
                    "px-3 py-1.5 rounded-full border border-border/5",
                    viewingTransaction.paidBy === 'me' ? "bg-rose-500/10 text-rose-500" : "bg-green-500/10 text-green-500"
                  )}>
                    <span className="text-[9px] font-black uppercase tracking-[0.1em]">
                      {viewingTransaction.paidBy === 'me' ? "You Paid" : `${viewingTransaction.personName} Paid`}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  <div className="space-y-1 text-center">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/30">Purpose</p>
                    {isEditingReason ? (
                      <div className="flex items-center gap-2 max-w-xs mx-auto">
                        <input
                          autoFocus
                          type="text"
                          value={editedReason}
                          onChange={(e) => setEditedReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateSharedExpenseReason(viewingTransaction.id, editedReason);
                              setViewingTransaction({ ...viewingTransaction, reason: editedReason });
                              setIsEditingReason(false);
                              refreshData();
                            }
                          }}
                          className="flex-1 h-10 bg-secondary/50 rounded-xl px-4 text-sm font-bold border border-primary/20 outline-none focus:border-primary/50 transition-all"
                        />
                        <button
                          onClick={() => {
                            updateSharedExpenseReason(viewingTransaction.id, editedReason);
                            setViewingTransaction({ ...viewingTransaction, reason: editedReason });
                            setIsEditingReason(false);
                            refreshData();
                          }}
                          className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 active:scale-90 transition-all"
                        >
                          <Check size={18} />
                        </button>
                      </div>
                    ) : (
                      <h2 className="text-[20px] font-black tracking-tight text-foreground leading-snug uppercase px-4">
                        {viewingTransaction.reason || "No Purpose Defined"}
                      </h2>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="bg-secondary/20 p-4 rounded-2xl border border-border/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-muted-foreground opacity-40" />
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Date Recorded</span>
                      </div>
                      <span className="text-[10px] font-black text-foreground/80 uppercase tracking-tight">
                        {new Date(viewingTransaction.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    </div>

                    <div className="bg-secondary/20 p-4 rounded-2xl border border-border/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={12} className={cn("text-muted-foreground opacity-40", viewingTransaction.settled && "text-success opacity-100")} />
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Status</span>
                      </div>
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-tight",
                        viewingTransaction.settled ? "text-success" : "text-muted-foreground/60"
                      )}>
                        {viewingTransaction.settled ? "Settled" : "Pending"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center pt-1">
                  <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">Shared Transaction Verified</span>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Delete Confirmation Sheet */}
          {deletingId && createPortal(
            <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setDeletingId(null)}>
              <div
                className="w-full max-w-md bg-card rounded-[3rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 duration-300 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={28} className="text-destructive" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Delete Transaction?</h2>
                  <p className="text-sm text-muted-foreground px-4">
                    Are you sure you want to remove this? This action cannot be undone.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    onClick={() => setDeletingId(null)}
                    className="w-full h-14 rounded-2xl bg-secondary/50 text-secondary-foreground font-bold hover:bg-secondary transition-all active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="w-full h-14 rounded-2xl bg-destructive text-destructive-foreground font-black shadow-xl shadow-destructive/20 hover:brightness-110 transition-all active:scale-[0.97]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Delete Group Confirmation */}
          {deleteConfirmGroup && createPortal(
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto" onClick={() => setDeleteConfirmGroup(null)}>
              <div
                className="w-full max-w-sm bg-card rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 border border-border/10 shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-[1.75rem] bg-rose-500/10 flex items-center justify-center mx-auto border-2 border-white/5">
                    <AlertCircle size={32} className="text-rose-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-foreground uppercase italic leading-none">Delete Group?</h2>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40 mt-1">{deleteConfirmGroup.name}</p>
                  </div>
                </div>

                <div className="rounded-[2rem] p-5 bg-rose-500/5 border border-rose-500/10 text-center">
                  <p className="text-[10px] font-black uppercase text-rose-500/60 leading-relaxed">
                    Permanently delete this group and all its records? This cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleDeleteGroup}
                    className="h-14 w-full rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                  >
                    Delete Everything
                  </button>
                  <button
                    onClick={() => setDeleteConfirmGroup(null)}
                    className="h-14 w-full rounded-2xl bg-secondary text-foreground font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {/* Delete Person Confirmation */}
          {deleteConfirmPerson && createPortal(
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto" onClick={() => setDeleteConfirmPerson(null)}>
              <div
                className="w-full max-w-sm bg-card rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 border border-border/10 shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 rounded-[1.75rem] bg-rose-500/10 flex items-center justify-center mx-auto border-2 border-white/5">
                    <AlertCircle size={32} className="text-rose-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-foreground uppercase italic leading-none">Delete Contact?</h2>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40 mt-1">{deleteConfirmPerson.name}</p>
                  </div>
                </div>

                <div className="rounded-[2rem] p-5 bg-rose-500/5 border border-rose-500/10 text-center">
                  <p className="text-[10px] font-black uppercase text-rose-500/60 leading-relaxed">
                    Permanently delete this contact and all shared history? This cannot be undone.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleDeletePerson}
                    className="h-14 w-full rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                  >
                    Delete Contact
                  </button>
                  <button
                    onClick={() => setDeleteConfirmPerson(null)}
                    className="h-14 w-full rounded-2xl bg-secondary text-foreground font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {/* Settle Confirmation Sheet */}
          {settlingPerson && createPortal(
            <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSettlingPerson(null)}>
              <div
                className="w-full max-w-md bg-card rounded-[3rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={28} className="text-primary" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight uppercase italic">Settle Balance?</h2>
                  <p className="text-sm text-muted-foreground px-4">
                    Confirm settlement with <span className="font-semibold text-foreground">{settlingPerson.name}</span>.
                  </p>
                  <div className="mt-4 p-5 bg-secondary/15 rounded-3xl border border-border/5">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2 opacity-50">Settle Amount</p>
                    <div className="text-2xl font-black">
                      <MoneyDisplay amount={settlingPerson.netBalance} showSign={true} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => setSettlingPerson(null)}
                    className="w-full h-14 rounded-2xl bg-secondary/50 text-secondary-foreground font-black text-[10px] uppercase tracking-[0.2em] hover:bg-secondary transition-all active:scale-[0.97]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSettle}
                    className="w-full h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/20 active:scale-[0.97]"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        </div>
      );
}

