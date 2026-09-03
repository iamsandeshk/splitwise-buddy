import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Check,
  RotateCcw,
  Activity,
  PieChart,
  Users,
  LayoutGrid,
  Landmark,
  Globe,
  User,
  Target,
  Repeat,
  ExternalLink,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getHomeSettings,
  saveHomeSettings,
  DEFAULT_HOME_SETTINGS,
  type HomeTabSettings,
  getGoals,
  getSubscriptions,
  getLinks,
  getPersonalExpenses,
  getSharedExpenses,
  getPersonBalances,
} from '@/lib/storage';
import { useBackHandler } from '@/hooks/useBackHandler';

interface EditHomeWidgetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WIDGET_DEFINITIONS = [
  { id: 'stats', label: 'Stats & Totals', icon: Activity, desc: 'Incoming, outgoing & person counts', settingKey: 'showStats' },
  { id: 'spending', label: 'Spending Breakdown', icon: PieChart, desc: 'Category-wise distribution chart', settingKey: 'showSpendingBreakdown' },
  { id: 'balances', label: 'Top Balances', icon: Users, desc: 'Quick view of people who owe you', settingKey: 'showTopBalances' },
  { id: 'categories', label: 'Category Insights', icon: LayoutGrid, desc: 'Detailed spending by category', settingKey: 'showCategories' },
  { id: 'budgets', label: 'My Budgets', icon: Landmark, desc: 'Track your budget limits', settingKey: 'showBudgets' },
  { id: 'converter', label: 'Currency Converter', icon: Globe, desc: 'Quick exchange rate tool', settingKey: 'showConverter' },
  { id: 'personal', label: 'Recent Personal', icon: User, desc: 'Your latest private expenses', settingKey: 'showRecentPersonal' },
  { id: 'shared', label: 'Recent Shared', icon: Users, desc: 'Latest activity in shared tabs', settingKey: 'showRecentShared' },
  { id: 'goals', label: 'Active Savings', icon: Target, desc: 'Track your saving progress', settingKey: 'showGoals' },
  { id: 'loans', label: 'Ongoing Loans', icon: Landmark, desc: 'View borrowed & given loans', settingKey: 'showLoans' },
  { id: 'subs', label: 'Upcoming Bills', icon: Repeat, desc: 'Next due subscriptions', settingKey: 'showSubscriptions' },
  { id: 'links', label: 'Pinned Links', icon: ExternalLink, desc: 'Quick access to top websites', settingKey: 'showPinnedLinks' },
  { id: 'rates', label: 'Live Rates', icon: Globe, desc: 'Market exchange rates', settingKey: 'showCurrencyRates' },
] as const;

export function EditHomeWidgetsModal({ isOpen, onClose }: EditHomeWidgetsModalProps) {
  const [settings, setSettings] = useState<HomeTabSettings>(() => getHomeSettings());
  const [activePicker, setActivePicker] = useState<'goals' | 'subs' | 'links' | 'balances' | 'categories' | null>(null);

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setSettings(getHomeSettings());
    }
  }, [isOpen]);

  // Back button handling
  useBackHandler(isOpen && activePicker === null, onClose);
  useBackHandler(activePicker !== null, () => setActivePicker(null));

  // Lock scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [isOpen]);

  const allPeople = useMemo(() => {
    const balances = getPersonBalances();
    return balances.map(p => p.name).sort();
  }, []);

  const allCategories = useMemo(() => {
    const personal = getPersonalExpenses().map(e => e.category);
    const shared = getSharedExpenses().map(e => (e as { category?: string }).category).filter(Boolean);
    return Array.from(new Set([...personal, ...shared])).sort();
  }, []);

  const toggleSetting = useCallback((key: keyof Omit<HomeTabSettings, 'currencyRateCodes' | 'sectionOrder'>) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    saveHomeSettings(next);
  }, [settings]);

  const moveSection = useCallback((id: string, direction: 'up' | 'down') => {
    const order = [...settings.sectionOrder];
    const index = order.indexOf(id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    const next = { ...settings, sectionOrder: order };
    setSettings(next);
    saveHomeSettings(next);
  }, [settings]);

  const toggleSelectedItem = useCallback((type: 'links' | 'subs' | 'goals' | 'balances' | 'categories', id: string) => {
    const keyMap = {
      links: 'selectedLinkIds',
      subs: 'selectedSubscriptionIds',
      goals: 'selectedGoalIds',
      balances: 'selectedPersonNames',
      categories: 'selectedCategoryNames',
    } as const;

    const key = keyMap[type];
    const current = (settings[key] as string[]) || [];
    const isSelected = current.includes(id);
    if (!isSelected && current.length >= 2) return;
    const nextIds = isSelected ? current.filter((item) => item !== id) : [...current, id];
    const next = { ...settings, [key]: nextIds };
    setSettings(next);
    saveHomeSettings(next);
  }, [settings]);

  const handleReset = useCallback(() => {
    saveHomeSettings(DEFAULT_HOME_SETTINGS);
    setSettings(DEFAULT_HOME_SETTINGS);
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex flex-col bg-background"
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3 shrink-0 border-b border-border/10 bg-background/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-secondary/60 border border-border/55 flex items-center justify-center active:scale-90 transition-all text-foreground hover:bg-secondary"
            aria-label="Back"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-xl font-bold leading-none tracking-tight">Home Dashboard</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Toggle &amp; reorder widgets</p>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="h-8 px-3 rounded-xl bg-secondary/40 border border-border/40 text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 active:scale-95 transition-all"
          title="Reset to defaults"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 pb-28">
        <div className="p-4 rounded-2xl bg-secondary/20 border border-border/20 space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
            <SlidersHorizontal size={13} />
            <span>Customize View</span>
          </div>
          <p className="text-[13px] text-muted-foreground leading-snug">
            Toggle widgets on or off, and tap the arrows to <span className="text-foreground font-semibold">reorder</span> what appears first on your Home tab.
          </p>
        </div>

        {/* Widgets List */}
        <div className="space-y-2.5">
          {settings.sectionOrder.map((sectionId, index) => {
            const item = WIDGET_DEFINITIONS.find((i) => i.id === sectionId);
            if (!item) return null;
            const isEnabled = settings[item.settingKey as keyof HomeTabSettings] as boolean;

            return (
              <div
                key={item.id}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-2xl transition-all border shadow-sm',
                  isEnabled
                    ? 'bg-primary/10 border-primary/25'
                    : 'bg-secondary/20 border-border/20 grayscale-[0.6] opacity-65'
                )}
              >
                {/* Toggle & details */}
                <button
                  type="button"
                  onClick={() => {
                    toggleSetting(item.settingKey as keyof Omit<HomeTabSettings, 'currencyRateCodes' | 'sectionOrder'>);
                  }}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 shadow-inner',
                      isEnabled ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    <item.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-bold text-sm leading-tight', isEnabled ? 'text-foreground' : 'text-muted-foreground')}>
                      {item.label}
                    </p>
                    <p className={cn('text-[10px] font-medium mt-0.5 truncate', isEnabled ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                      {item.desc}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center border transition-all shrink-0',
                      isEnabled ? 'bg-primary border-primary shadow-sm' : 'bg-transparent border-border/60'
                    )}
                  >
                    {isEnabled && <Check size={13} className="text-primary-foreground" strokeWidth={3} />}
                  </div>
                </button>

                {/* Sub-item configuration for item pickers */}
                {isEnabled && ['goals', 'subs', 'links', 'balances', 'categories'].includes(item.id) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePicker(item.id as 'goals' | 'subs' | 'links' | 'balances' | 'categories');
                    }}
                    className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center hover:bg-secondary active:scale-90 transition-all shrink-0 border border-border/30"
                    title="Configure pinned items"
                  >
                    <ChevronRight size={14} className="text-foreground" />
                  </button>
                )}

                {/* Move Up / Down */}
                <div className="flex flex-col gap-1 pl-2 border-l border-border/20">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveSection(item.id, 'up');
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-transparent text-muted-foreground disabled:opacity-20 active:scale-90 transition-all hover:bg-secondary/40 hover:text-foreground"
                    aria-label="Move Up"
                  >
                    <ChevronUp size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    disabled={index === settings.sectionOrder.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveSection(item.id, 'down');
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-transparent text-muted-foreground disabled:opacity-20 active:scale-90 transition-all hover:bg-secondary/40 hover:text-foreground"
                    aria-label="Move Down"
                  >
                    <ChevronDown size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item Picker Bottom Sheet */}
      {createPortal(
        <AnimatePresence>
          {activePicker && (
            <div className="fixed inset-0 z-[99999] flex items-end justify-center p-4 pb-20 sm:pb-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActivePicker(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
              />
              <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="relative w-full max-w-md bg-card border border-border/20 rounded-[1.5rem] shadow-2xl z-[120] overflow-hidden flex flex-col max-h-[75vh] mb-4 pointer-events-auto"
              >
                {/* Drag Indicator */}
                <div className="flex justify-center pt-3 pb-0">
                  <div className="w-10 h-1 rounded-full bg-muted/30" />
                </div>

                <div className="p-6 pb-4 border-b border-border/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black tracking-tighter text-foreground capitalize">
                      Select {activePicker}
                    </h3>
                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mt-1">
                      Choose up to 2 items to display
                    </p>
                  </div>
                  <button
                    onClick={() => setActivePicker(null)}
                    className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-foreground active:scale-90 transition-all border border-border/20 shadow-sm"
                  >
                    <Check size={18} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-10">
                  {activePicker === 'goals' &&
                    getGoals().map((goal) => {
                      const isSelected = settings.selectedGoalIds.includes(goal.id);
                      return (
                        <div
                          key={goal.id}
                          onClick={() => toggleSelectedItem('goals', goal.id)}
                          className={cn(
                            'p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]',
                            isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-secondary/10 border-transparent opacity-75'
                          )}
                        >
                          <span className="font-bold text-sm">{goal.name}</span>
                          {isSelected && (
                            <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center">
                              <Check size={14} className="text-primary-foreground" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {activePicker === 'subs' &&
                    getSubscriptions().map((sub) => {
                      const isSelected = settings.selectedSubscriptionIds.includes(sub.id);
                      return (
                        <div
                          key={sub.id}
                          onClick={() => toggleSelectedItem('subs', sub.id)}
                          className={cn(
                            'p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]',
                            isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-secondary/10 border-transparent opacity-75'
                          )}
                        >
                          <span className="font-bold text-sm">{sub.appName}</span>
                          {isSelected && (
                            <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center">
                              <Check size={14} className="text-primary-foreground" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {activePicker === 'links' &&
                    getLinks().map((link) => {
                      const isSelected = settings.selectedLinkIds.includes(link.id);
                      return (
                        <div
                          key={link.id}
                          onClick={() => toggleSelectedItem('links', link.id)}
                          className={cn(
                            'p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]',
                            isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-secondary/10 border-transparent opacity-75'
                          )}
                        >
                          <span className="font-bold text-sm truncate pr-2">{link.title || link.name}</span>
                          {isSelected && (
                            <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center">
                              <Check size={14} className="text-primary-foreground" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {activePicker === 'balances' &&
                    allPeople.map((person) => {
                      const isSelected = settings.selectedPersonNames.includes(person);
                      return (
                        <div
                          key={person}
                          onClick={() => toggleSelectedItem('balances', person)}
                          className={cn(
                            'p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]',
                            isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-secondary/10 border-transparent opacity-75'
                          )}
                        >
                          <span className="font-bold text-sm">{person}</span>
                          {isSelected && (
                            <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center">
                              <Check size={14} className="text-primary-foreground" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {activePicker === 'categories' &&
                    allCategories.map((cat) => {
                      const isSelected = settings.selectedCategoryNames.includes(cat);
                      return (
                        <div
                          key={cat}
                          onClick={() => toggleSelectedItem('categories', cat)}
                          className={cn(
                            'p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer active:scale-[0.98]',
                            isSelected ? 'bg-primary/10 border-primary/30 shadow-sm' : 'bg-secondary/10 border-transparent opacity-75'
                          )}
                        >
                          <span className="font-bold text-sm">{cat}</span>
                          {isSelected && (
                            <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center">
                              <Check size={14} className="text-primary-foreground" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {((activePicker === 'goals' && getGoals().length === 0) ||
                    (activePicker === 'subs' && getSubscriptions().length === 0) ||
                    (activePicker === 'links' && getLinks().length === 0) ||
                    (activePicker === 'balances' && allPeople.length === 0) ||
                    (activePicker === 'categories' && allCategories.length === 0)) && (
                    <div className="py-16 text-center space-y-3">
                      <div className="w-14 h-14 bg-secondary/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                        <LayoutGrid size={24} className="text-muted-foreground opacity-50" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground">No {activePicker} found</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>,
    document.body
  );
}
