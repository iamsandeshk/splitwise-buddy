import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { User, Tag, Wallet, ChevronLeft, Plus, X, Users, Check, Search, FolderPlus, History, Trash2, AlertTriangle } from 'lucide-react';
import { saveSharedExpense, generateId, getUniquePersonNames, EXPENSE_CATEGORIES, getCurrency, type SharedExpense, getFriendGroups, saveFriendGroup, type FriendGroup, getFriendGroup, getAccountProfile, deleteFriendGroup, getDefaultAccountId, getAccounts } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { pushUpdateToCloud } from '@/integrations/firebase/sync';
import { useBannerAd } from '@/hooks/useBannerAd';

interface GroupExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
  defaultGroupId?: string;
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

const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16'
];

type Step = 'select_group' | 'add_expense';

export function GroupExpenseModal({ isOpen, onClose, onAdd, defaultGroupId }: GroupExpenseModalProps) {
  const { toast } = useToast();
  useBannerAd(isOpen);
  const [step, setStep] = useState<Step>('select_group');
  const [groups, setGroups] = useState<FriendGroup[]>([]);

  // Group selection/creation state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [participants, setParticipants] = useState<string[]>(['me']);
  const [newPersonName, setNewPersonName] = useState('');

  // Expense details state
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paidBy, setPaidBy] = useState<string>('me');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<FriendGroup | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const personInputRef = useRef<HTMLInputElement>(null);

  const currency = getCurrency();
  const existingPersonNames = getUniquePersonNames().filter(name => !participants.includes(name));

  useEffect(() => {
    if (isOpen) {
      const allGroups = getFriendGroups();
      setGroups(allGroups);
      setAmount('');
      setReason('');
      setCategory(EXPENSE_CATEGORIES[0]);
      setPaidBy('me');
      setNewPersonName('');
      setDate(new Date().toISOString().split('T')[0]);

      if (defaultGroupId) {
        const found = allGroups.find(g => g.id === defaultGroupId);
        if (found) {
          setSelectedGroupId(found.id);
          setGroupName(found.name);
          setParticipants(found.members);
          setStep('add_expense');
          return;
        }
      }

      setStep('select_group');
      setSelectedGroupId(null);
      setGroupName('');
      setParticipants(['me']);
    }
  }, [isOpen, defaultGroupId]);

  useEffect(() => {
    if (step === 'add_expense') {
      setTimeout(() => amountRef.current?.focus(), 150);
    }
  }, [step]);

  if (!isOpen) return null;

  const handleSelectGroup = (group: FriendGroup) => {
    setSelectedGroupId(group.id);
    setGroupName(group.name);
    setParticipants(group.members);
    setStep('add_expense');
  };

  const handleDeleteGroup = (group: FriendGroup) => {
    deleteFriendGroup(group.id);
    setGroups(getFriendGroups());
    setDeleteConfirmGroup(null);
    toast({ title: "Group deleted successfully" });
  };

  const handleCreateNewGroup = () => {
    if (!groupName.trim() || participants.length < 2) return;

    const newGroup: FriendGroup = {
      id: generateId(),
      name: groupName.trim(),
      members: participants,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      createdAt: new Date().toISOString()
    };

    const saved = saveFriendGroup(newGroup);
    if (!saved) return;
    setSelectedGroupId(newGroup.id);
    setStep('add_expense');
  };

  const handleAddPerson = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newPersonName.trim();
    if (!name || participants.includes(name)) {
      setNewPersonName('');
      return;
    }
    setParticipants([...participants, name]);
    setNewPersonName('');
    personInputRef.current?.focus();
  };

  const removeParticipant = (name: string) => {
    if (name === 'me') return;
    const next = participants.filter(p => p !== name);
    setParticipants(next);
    if (paidBy === name) setPaidBy('me');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || participants.length < 2) return;

    setIsSubmitting(true);
    const totalAmount = parseFloat(amount);

    // Save ONE single record with forPerson: 'all' and splitParticipants
    // This is what getGroupMemberNetPositions expects to compute all members' balances correctly
    const record: SharedExpense = {
      id: generateId(),
      amount: totalAmount,
      reason: reason.trim() || category || 'Group Expense',
      paidBy: paidBy,                    // whoever paid ('me' or a member name)
      forPerson: 'all',                  // signals a group split
      personName: paidBy === 'me' ? (participants.find(p => p !== 'me') || 'Group') : paidBy,
      date,
      createdAt: new Date().toISOString(),
      settled: false,
      category: category || undefined,
      groupId: selectedGroupId || undefined,
      splitParticipants: [...participants], // ALL members including payer — math handles the payer's own share
      accountId: paidBy === 'me' ? (getDefaultAccountId() || getAccounts()[0]?.id || undefined) : undefined,
    };

    const saved = saveSharedExpense(record);
    if (!saved) {
      setIsSubmitting(false);
      return;
    }

    // 🔥 Sync to cloud if group has syncEmails
    const group = selectedGroupId ? getFriendGroup(selectedGroupId) : null;
    const myProfile = getAccountProfile();
    if (group?.syncEmails && group.syncEmails.length > 0 && myProfile.email) {
      import('@/lib/storage').then(({ getPersonProfiles }) => {
        const profiles = getPersonProfiles() as Record<string, any>;
        
        group.syncEmails.forEach(email => {
          let peerNameInMyList = 'friend';
          const p = Object.values(profiles).find(p => p.email?.toLowerCase() === email.toLowerCase());
          if (p) peerNameInMyList = p.name;

          const mapName = (name: string) => {
             if (name === 'me') return myProfile.name;
             if (name === peerNameInMyList) return 'me';
             return name;
          };

          const inverseRecord: SharedExpense = {
            ...record,
            id: record.id,
            personName: myProfile.name,
            paidBy: mapName(record.paidBy),
            forPerson: record.forPerson === 'all' ? 'all' : mapName(record.forPerson),
            fromEmail: myProfile.email,
            splitParticipants: record.splitParticipants?.map(mapName),
          };

          const groupMembersMapped = group.members.map(m => m === 'me' ? myProfile.name : m);

          pushUpdateToCloud({
            id: generateId(),
            fromName: myProfile.name,
            fromEmail: myProfile.email,
            groupName: group.name,
            groupMembers: groupMembersMapped,
            syncEmails: Array.from(new Set([myProfile.email, ...group.syncEmails])),
            expense: inverseRecord,
            type: 'added',
            timestamp: new Date().toISOString()
          }, email);
        });
      });
    }

    toast({
      title: "Group Expense Added",
      description: `${currency.symbol}${totalAmount} split among ${participants.length} people in ${groupName}.`,
    });

    setIsSubmitting(false);
    onAdd();
    onClose();
  };

  const splitAmountVal = amount ? (parseFloat(amount) / participants.length).toLocaleString(currency.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0';

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-background animate-in slide-in-from-bottom-10 duration-500 font-sans">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <button
          type="button"
          onClick={step === 'add_expense' && !selectedGroupId ? () => setStep('select_group') : onClose}
          className="w-11 h-11 rounded-[1.25rem] bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-black tracking-widest uppercase">
            {step === 'select_group' ? 'Select Group' : groupName}
          </h1>
          <p className="text-[10px] text-muted-foreground font-bold italic opacity-60">
            {step === 'select_group' ? 'Choose where to split' : (selectedGroupId ? 'Persistent Group' : 'New Group')}
          </p>
        </div>
        <div className="w-11" />
      </div>

      <div className="flex-1 overflow-y-auto pt-4">
        <div className="px-5 pb-10 space-y-8 max-w-lg mx-auto w-full">

          {step === 'select_group' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Existing Groups */}
              {groups.length > 0 && (
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-widest px-1 flex items-center gap-2">
                    <History size={14} /> My Groups
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {groups.map(group => (
                      <div
                        key={group.id}
                        className="flex items-center gap-4 p-4 rounded-[2rem] bg-card border border-border/20 shadow-sm transition-all text-left relative group"
                      >
                        <button
                          className="absolute inset-x-0 inset-y-0 w-full h-full opacity-0"
                          onClick={() => handleSelectGroup(group)}
                        />
                        <div
                          className="w-12 h-12 rounded-[1.25rem] flex items-center justify-center text-white font-black text-lg shadow-lg flex-shrink-0"
                          style={{ backgroundColor: group.color }}
                        >
                          {group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 pointer-events-none">
                          <h3 className="font-bold text-sm truncate">{group.name}</h3>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                            {group.members.length} members • {group.members.filter(m => m !== 'me').join(', ')}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmGroup(group);
                          }}
                          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10 active:scale-90 transition-all z-10"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Create New Flow */}
              <div className="space-y-6">
                <label className="text-[11px] font-black text-muted-foreground/60 uppercase tracking-widest px-1 flex items-center gap-2">
                  <FolderPlus size={14} /> New Custom Split
                </label>

                <div className="space-y-4 bg-secondary/10 p-5 rounded-[2.5rem] border border-dashed border-border/30">
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Group Name (e.g. Goa Trip)"
                      className="w-full h-14 px-6 rounded-[1.5rem] text-sm font-bold bg-background border border-border/20 focus:border-primary/50 outline-none transition-all shadow-sm"
                    />
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex flex-wrap gap-2 min-h-[40px]">
                      {participants.map((p) => (
                        <div
                          key={p}
                          className={cn(
                            "flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition-all",
                            p === 'me'
                              ? "bg-violet-600 text-white border-violet-500 shadow-md"
                              : "bg-background text-foreground border-border/40"
                          )}
                        >
                          <span className="capitalize">{p === 'me' ? '🙋 You' : p}</span>
                          {p !== 'me' && (
                            <button onClick={() => removeParticipant(p)} className="hover:text-destructive active:scale-75 transition-all">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleAddPerson} className="relative">
                      <input
                        ref={personInputRef}
                        type="text"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        placeholder="Add person name..."
                        className="w-full pl-12 pr-12 h-14 rounded-[1.5rem] text-sm font-semibold bg-background border border-border/20 focus:border-primary/50 outline-none transition-all shadow-sm"
                        list="group-names-modal"
                      />
                      <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/30" />
                      <button
                        type="submit"
                        disabled={!newPersonName.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-all disabled:opacity-0"
                      >
                        <Plus size={20} strokeWidth={3} />
                      </button>
                      <datalist id="group-names-modal">
                        {existingPersonNames.map(name => <option key={name} value={name} />)}
                      </datalist>
                    </form>

                    <button
                      onClick={handleCreateNewGroup}
                      disabled={!groupName.trim() || participants.length < 2}
                      className="w-full h-14 rounded-[1.5rem] bg-foreground text-background font-black text-sm uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-20 shadow-xl"
                    >
                      Start This Group
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'add_expense' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Amount Section */}
              <div className="text-center pt-4">
                <p className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mb-4">Entry Amount</p>
                <div className="inline-flex items-center justify-center gap-1">
                  <span className="text-3xl font-black text-primary/30">{currency.symbol}</span>
                  <input
                    ref={amountRef}
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="text-5xl font-black bg-transparent border-none outline-none text-center text-foreground w-48 placeholder:text-muted-foreground/10 tracking-tighter"
                    style={{ caretColor: 'hsl(var(--primary))' }}
                  />
                </div>
                {participants.length > 1 && (
                  <div className="mt-6 flex justify-center">
                    <p className="text-[11px] font-black text-primary bg-primary/5 px-6 py-2.5 rounded-full border border-primary/10 shadow-sm flex items-center gap-2">
                      <span className="opacity-50">SPLIT:</span> {currency.symbol}{splitAmountVal} / person
                    </p>
                  </div>
                )}
              </div>

              {/* Paid By Selection */}
              <div className="space-y-4">
                <label className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-widest px-1">Source of Payment</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {participants.map((p) => {
                    const active = paidBy === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPaidBy(p)}
                        className={cn(
                          "h-12 rounded-2xl px-3 border text-[11px] font-black uppercase tracking-tight transition-all relative overflow-hidden",
                          active
                            ? "bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-500/20"
                            : "bg-card border-border/30 text-muted-foreground hover:bg-secondary/40"
                        )}
                      >
                        <span className="truncate block relative z-10">{p === 'me' ? 'You Paid' : p}</span>
                        {active && (
                          <div className="absolute top-3.5 right-3 bg-white rounded-full p-0.5 shadow-sm flex items-center justify-center">
                            <Check size={8} strokeWidth={6} className="text-violet-600" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reason & Date */}
              <div className="grid grid-cols-5 gap-3 pt-2">
                <div className="col-span-3 space-y-2">
                  <label className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-widest px-1">Reason</label>
                  <div className="relative">
                    <Tag size={16} strokeWidth={2.2} className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40" />
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={category}
                      className="w-full pl-12 pr-4 h-14 rounded-[1.5rem] text-sm font-bold bg-secondary/10 border border-border/20 focus:border-primary/50 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-widest px-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-14 px-4 rounded-[1.5rem] text-sm font-bold bg-secondary/10 border border-border/20 focus:border-primary/50 outline-none transition-all shadow-sm uppercase"
                  />
                </div>
              </div>

              {/* Category Section */}
              <div className="space-y-4">
                <label className="text-[11px] font-black text-muted-foreground/40 uppercase tracking-widest px-1">Category</label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const active = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 border",
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-secondary/10 border-transparent text-muted-foreground hover:bg-secondary/20"
                        )}
                      >
                        <span className="text-base grayscale-[0.5]">{CATEGORY_EMOJIS[cat] || '📦'}</span>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Bottom Footer */}
      <div className="p-6 pt-4 pb-10 bg-background/80 backdrop-blur-xl border-t border-border/10">
        <div className="max-w-lg mx-auto flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-14 rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest bg-secondary border border-border/30 active:scale-95 transition-all text-secondary-foreground"
          >
            Cancel
          </button>
          {step === 'add_expense' && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!amount || participants.length < 2 || isSubmitting}
              className="flex-[2.5] h-14 rounded-[1.5rem] font-black text-[12px] uppercase tracking-[0.2em] bg-blue-600 text-white shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale"
            >
              {isSubmitting ? 'Syncing...' : 'Add Split'}
            </button>
          )}
        </div>
        <p className="text-[10px] text-center text-muted-foreground font-black mt-4 tracking-[0.2em] uppercase opacity-30">
          Personal record sync enabled
          {selectedGroupId && <span className="text-primary ml-1">• {groupName} Group</span>}
        </p>
      </div>

      {deleteConfirmGroup && (
        <div className="fixed inset-0 z-[10005] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
          <div className="bg-background w-full max-w-sm rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Warning Ring */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-bl-full -z-10" />

            <div className="w-16 h-16 rounded-[1.5rem] bg-red-500/10 flex items-center justify-center text-red-500 mx-auto">
              <AlertTriangle size={32} strokeWidth={2.5} />
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-black text-xl">Delete Group?</h3>
              <p className="text-sm font-medium text-muted-foreground">
                Are you sure you want to completely delete{" "}
                <span className="text-foreground font-black">"{deleteConfirmGroup.name}"</span>?
                This will also erase all shared expenses inside it.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setDeleteConfirmGroup(null)}
                className="flex-1 py-4 font-black text-sm rounded-[1.5rem] bg-secondary text-secondary-foreground active:scale-95 transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteGroup(deleteConfirmGroup)}
                className="flex-1 py-4 font-black text-sm rounded-[1.5rem] bg-red-500 text-white active:scale-95 transition-all shadow-md shadow-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
