import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ChevronLeft,
  GripVertical,
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
  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setSettings(getHomeSettings());
    }
  }, [isOpen]);

  // Back button handling
  useBackHandler(isOpen, onClose);

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



  const toggleSetting = useCallback((key: keyof Omit<HomeTabSettings, 'currencyRateCodes' | 'sectionOrder'>) => {
    const next = { ...settings, [key]: !settings[key] };
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
            Toggle widgets on or off, and tap and hold to drag and <span className="text-foreground font-semibold">reorder</span> what appears first on your Home tab.
          </p>
        </div>

        {/* Widgets List */}
        <Reorder.Group 
          axis="y" 
          values={settings.sectionOrder} 
          onReorder={(newOrder) => {
            const next = { ...settings, sectionOrder: newOrder };
            setSettings(next);
            saveHomeSettings(next);
          }} 
          className="space-y-2.5"
        >
          {settings.sectionOrder.map((sectionId, index) => {
            const item = WIDGET_DEFINITIONS.find((i) => i.id === sectionId);
            if (!item) return null;
            const isEnabled = settings[item.settingKey as keyof HomeTabSettings] as boolean;

            return (
              <Reorder.Item
                key={item.id}
                value={sectionId}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-2xl transition-all shadow-sm relative z-0 touch-none',
                  isEnabled
                    ? 'bg-secondary'
                    : 'bg-secondary/40 grayscale-[0.6] opacity-75'
                )}
                whileDrag={{ scale: 1.02, zIndex: 50, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
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
                      isEnabled ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
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


                {/* Drag Handle */}
                <div className="flex items-center justify-center pl-2 border-l border-border/20 text-muted-foreground/40 cursor-grab active:cursor-grabbing">
                  <GripVertical size={20} />
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      </div>


    </div>,
    document.body
  );
}
