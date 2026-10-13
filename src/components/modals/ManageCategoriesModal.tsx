import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Plus, 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Trash2, 
  Sparkles, 
  RotateCcw,
  Check,
  Tag,
  Repeat
} from 'lucide-react';
import { 
  getExpenseCategoriesConfig, 
  saveExpenseCategoriesConfig, 
  getSubscriptionCategoriesConfig, 
  saveSubscriptionCategoriesConfig, 
  DEFAULT_EXPENSE_CATEGORIES, 
  DEFAULT_SUBSCRIPTION_CATEGORIES, 
  type AppCategoryItem 
} from '@/lib/storage';
import { useProGate } from '@/hooks/useProGate';
import { requestProUpgrade } from '@/lib/proAccess';
import { useBackHandler } from '@/hooks/useBackHandler';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ManageCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const POPULAR_EMOJIS = [
  '🍔', '🛒', '🚗', '🛍️', '🎬', '🏠', '🩺', '📚', '✈️', '📦',
  '☕', '🍕', '🎮', '💻', '📱', '⚡', '🏋️', '🐾', '🎁', '🏖️',
  '📺', '🎵', '🤖', '🔧', '✨', '☁️', '🧾', '🎟️', '🚲', '🍹'
];

export function ManageCategoriesModal({ isOpen, onClose }: ManageCategoriesModalProps) {
  const { isPro } = useProGate();
  const [activeTab, setActiveTab] = useState<'expenses' | 'subscriptions'>('expenses');
  
  const [expenseCats, setExpenseCats] = useState<AppCategoryItem[]>([]);
  const [subCats, setSubCats] = useState<AppCategoryItem[]>([]);

  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('🏷️');

  useEffect(() => {
    if (isOpen) {
      setExpenseCats(getExpenseCategoriesConfig());
      setSubCats(getSubscriptionCategoriesConfig());
      setIsAdding(false);
      setNewCatName('');
      setNewCatEmoji(activeTab === 'expenses' ? '🏷️' : '🎬');
    }
  }, [isOpen, activeTab]);

  useBackHandler(isOpen, onClose);

  if (!isOpen) return null;

  const currentList = activeTab === 'expenses' ? expenseCats : subCats;

  const updateCurrentList = (newList: AppCategoryItem[]) => {
    if (activeTab === 'expenses') {
      setExpenseCats(newList);
      saveExpenseCategoriesConfig(newList);
    } else {
      setSubCats(newList);
      saveSubscriptionCategoriesConfig(newList);
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;
    const next = [...currentList];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    updateCurrentList(next);
  };

  const handleToggleHide = (index: number) => {
    const item = currentList[index];
    const visibleCount = currentList.filter(c => !c.hidden).length;
    // Don't allow hiding if it's the last visible category
    if (!item.hidden && visibleCount <= 1) {
      toast.error('You must keep at least 1 category visible.');
      return;
    }

    const next = [...currentList];
    next[index] = { ...item, hidden: !item.hidden };
    updateCurrentList(next);
    toast.success(`${item.name} is now ${item.hidden ? 'visible' : 'hidden'}`);
  };

  const handleDelete = (index: number) => {
    const item = currentList[index];
    const next = currentList.filter((_, idx) => idx !== index);
    updateCurrentList(next);
    toast.success(`Removed ${item.name}`);
  };

  const handleResetDefaults = () => {
    if (activeTab === 'expenses') {
      const reset = [...DEFAULT_EXPENSE_CATEGORIES];
      setExpenseCats(reset);
      saveExpenseCategoriesConfig(reset);
    } else {
      const reset = [...DEFAULT_SUBSCRIPTION_CATEGORIES];
      setSubCats(reset);
      saveSubscriptionCategoriesConfig(reset);
    }
    toast.success('Reset to default categories');
  };

  const handleAddClick = () => {
    if (!isPro) {
      requestProUpgrade('customization', 'Upgrade to Pro to create and customize unlimited categories.');
      return;
    }
    setIsAdding(true);
  };

  const handleSaveNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) {
      toast.error('Please enter a category name');
      return;
    }

    if (currentList.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A category with this name already exists');
      return;
    }

    const newItem: AppCategoryItem = {
      id: `custom_${Date.now()}`,
      name,
      emoji: newCatEmoji || '🏷️',
      hidden: false,
      isCustom: true,
    };

    const next = [newItem, ...currentList];
    updateCurrentList(next);
    setNewCatName('');
    setIsAdding(false);
    toast.success(`Added ${name} category`);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10005] flex flex-col justify-end sm:justify-center items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-card border border-border/20 rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-border/10 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground flex items-center gap-2">
              Manage Categories
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reorder, hide, or create categories for expense and subscription pickers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-secondary/15 border-b border-border/10 shrink-0">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-secondary/35 rounded-2xl border border-border/10">
            <button
              type="button"
              onClick={() => { setActiveTab('expenses'); setIsAdding(false); }}
              className={cn(
                "py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'expenses'
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Tag size={13} className={activeTab === 'expenses' ? "text-primary" : ""} />
              Personal & Shared
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('subscriptions'); setIsAdding(false); }}
              className={cn(
                "py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                activeTab === 'subscriptions'
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Repeat size={13} className={activeTab === 'subscriptions' ? "text-primary" : ""} />
              Subscriptions
            </button>
          </div>
        </div>

        {/* Action Bar (Add Custom / Pro Badge) */}
        <div className="px-5 py-3 border-b border-border/10 flex items-center justify-between bg-card shrink-0">
          <span className="text-xs font-bold text-muted-foreground">
            {currentList.filter(c => !c.hidden).length} Active Categories
          </span>

          {!isAdding && (
            <button
              type="button"
              onClick={handleAddClick}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95",
                isPro
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15"
              )}
            >
              {isPro ? (
                <>
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Add Category</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-amber-400" />
                  <span>Add Custom (PRO)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Inline Add Category Form */}
        {isAdding && (
          <form onSubmit={handleSaveNewCategory} className="p-4 bg-secondary/25 border-b border-border/15 space-y-3 animate-in fade-in shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">New Custom Category</span>
              <button 
                type="button" 
                onClick={() => setIsAdding(false)} 
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            <div className="flex gap-2">
              {/* Emoji Selector */}
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-background border border-border/20 flex items-center justify-center text-xl shadow-inner">
                {newCatEmoji}
              </div>
              <input
                type="text"
                autoFocus
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Category name (e.g. Gym, Pets, Freelance)"
                className="flex-1 h-11 rounded-2xl bg-background border border-border/20 px-3.5 text-xs font-bold text-foreground outline-none focus:border-border/40"
              />
              <button
                type="submit"
                className="h-11 px-4 rounded-2xl bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition-all"
              >
                Save
              </button>
            </div>

            {/* Quick Emoji Picker */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pick Emoji</span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-background/50 rounded-xl border border-border/10">
                {POPULAR_EMOJIS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setNewCatEmoji(em)}
                    className={cn(
                      "w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all",
                      newCatEmoji === em ? "bg-primary/20 scale-110" : "hover:bg-secondary"
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}

        {/* Categories List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {currentList.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === currentList.length - 1;
            const isHidden = !!item.hidden;

            return (
              <div
                key={item.id}
                className={cn(
                  "p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-3",
                  isHidden
                    ? "bg-secondary/10 border-border/5 opacity-55"
                    : "bg-secondary/25 border-border/10"
                )}
              >
                {/* Left: Reorder handles + Emoji + Name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => handleMove(index, 'up')}
                      className="w-6 h-5 rounded-md bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 active:scale-90 transition-all"
                      title="Move up"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => handleMove(index, 'down')}
                      className="w-6 h-5 rounded-md bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 active:scale-90 transition-all"
                      title="Move down"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>

                  <span className="text-xl shrink-0 select-none">{item.emoji || '📦'}</span>

                  <div className="min-w-0">
                    <p className={cn(
                      "text-xs font-bold truncate text-foreground",
                      isHidden && "line-through text-muted-foreground"
                    )}>
                      {item.name}
                    </p>
                    {item.isCustom && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Actions (Hide/Show & Delete) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleHide(index)}
                    className={cn(
                      "h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border",
                      isHidden
                        ? "bg-secondary/40 text-muted-foreground border-border/10 hover:text-foreground"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15"
                    )}
                    title={isHidden ? "Unhide category" : "Hide category"}
                  >
                    {isHidden ? (
                      <>
                        <EyeOff size={13} />
                        <span className="hidden xs:inline">Hidden</span>
                      </>
                    ) : (
                      <>
                        <Eye size={13} />
                        <span className="hidden xs:inline">Visible</span>
                      </>
                    )}
                  </button>

                  {item.isCustom && (
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="w-8 h-8 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center hover:bg-destructive/20 active:scale-90 transition-all"
                      title="Delete custom category"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/10 bg-secondary/15 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all"
          >
            <RotateCcw size={12} />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
