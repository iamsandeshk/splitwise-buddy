import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Pencil, Share2, ChevronLeft, CheckCircle2, History, LayoutGrid, Check, X, UserPlus, Plus, Clock, Trash2, AlertCircle, Mail, Link2, Lock } from 'lucide-react';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { GroupExpenseModal } from '@/components/modals/GroupExpenseModal';
import {
  getGroupBalances,
  partialSettleSharedExpense,
  settlePersonInGroup,
  getAccountProfile,
  getMinimalGroupSettlements,
  getGroupMemberNetPositions,
  deleteSharedExpense,
  getFriendGroup,
  saveFriendGroup,
  addFriendGroupSyncEmail,
  removeFriendGroupSyncEmail,
  syncGroupWithEmail,
  applySyncUpdate,
  type SharedExpense,
  type FriendGroup,
  FREE_LIMITS
} from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { fetchMySyncUpdates, acknowledgeUpdate } from "@/integrations/firebase/sync";
import { useBannerAd } from '@/hooks/useBannerAd';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useAdFree } from '@/hooks/useAdFree';
import React from 'react';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';

export default function GroupDetailsPage() {
  useBannerAd();
  const { isPro } = useProGate();
  const { isAdFree } = useAdFree();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const currency = useCurrency();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [settlingTx, setSettlingTx] = useState<SharedExpense | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH'>('UPI');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingTx, setDeletingTx] = useState<SharedExpense | null>(null);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [newSyncEmail, setNewSyncEmail] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [mappingEmail, setMappingEmail] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempProfileName, setTempProfileName] = useState('');
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false); // To change manager manually if needed
  const [transferConfirmMember, setTransferConfirmMember] = useState<string | null>(null);
  const [mappingConfirmMember, setMappingConfirmMember] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');


  useEffect(() => {
    const handleUpdate = () => setRefreshKey(prev => prev + 1);
    window.addEventListener('splitmate_data_changed', handleUpdate);
    window.addEventListener('splitmate_friend_groups_changed', handleUpdate);
    return () => {
      window.removeEventListener('splitmate_data_changed', handleUpdate);
      window.removeEventListener('splitmate_friend_groups_changed', handleUpdate);
    };
  }, []);

  const group = useMemo(() => {
    void refreshKey;
    return getGroupBalances().find(g => g.groupId === groupId);
  }, [groupId, refreshKey]);

  const staticGroup = useMemo(() => {
    void refreshKey;
    return groupId ? getFriendGroup(groupId) : null;
  }, [groupId, refreshKey]);

  const accountName = useMemo(() => {
    void refreshKey;
    return getAccountProfile().name;
  }, [refreshKey]);

  const isManager = useMemo(() => {
    if (!staticGroup) return false;
    const myEmail = getAccountProfile().email?.toLowerCase() || '';
    // Primary: use stable email comparison
    if (staticGroup.managerEmail && myEmail) {
      return staticGroup.managerEmail.toLowerCase() === myEmail;
    }
    // Fallback for legacy groups without managerEmail
    return staticGroup.managerName === 'me' || !staticGroup.managerName;
  }, [staticGroup]);

  useEffect(() => {
    if (!groupId) navigate('/?tab=shared');
    else if (refreshKey > 0 && !group) navigate('/?tab=shared');
  }, [group, groupId, navigate, refreshKey]);

  const activeTransactions = useMemo(() =>
    group?.transactions.filter(tx => !tx.settled) || [], [group]);

  const historyTransactions = useMemo(() => {
    if (!group) return [];
    // Show ALL transactions in the History tab for a complete log, sorted by date
    return [...group.transactions].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [group]);

  // ALL members' net positions computed across ALL group transactions
  const memberNetBalances = useMemo(() => {
    if (!group) return [];
    const positions = getGroupMemberNetPositions(group.groupId);
    return Object.entries(positions)
      .map(([name, net]) => ({ name, net }))
      .sort((a, b) => b.net - a.net);
  }, [group]);

  // ALL simplified debts — every pair, not just involving 'me'
  const simplifiedDebts = useMemo(() => {
    if (!group) return [];
    return getMinimalGroupSettlements(group.groupId);
  }, [group]);

  const totalGroupSpend = useMemo(() => {
    if (!group) return 0;
    return group.transactions
      .filter(tx => tx.category !== 'Settlement')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [group]);

  // Dynamic name coloring
  const getNameColor = (name: string) => {
    const colors = ['text-violet-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-rose-500', 'text-cyan-500', 'text-indigo-500', 'text-orange-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getNameBg = (name: string) => {
    const colors = ['bg-violet-500/15', 'bg-blue-500/15', 'bg-emerald-500/15', 'bg-amber-500/15', 'bg-rose-500/15', 'bg-cyan-500/15', 'bg-indigo-500/15', 'bg-orange-500/15'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  if (!group) return null;

  const isMe = (name: string) => name === 'me';
  const label = (name: string) => isMe(name) ? accountName : name;

  const handleFullSettle = () => {
    if (!settlingTx || !staticGroup) return;

    if (!isManager) {
      toast.error("Permission Denied", { description: "Only the group manager can record settlements." });
      return;
    }

    const amount = settleAmount ? parseFloat(settleAmount) : settlingTx.amount;
    const date = new Date(settleDate).toISOString();

    if (settlingTx.id === 'BULK') {
      // BULK settlement from debt object: { from, to, amount }
      settlePersonInGroup(settlingTx.paidBy, settlingTx.forPerson, amount, groupId!, paymentMode, date);
    } else {
      // Direct expense settlement
      partialSettleSharedExpense(settlingTx.id, amount, paymentMode, date);
    }

    setSettlingTx(null);
    setSettleAmount('');
    setRefreshKey(prev => prev + 1); // Ensure UI refreshes
  };

  const handleRename = () => {
    if (!staticGroup || !newName.trim()) {
      setIsRenaming(false);
      return;
    }
    const cleanName = newName.trim();
    if (cleanName === staticGroup.name) {
      setIsRenaming(false);
      return;
    }

    saveFriendGroup({
      ...staticGroup,
      name: cleanName
    });

    setIsRenaming(false);
    toast.success("Group renamed", { description: `Group is now "${cleanName}"` });
    setRefreshKey(prev => prev + 1);
  };

  const handleAddMember = () => {
    if (!isManager) {
      toast.error("Permission Denied", { description: "You are not the group manager." });
      return;
    }
    if (!newMemberName.trim() || !group) return;
    const cleanName = newMemberName.trim();
    if (group.members.includes(cleanName) || cleanName.toLowerCase() === 'me') return;
    const nextMemberEmails = {
      ...(staticGroup?.memberEmails || {}),
      ...(newMemberEmail.trim() ? { [cleanName]: newMemberEmail.trim().toLowerCase() } : {}),
    };

    const saved = saveFriendGroup({
      ...staticGroup!,
      members: [...group.members, cleanName],
      memberEmails: nextMemberEmails,
    });

    if (!saved) return;

    setNewMemberName('');
    setNewMemberEmail('');
    setIsAddingMember(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-12 font-sans space-y-6">

      {/* Header */}
      <div className="pt-8 pb-2 space-y-4">
        {/* Main Row: Back | Title | Add Member */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/?tab=shared')}
            className="w-11 h-11 rounded-2xl bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>
          <div className="flex-1 text-center px-2">
            {isRenaming ? (
              <div className="flex items-center gap-2 max-w-[220px] mx-auto animate-in fade-in zoom-in-95 duration-200">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 bg-secondary/80 rounded-xl px-4 text-sm font-black uppercase tracking-tight border border-primary/30 outline-none focus:ring-2 ring-primary/10 transition-all shadow-inner"
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  placeholder="NEW GROUP NAME"
                />
                <button
                  onClick={handleRename}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-primary text-white rounded-xl shadow-lg shadow-primary/25 active:scale-90 transition-all border border-white/10"
                >
                  <Check size={18} strokeWidth={4} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 group/title">
                <h2 className="text-[28px] font-black tracking-tight uppercase italic truncate">
                  {group.name}
                </h2>
                {isManager && (
                  <button
                    onClick={() => {
                      setNewName(group.name);
                      setIsRenaming(true);
                    }}
                    className="w-8 h-8 rounded-lg bg-secondary/0 hover:bg-secondary/50 text-muted-foreground/30 hover:text-primary flex items-center justify-center transition-all opacity-0 group-hover/title:opacity-100"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {isManager ? (
            <button
              onClick={() => isRenaming ? setIsRenaming(false) : setIsAddingMember(true)}
              className={cn(
                "w-11 h-11 rounded-2xl border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm group shrink-0",
                isRenaming ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-secondary/80"
              )}
            >
              {isRenaming ? <X size={20} strokeWidth={3} /> : <UserPlus size={18} strokeWidth={2.5} className="group-hover:text-primary transition-colors" />}
            </button>
          ) : (
            <div className="w-11 h-11" /> // Spacer
          )}
        </div>

        {/* Member Pills */}
        <div className="flex flex-wrap justify-center gap-2 max-w-full mx-auto">
          {group.members
            .filter(m => m.toLowerCase() !== 'me' && m.toLowerCase() !== accountName.toLowerCase())
            .map(member => {
              const email = staticGroup?.memberEmails?.[member];
              const isManager = staticGroup?.managerName === member;
              return (
                <div
                  key={member}
                  className="px-3.5 py-1.5 rounded-full bg-secondary/30 border border-border/5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/80 flex items-center gap-2 transition-colors"
                >
                  <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[7px] text-white", getNameBg(member))}>
                    {member.charAt(0).toUpperCase()}
                  </div>
                  {member}
                  {email && <span className="w-1 h-1 rounded-full bg-primary animate-pulse" title={email} />}
                  {isManager && <span className="text-[7px] text-primary/60 border border-primary/20 px-1 rounded-sm leading-none ml-1">MGR</span>}
                </div>
              );
            })}
          <div className="px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-2 shadow-sm shadow-primary/5">
            <div className="w-4 h-4 rounded-full bg-primary/40 flex items-center justify-center text-[7px] text-white">
              {accountName.charAt(0).toUpperCase()}
            </div>
            {accountName} (You)
            {(staticGroup?.managerName === accountName || !staticGroup?.managerName) && <span className="text-[7px] bg-primary text-white px-1 rounded-sm leading-none ml-1">MGR</span>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-secondary/10 p-5 rounded-[2.5rem] border border-border/5 flex flex-col items-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-30 italic mb-1">My Impact</p>
          <MoneyDisplay amount={group.netBalance} size="md" showSign className={cn("font-black tracking-tighter", group.netBalance > 0 ? "text-green-500" : group.netBalance < 0 ? "text-rose-500" : "text-muted-foreground")} />
        </div>
        <div className="bg-secondary/10 p-5 rounded-[2.5rem] border border-border/5 flex flex-col items-center justify-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-30 italic mb-1">Total Spend</p>
          <MoneyDisplay amount={totalGroupSpend} size="md" className="font-black tracking-tighter text-foreground" />
        </div>
      </div>


      {/* Tabs */}
      <div className="flex items-center justify-center pt-2">
        <div className="flex p-1 bg-secondary/20 rounded-[1.5rem] border border-border/5 w-64">
          <button onClick={() => setActiveTab('active')} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'active' ? "bg-background text-primary shadow-sm" : "text-muted-foreground/60")}>
            <LayoutGrid size={12} strokeWidth={3} /> Active
          </button>
          <button onClick={() => setActiveTab('history')} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'history' ? "bg-background text-primary shadow-sm" : "text-muted-foreground/60")}>
            <History size={12} strokeWidth={3} /> History
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2.5">
        {activeTab === 'active' ? (
          memberNetBalances.length === 0 ? (
            <div className="p-12 text-center opacity-30 border-2 border-dashed border-border/10 rounded-[2.5rem]">
              <p className="font-black uppercase tracking-[0.2em] text-[10px] italic">No active activity</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Merged Member Balances & Settlements */}
              <div className="space-y-4">
                <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 opacity-50 italic">Member Balances</h3>
                {memberNetBalances.map(m => {
                  const mine = isMe(m.name);
                  const displayLabel = mine ? accountName : m.name;

                  // Find if there's a simplified debt involving me for this person
                  const debt = simplifiedDebts.find(d =>
                    (isMe(d.from) && d.to === m.name) ||
                    (isMe(d.to) && d.from === m.name)
                  ); return (
                    <div
                      key={m.name}
                      className={cn(
                        "flex items-center justify-between px-6 py-4 rounded-[2rem] border transition-all",
                        mine ? "bg-primary/5 border-primary/20 shadow-sm shadow-primary/5" : "bg-secondary/10 border-border/10 shadow-sm",
                        debt && isManager && "border-primary/10 shadow-lg shadow-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-[1.25rem] flex items-center justify-center font-black text-xs shadow-sm shrink-0",
                          mine ? "bg-primary/20 text-primary" : `${getNameBg(m.name)} ${getNameColor(m.name)}`
                        )}>
                          {displayLabel.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <p className={cn("text-[13px] font-black uppercase tracking-tight leading-none truncate", mine ? "text-primary" : "text-foreground")}>{displayLabel}</p>
                          {mine ? (
                            <p className="text-[8px] font-black uppercase tracking-widest text-primary/40 mt-1.5 italic">You</p>
                          ) : debt ? (
                            <p className="text-[9px] font-black uppercase tracking-widest mt-1.5 italic leading-none">
                              {isMe(debt.from) ? (
                                <span className="opacity-40">You owe <span className="text-foreground not-italic">{debt.to}</span></span>
                              ) : (
                                <span className="text-foreground not-italic">{debt.from} <span className="opacity-70 not-italic italic-0">Gives</span> <span className="text-green-500">You</span></span>
                              )}
                            </p>
                          ) : m.net !== 0 ? (
                            <p className="text-[8px] font-black uppercase tracking-widest mt-1.5 opacity-40 italic">
                              {m.net > 0 ? "Indirectly owed" : "Indirectly owes"}
                            </p>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                              <p className="text-[8px] font-black uppercase tracking-widest opacity-30 italic leading-none">Status: Settled</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <MoneyDisplay
                            amount={debt ? debt.amount : Math.abs(m.net)}
                            size="sm"
                            showSign={false}
                            className={cn(
                              "font-black tracking-tight",
                              debt
                                ? (isMe(debt.from) ? "text-rose-500" : "text-green-500")
                                : (m.net > 0.005 ? "text-green-500/40" : m.net < -0.005 ? "text-rose-500/40" : "text-muted-foreground/30")
                            )}
                          />
                        </div>

                        {debt && (
                          <div
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isManager) return;
                              const fromMe = isMe(debt.from);
                              const targetPerson = fromMe ? debt.to : debt.from;
                              setSettlingTx({
                                id: 'BULK',
                                personName: targetPerson,
                                amount: debt.amount,
                                paidBy: debt.from,
                                forPerson: debt.to,
                                reason: 'Group Settlement',
                                date: new Date().toISOString(),
                                createdAt: new Date().toISOString(),
                                settled: false,
                                groupId: group.groupId
                              });
                            }}
                            className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-all border border-white/5 shrink-0",
                              isManager
                                ? (isMe(debt.from) ? "bg-rose-500 shadow-rose-500/20 text-white cursor-pointer active:scale-90" : "bg-primary shadow-primary/20 text-white cursor-pointer active:scale-90")
                                : "bg-secondary/40 text-muted-foreground/30 opacity-50 cursor-not-allowed"
                            )}
                          >
                            <Check size={14} strokeWidth={4} />
                          </div>
                        )}
                        {!debt && m.net !== 0 && (
                          <div className="w-8 h-8 rounded-xl bg-secondary/20 flex items-center justify-center text-muted-foreground/40 shrink-0 border border-border/5">
                            <Clock size={14} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          historyTransactions.length === 0 ? (
            <div className="p-12 text-center opacity-30 border-2 border-dashed border-border/10 rounded-[2.5rem]">
              <p className="font-black uppercase tracking-[0.2em] text-[10px] italic">No history activity</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 opacity-50 italic">Group Transactions</h3>
              {historyTransactions.map((tx, idx) => {
                const isSettlement = tx.category === 'Settlement';
                const payer = tx.paidBy === 'me' ? 'me' : tx.paidBy;
                const payerLabel = isMe(payer) ? accountName : payer;

                return (
                  <div key={tx.id} className="contents shadow-none">
                    <div className={cn(
                      "p-6 rounded-[2.5rem] border transition-all",
                      tx.settled ? "bg-secondary/5 border-border/5 opacity-60" : "bg-card border-border/10 shadow-sm"
                    )}>
                      <div className="flex items-center gap-5">
                        {/* Left: Avatar */}
                        <div className={cn(
                          "w-12 h-12 rounded-[1.5rem] flex items-center justify-center font-black text-sm shrink-0 shadow-lg border border-white/5",
                          isSettlement ? "bg-green-500/10 text-green-500" : `${getNameBg(payerLabel)} ${getNameColor(payerLabel)}`
                        )}>
                          {payerLabel.charAt(0).toUpperCase()}
                        </div>

                        {/* Middle: Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className={cn(
                            "text-[10px] font-black uppercase tracking-widest leading-none mb-1.5 opacity-40",
                            getNameColor(isMe(payer) ? accountName : payer)
                          )}>
                            {isMe(payer) ? accountName : payer} <span className="text-foreground/30 lowercase italic-0 not-italic ml-0.5">paid for</span>
                          </p>

                          <h4 className="text-[13px] font-black uppercase italic tracking-tight text-foreground truncate mb-1">
                            {tx.reason}
                          </h4>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/60 font-mono">
                              {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {tx.settled && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[8px] font-black uppercase italic">
                                <Check size={8} strokeWidth={5} /> Settled
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Info & Actions */}
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <div className="text-right">
                            <MoneyDisplay
                              amount={tx.amount}
                              size="md"
                              className={cn("font-black tracking-tighter", tx.settled ? "text-muted-foreground/30 text-sm" : "text-rose-500 text-lg")}
                            />
                            {isSettlement && <p className="text-[7px] font-black text-green-500/50 uppercase tracking-[0.2em] italic">Cleared</p>}
                            {tx.forPerson === 'all' && tx.splitParticipants && !isSettlement && (
                              <p className="text-[7px] font-black text-muted-foreground/20 uppercase tracking-[0.1em]">
                                Split·{tx.splitParticipants.length}
                              </p>
                            )}
                          </div>

                          {(tx.createdByMe !== false && !tx.isIncoming) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingTx(tx);
                              }}
                              className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-500/60 hover:bg-rose-500/20 hover:text-rose-500 transition-all flex items-center justify-center active:scale-90 border border-transparent hover:border-rose-500/20"
                            >
                              <Trash2 size={16} strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
      {/* Delete Confirmation Sheet (Matches Shared Tab Style) */}
      {deletingTx && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setDeletingTx(null)}>
          <div
            className="w-full max-w-md bg-card rounded-[3rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 duration-300 shadow-2xl relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4 text-rose-500">
                <Trash2 size={28} strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-black tracking-tight uppercase italic leading-none">Delete Entry?</h2>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-40">
                This action is irreversible
              </p>
            </div>

            <div className="p-5 rounded-[2rem] bg-secondary/20 border border-white/5 space-y-1 text-center">
              <p className="text-[8px] font-black uppercase text-rose-500/40 tracking-[0.2em] italic mb-1">Transaction Details</p>
              <p className="text-sm font-black uppercase truncate">{deletingTx.reason}</p>
              <p className="text-lg font-black text-rose-500 tracking-tighter">{currency.symbol}{deletingTx.amount}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setDeletingTx(null)}
                className="w-full h-14 rounded-2xl bg-secondary/40 font-black text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteSharedExpense(deletingTx.id);
                  setDeletingTx(null);
                  setRefreshKey(prev => prev + 1);
                }}
                className="w-full h-14 rounded-2xl bg-rose-500 text-white font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-rose-500/20 hover:brightness-110 active:scale-[0.97] transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settlement Modal (Compact Floating Sheet) */}
      {settlingTx && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500 pointer-events-auto p-4 pb-10" onClick={() => setSettlingTx(null)}>
          <div
            className="w-full max-w-sm bg-card rounded-[2.5rem] p-6 pt-3 space-y-5 animate-in slide-in-from-bottom duration-700 border border-white/10 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-12 h-1 rounded-full bg-muted-foreground/20 mb-2 shrink-0" />

            <button onClick={() => setSettlingTx(null)} className="absolute top-6 right-6 w-9 h-9 rounded-full bg-secondary/40 flex items-center justify-center active:scale-90 transition-all text-foreground border border-white/10">
              <X size={16} strokeWidth={3} />
            </button>

            <div className="text-center space-y-1.5 pt-2">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-2 text-primary shadow-lg border border-primary/20">
                <CheckCircle2 size={24} strokeWidth={2.5} />
              </div>
              <h2 className="text-lg font-black tracking-tight uppercase italic leading-none">Settle Bill</h2>
              <div className="flex items-center justify-center gap-2 mt-1">
                <p className="text-[9px] font-black text-foreground/60 uppercase tracking-widest">{settlingTx.personName}</p>
                <span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
                <p className="text-[9px] font-black text-foreground/40 uppercase tracking-widest">{group.name}</p>
              </div>
            </div>

            <div className="w-full rounded-[2rem] py-5 px-6 bg-secondary/20 border border-white/5 text-center relative overflow-hidden group shadow-inner">
              <div className="absolute inset-0 bg-primary/5 opacity-40" />
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-primary mb-2 italic">Outstanding Balance</p>
              <MoneyDisplay amount={settlingTx.amount} size="lg" className="font-black text-3xl tracking-tighter text-foreground" />
            </div>

            <div className="w-full space-y-4">
              <div className="flex p-1.5 bg-secondary/10 rounded-[1.25rem] border border-white/5">
                {(['UPI', 'CASH'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={cn(
                      "flex-1 py-2.5 rounded-[1rem] text-[10px] font-black uppercase tracking-[0.1em] transition-all",
                      paymentMode === mode ? "bg-background text-primary shadow-xl border border-white/5" : "text-foreground/40"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] font-black uppercase tracking-widest text-foreground/50 px-2 italic">Date</span>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={e => setSettleDate(e.target.value)}
                    className="w-full h-12 px-4 rounded-[1rem] bg-secondary/20 border border-white/10 outline-none font-black text-[10px] text-foreground uppercase focus:border-primary/40 text-center"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[8px] font-black uppercase tracking-widest text-foreground/50 px-2 italic">Amount</span>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[10px] text-foreground/30">{currency.symbol}</span>
                    <input
                      type="number"
                      placeholder={settlingTx.amount.toString()}
                      value={settleAmount}
                      onChange={e => setSettleAmount(e.target.value)}
                      className="w-full h-12 pl-8 pr-4 rounded-[1rem] bg-secondary/20 border border-white/10 outline-none focus:border-primary/40 font-black text-xs text-center"
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleFullSettle}
                className="w-full h-14 rounded-[1.5rem] bg-primary text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(var(--primary),0.4)] active:scale-95 transition-all flex items-center justify-center gap-2 group"
              >
                Confirm Settlement
                <Check size={16} strokeWidth={4} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            <p className="text-[7.5px] text-center text-foreground/30 font-black uppercase tracking-[0.2em] px-8 leading-relaxed italic">
              Auto-filling <span className="text-primary/100">{currency.symbol}{settlingTx.amount}</span> if blank
            </p>
          </div>
        </div>,
        document.body
      )}

      {/* Add Member Modal */}
      {isAddingMember && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto" onClick={() => setIsAddingMember(false)}>
          <div className="w-full max-w-sm bg-card rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 border border-border/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-[1.75rem] bg-primary/10 flex items-center justify-center mx-auto mb-4 font-black"><UserPlus size={32} className="text-primary" /></div>
              <h2 className="text-xl font-black uppercase italic tracking-tight">Add Member</h2>
              <p className="text-[10px] font-black text-muted-foreground uppercase opacity-40">Expand your squad</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 px-2 italic">Name</span>
                  <input type="text" placeholder="Enter new name..." value={newMemberName} onChange={e => setNewMemberName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleAddMember()} className="w-full h-14 px-6 rounded-2xl bg-secondary/10 border border-border/10 outline-none focus:border-primary/40 font-black text-sm uppercase tracking-tight" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 px-2 italic">Gmail (Optional)</span>
                  <input type="email" placeholder="Optional Gmail for sync..." value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMember()} className="w-full h-14 px-6 rounded-2xl bg-secondary/10 border border-border/10 outline-none focus:border-primary/40 font-black text-sm uppercase tracking-tight" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsAddingMember(false)} className="flex-1 h-12 rounded-xl bg-secondary/20 font-black text-[10px] uppercase tracking-widest">Cancel</button>
                <button onClick={handleAddMember} disabled={!newMemberName.trim()} className="flex-[1.5] h-12 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-30 shadow-lg shadow-primary/20">Confirm</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Profile Name Edit Modal */}
      {isEditingProfile && createPortal(
        <div className="fixed inset-0 z-[10005] flex items-center justify-center p-6 bg-black/70 backdrop-blur-xl animate-in fade-in duration-300 pointer-events-auto" onClick={() => setIsEditingProfile(false)}>
          <div className="w-full max-w-sm bg-card rounded-[3rem] p-8 space-y-6 animate-in zoom-in-95 border border-border/10 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-[1.75rem] bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Link2 size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-black uppercase italic tracking-tight">Identity Settings</h2>
              <p className="text-[10px] font-black text-muted-foreground uppercase opacity-40 leading-relaxed px-4">This name will be broadcast to others in cloud groups.</p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 px-2 italic">Global Display Name</span>
                <input
                  type="text"
                  placeholder="Your Name..."
                  value={tempProfileName}
                  onChange={(e) => setTempProfileName(e.target.value)}
                  autoFocus
                  className="w-full h-14 px-6 rounded-2xl bg-secondary/10 border border-border/10 outline-none focus:border-primary/40 font-black text-sm uppercase tracking-tight"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsEditingProfile(false)} className="flex-1 h-12 rounded-xl bg-secondary/20 font-black text-[10px] uppercase tracking-widest">Cancel</button>
                <button
                  onClick={() => {
                    const profile = getAccountProfile();
                    profile.name = tempProfileName.trim();
                    // Save globally
                    localStorage.setItem('splitmate_account_profile', JSON.stringify(profile));
                    // Update manager name if I'm the manager of this group
                    if (staticGroup.managerName === accountName) {
                      staticGroup.managerName = profile.name;
                      const groups = JSON.parse(localStorage.getItem('splitmate_friend_groups') || '[]') as FriendGroup[];
                      const idx = groups.findIndex((g: FriendGroup) => g.id === groupId);
                      if (idx >= 0) {
                        groups[idx].managerName = profile.name;
                        localStorage.setItem('splitmate_friend_groups', JSON.stringify(groups));
                      }
                    }
                    window.dispatchEvent(new Event('splitmate_data_changed'));
                    window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
                    toast.success("Profile Updated", { description: "Your new identity will be shared with others." });
                    setIsEditingProfile(false);
                  }}
                  className="flex-[1.5] h-12 rounded-xl bg-primary text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20"
                >
                  Save Identity
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Map Email to Existing Member Modal */}
      {mappingEmail && !mappingConfirmMember && !transferConfirmMember && createPortal(
        <div className="fixed inset-0 z-[10005] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto" onClick={() => setMappingEmail(null)}>
          <div className="w-full max-w-sm bg-card rounded-[3rem] overflow-hidden animate-in zoom-in-95 border border-border/10 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="p-8 pb-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary">
                <Link2 size={28} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black uppercase italic tracking-tight">Sync Settings</h2>
                <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest truncate px-4">{mappingEmail}</p>
              </div>
            </div>

            <div className="px-6 pb-2">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-4 mb-3 italic">Identify this collaborator</p>
              <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto px-1 pb-4 no-scrollbar">
                {staticGroup.members
                  .filter(m => m.toLowerCase() !== 'me' && m.toLowerCase() !== (accountName || '').toLowerCase())
                  .filter(m => {
                    const linkedEmail = staticGroup.memberEmails?.[m];
                    return !linkedEmail || linkedEmail === mappingEmail;
                  })
                  .map(member => {
                    const isLinked = staticGroup.memberEmails?.[member] === mappingEmail;
                    return (
                      <div key={member} className="relative group/member">
                        <button
                          onClick={() => {
                            setMappingConfirmMember(member);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98]",
                            isLinked
                              ? "bg-primary/10 border-primary/30 shadow-[0_10px_30px_-10px_rgba(var(--primary-rgb),0.3)]"
                              : "bg-secondary/10 border-border/5 hover:bg-secondary/20"
                          )}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-black text-[11px] text-white shadow-sm border border-white/5", getNameBg(member))}>
                              {member.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col items-start min-w-0">
                              <span className="text-[12px] font-black uppercase tracking-tight leading-none truncate w-full">{member}</span>
                              {isLinked && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_5px_rgba(34,197,94,0.5)] animate-pulse" />
                                  <span className="text-[7px] font-black uppercase tracking-widest text-primary/60 italic leading-none">Linked Account</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {isLinked && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransferConfirmMember(member);
                                setMappingEmail(null);
                              }}
                              title="Promote this linked member to Manager"
                              className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0 border border-white/10 animate-in zoom-in-50 duration-300 hover:scale-110 active:scale-95 transition-all"
                            >
                              <Check size={20} className="text-white" strokeWidth={5} />
                            </button>
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="p-6 pt-0 space-y-2">
              <button
                onClick={() => {
                  removeFriendGroupSyncEmail(staticGroup.id, mappingEmail);
                  setMappingEmail(null);
                  toast.success("Account Removed", { description: "Collaborator removed from sync list." });
                }}
                className="w-full h-12 rounded-2xl bg-rose-500/10 text-rose-500 font-black text-[9px] uppercase tracking-widest border border-rose-500/10 hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Remove Account from Sync
              </button>
              <button
                onClick={() => setMappingEmail(null)}
                className="w-full h-12 rounded-2xl bg-secondary/15 text-muted-foreground font-black text-[9px] uppercase tracking-widest hover:bg-secondary/25 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="pt-8 pb-4 text-center">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground/10 italic">The Group feature is still in development</p>
      </div>

      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsExpenseModalOpen(true)}
          className="w-16 h-16 rounded-[2rem] bg-primary text-white flex items-center justify-center shadow-2xl shadow-primary/40 active:scale-90 transition-all border-4 border-background"
        >
          <Plus size={32} strokeWidth={3} />
        </button>
      </div>

      {/* Group Expense Modal */}
      <GroupExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        defaultGroupId={groupId}
        onAdd={() => {
          setRefreshKey(prev => prev + 1);
        }}
      />
      {/* Mapping Confirmation Sheet */}
      {mappingConfirmMember && mappingEmail && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setMappingConfirmMember(null)}>
          <div
            className="w-full max-w-sm bg-card rounded-[3rem] p-7 pt-9 pb-10 space-y-6 animate-in slide-in-from-bottom-10 duration-300 shadow-2xl relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary shadow-inner">
                <Link2 size={28} strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-black tracking-tight uppercase italic leading-none">Confirm Identity?</h2>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-40">
                Link this member to the sync seat
              </p>
            </div>

            <div className="p-5 rounded-[2rem] bg-secondary/20 border border-white/5 space-y-2 text-center">
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[9px] font-black uppercase text-primary/40 tracking-widest italic mb-0.5">Email to Recognize</p>
                <span className="text-[12px] font-black italic bg-primary/10 text-primary px-3 py-1 rounded-lg border border-primary/10 truncate max-w-full">{mappingEmail}</span>
                <div className="w-4 h-4 bg-primary/10 rounded-full flex items-center justify-center my-1">
                  <Check size={8} className="text-primary" strokeWidth={5} />
                </div>
                <p className="text-sm font-black uppercase text-foreground">{mappingConfirmMember}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setMappingConfirmMember(null)}
                className="w-full h-14 rounded-2xl bg-secondary/40 font-black text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const groups = JSON.parse(localStorage.getItem('splitmate_friend_groups') || '[]') as FriendGroup[];
                  const cg = groups.find((g: FriendGroup) => g.id === groupId);
                  if (cg) {
                    if (!cg.memberEmails) cg.memberEmails = {};
                    cg.memberEmails[mappingConfirmMember] = mappingEmail.trim().toLowerCase();
                    localStorage.setItem('splitmate_friend_groups', JSON.stringify(groups));
                    window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
                    toast.success("Identity Linked", {
                      description: `${mappingConfirmMember} recognized in cloud sync.`,
                      icon: <Check className="text-success" size={14} />
                    });
                  }
                  setMappingConfirmMember(null);
                  setMappingEmail(null);
                }}
                className="w-full h-14 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-primary/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Transfer Manager Confirmation Sheet */}
      {transferConfirmMember && createPortal(
        <div className="fixed inset-0 z-[10004] flex items-end justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setTransferConfirmMember(null)}>
          <div
            className="w-full max-w-sm bg-card rounded-[3rem] p-8 pt-10 pb-12 space-y-6 animate-in slide-in-from-bottom-10 duration-400 shadow-2xl relative overflow-hidden border border-white/5"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-4" />

            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6 text-amber-500 shadow-inner border border-amber-500/10">
                <AlertCircle size={36} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black tracking-tight uppercase italic leading-none text-amber-500">Admin Transfer</h2>
              <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] px-4">
                You are about to transfer full control of this group
              </p>
            </div>

            <div className="p-6 rounded-[2.5rem] bg-amber-500/5 border border-amber-500/10 space-y-3 text-center">
              <p className="text-[9px] font-black uppercase text-amber-500/40 tracking-widest italic leading-relaxed">
                {transferConfirmMember} will become the new manager. You will lose all administrative rights.
              </p>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
                <Plus size={20} className="rotate-45" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setTransferConfirmMember(null)}
                className="w-full h-14 rounded-2xl bg-secondary/40 font-black text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 active:scale-[0.96] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const groups = JSON.parse(localStorage.getItem('splitmate_friend_groups') || '[]') as FriendGroup[];
                  const cg = groups.find((g: FriendGroup) => g.id === groupId);
                  if (cg && transferConfirmMember) {
                    cg.managerName = transferConfirmMember;
                    // Set managerEmail so other devices can resolve the manager by email
                    const memberEmail = cg.memberEmails?.[transferConfirmMember];
                    if (memberEmail) cg.managerEmail = memberEmail;
                    localStorage.setItem('splitmate_friend_groups', JSON.stringify(groups));
                    window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
                    toast.info("Manager Transferred", {
                      description: `${transferConfirmMember} is now the administrator.`,
                      duration: 5000
                    });
                  }
                  setTransferConfirmMember(null);
                  setMappingEmail(null);
                }}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-amber-500/20 active:scale-[0.96] transition-all px-2 text-center leading-none"
              >
                Transfer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
