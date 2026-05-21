import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, X, Pencil, Check } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { HomeTab } from '@/components/tabs/HomeTab';
import { PersonalTab } from '@/components/tabs/PersonalTab';
import { SharedTab } from '@/components/tabs/SharedTab';
import { SettingsTab } from '@/components/tabs/SettingsTab';
import { AddPersonalExpenseModal } from '@/components/modals/AddPersonalExpenseModal';
import { AddSharedExpenseModal } from '@/components/modals/AddSharedExpenseModal';
import { GroupExpenseModal } from '@/components/modals/GroupExpenseModal';
import { LinksTab } from '@/components/tabs/LinksTab';
import { MoreTab } from '@/components/tabs/MoreTab';
import { CategoryInsightsTab } from '@/components/tabs/CategoryInsightsTab';
import { BudgetsTab } from '@/components/tabs/BudgetsTab';
import { AccountsTab } from '@/components/tabs/AccountsTab';
import { LoansTab } from '@/components/tabs/LoansTab';
import { GoalsTab } from '@/components/tabs/GoalsTab';
import { SubscriptionsTab } from '@/components/tabs/SubscriptionsTab';
import { ConverterTab } from '@/components/tabs/ConverterTab';
import { SmsTransactionsTab } from '@/components/tabs/SmsTransactionsTab';
import { CalendarTab } from '@/components/tabs/CalendarTab';
import { TransactionsTab } from '@/components/tabs/TransactionsTab';
import { Onboarding } from '@/components/Onboarding';
import { isOnboardingDone } from '@/lib/storage';
import { getTabConfig, getSwipeNavEnabled, getLastActiveTab, setLastActiveTab, getPageSlideEnabled, getPersonBalances, getPersonProfile, savePersonProfile, getPendingSyncUpdates, removePendingSyncUpdate, applySyncUpdate, getRejectionUpdates, removeRejectionUpdate, addRejectionUpdate, getAccountProfile, generateId, type PendingSyncUpdate, type RejectionUpdate } from '@/lib/storage';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useToast } from '@/hooks/use-toast';
import { useNightlyBackup } from '@/hooks/useNightlyBackup';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useSmsCapture } from '@/hooks/useSmsCapture';
import { cn } from '@/lib/utils';
import { MoneyDisplay } from '@/components/MoneyDisplay';
import { useBannerAd } from '@/hooks/useBannerAd';

const Index = () => {
  useNightlyBackup();
  const location = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState(() => getLastActiveTab());
  const [tabConfig, setTabConfig] = useState(() => getTabConfig());

  // Show banner ad on settings and feature sub-tabs (More tab pages)
  const isFeatureSubTab = tabConfig.find(t => t.id === activeTab && !t.visible);
  useBannerAd(activeTab === 'account' || !!isFeatureSubTab);

  // Handle incoming invite links
  const processInvite = useCallback((searchStr: string) => {
    const params = new URLSearchParams(searchStr);
    const inviteEmail = params.get('invite_email');
    const inviteName = params.get('invite_name');

    if (inviteEmail && inviteName) {
      const decodedName = decodeURIComponent(inviteName);
      const decodedEmail = decodeURIComponent(inviteEmail);

      // Find a person with this name in our shared contacts
      const balances = getPersonBalances(true);
      const person = balances.find(p => p.name.trim().toLowerCase() === decodedName.trim().toLowerCase());

      if (person) {
        // Automatically link the email to this person
        savePersonProfile({ name: person.name, email: decodedEmail });
        
        toast({
          title: "Contact Linked!",
          description: `Automatically linked ${person.name} with ${decodedEmail}. Real-time sync is now active.`,
        });

        // Clean up URL to prevent repeated toasts on refresh (only for web)
        if (Capacitor.getPlatform() === 'web') {
           const newUrl = window.location.origin + window.location.pathname;
           window.history.replaceState({}, '', newUrl);
        }
      }
    }
  }, [toast]);

  useEffect(() => {
    // 1. Initial Web URL check
    processInvite(window.location.search);

    // 2. Deep Link listener for App
    const handleDeepLink = CapacitorApp.addListener('appUrlOpen', (data: any) => {
      // url might be like: splitmate://invite?invite_email=...
      const url = new URL(data.url);
      processInvite(url.search);
    });

    return () => {
      handleDeepLink.then(h => h.remove());
    };
  }, [processInvite]);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow contextual menus on inputs, textareas, and explicitly allowed elements
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.selectable')
      ) {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const [direction, setDirection] = useState(0); // 1 = right, -1 = left, 0 = none
  const [pageSlideEnabled, setPageSlideEnabled] = useState(() => getPageSlideEnabled());

  useEffect(() => {
    const handlePrefChange = () => setPageSlideEnabled(getPageSlideEnabled());
    const handleDataChange = () => {
      // Refresh configurations but keep active tab if it's still valid
      const newConfig = getTabConfig();
      setTabConfig(newConfig);
      
      const newActiveTab = getLastActiveTab();
      // Only switch active tab if current is hidden or doesn't exist
      if (!newConfig.find(t => t.id === activeTab)) {
        setActiveTab(newActiveTab);
      }
    };

    window.addEventListener('splitmate_page_slide_changed', handlePrefChange);
    window.addEventListener('splitmate_tab_config_changed', handleDataChange);
    window.dispatchEvent(new Event('splitmate_data_changed'));

    return () => {
      window.removeEventListener('splitmate_page_slide_changed', handlePrefChange);
      window.removeEventListener('splitmate_tab_config_changed', handleDataChange);
    };
  }, [activeTab]);

  // Ref to track and avoid side-effect loops
  const isInternalNavigationRef = useRef(false);

  // Sync tab data and persistence
  useEffect(() => {
    if (activeTab) {
      setLastActiveTab(activeTab);
      // Sync history state if it doesn't match
      if (window.history.state?.tabId !== activeTab) {
        window.history.replaceState({ tabId: activeTab }, '');
      }
    }
  }, [activeTab]);

  const [showAddPersonalModal, setShowAddPersonalModal] = useState(false);
  const [showAddSharedModal, setShowAddSharedModal] = useState(false);
  const [showAddGroupExpenseModal, setShowAddGroupExpenseModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [isFabVisible, setIsFabVisible] = useState(true);
  const tabHistoryRef = useRef<string[]>([]);
  const lastBackPressAtRef = useRef(0);

  useSmsCapture(!showOnboarding);

  // Handle cross-page navigation state (e.g., from PersonDetailsPage)
  useEffect(() => {
    if (location.state && (location.state as any).tabId) {
       const targetTab = (location.state as any).tabId;
       if (targetTab !== activeTab) {
         setDirection(0); // No slide for direct external navigation to avoid jumps
         setActiveTab(targetTab);
       }
    }
  }, [location]); // Removed activeTab to avoid feedback loop when switching tabs manually

  // ── Swipe navigation ──────────────────────────────────────────
  const swipeNavEnabledRef = useRef(getSwipeNavEnabled());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    swipeNavEnabledRef.current = getSwipeNavEnabled();
    const onPrefChange = () => {
      swipeNavEnabledRef.current = getSwipeNavEnabled();
    };
    window.addEventListener('splitmate_swipe_nav_changed', onPrefChange);
    return () => window.removeEventListener('splitmate_swipe_nav_changed', onPrefChange);
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!swipeNavEnabledRef.current || !touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

      const config = getTabConfig();
      const visibleIds = config.filter(t => t.visible).map(t => t.id);
      const currentIdx = visibleIds.indexOf(activeTab);
      if (currentIdx === -1) return;

      const delta = dx < 0 ? 1 : -1;
      const nextIdx = currentIdx + delta;

      if (nextIdx >= 0 && nextIdx < visibleIds.length) {
        const nextTab = visibleIds[nextIdx];
        setDirection(delta);
        tabHistoryRef.current = [...tabHistoryRef.current, activeTab].slice(-16);
        window.history.pushState({ tabId: nextTab }, '');
        setActiveTab(nextTab);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeTab]);
  // ─────────────────────────────────────────────────────────────

  useBackHandler(showAddPersonalModal, () => setShowAddPersonalModal(false));
  useBackHandler(showAddSharedModal, () => setShowAddSharedModal(false));
  useBackHandler(showAddGroupExpenseModal, () => setShowAddGroupExpenseModal(false));
  useBackHandler(showOnboarding, () => setShowOnboarding(false));

  const tabsWithFab = new Set([
    'personal',
    'shared',
    'links',
    'loans',
    'goals',
    'subscriptions',
  ]);

  const handleFabClick = useCallback(() => {
    if (activeTab === 'personal') {
      setShowAddPersonalModal(true);
    } else if (activeTab === 'shared') {
      setShowAddSharedModal(true);
    } else {
      window.dispatchEvent(new CustomEvent('splitmate_trigger_add', { detail: { tabId: activeTab } }));
    }
  }, [activeTab]);

  const moreCardTabIds = new Set([
    'personal',
    'shared',
    'transactions',
    'sms-transactions',
    'calendar',
    'links',
    'categories',
    'budgets',
    'accounts',
    'loans',
    'goals',
    'subscriptions',
    'converter',
  ]);

  const navigateToTab = useCallback((tabId: string) => {
    if (activeTab === tabId) return;

    const config = getTabConfig();
    const allIds = config.map(t => t.id);
    
    let newDirection = 0;
    if (tabId === 'account') {
      newDirection = 1;
    } else {
      const prevIdx = allIds.indexOf(activeTab);
      const nextIdx = allIds.indexOf(tabId);
      if (prevIdx !== -1 && nextIdx !== -1) {
        newDirection = nextIdx > prevIdx ? 1 : -1;
      }
    }

    setDirection(newDirection);
    tabHistoryRef.current = [...tabHistoryRef.current, activeTab].slice(-16);
    window.history.pushState({ tabId }, "");
    setActiveTab(tabId);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      setDirection(0); 
      if (e.state?.tabId) {
        setActiveTab(e.state.tabId);
      } else if (!e.state || !e.state.modalId) {
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAccountTab = useCallback(() => {
    navigateToTab('account');
  }, [navigateToTab]);

  const handleAccountBack = useCallback(() => {
    const previousTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
    setDirection(-1);
    if (previousTab) {
      tabHistoryRef.current = tabHistoryRef.current.slice(0, -1);
      setActiveTab(previousTab);
      return;
    }

    setActiveTab('home');
  }, []);

  const handleFeatureBack = useCallback(() => {
    const previousTab = tabHistoryRef.current[tabHistoryRef.current.length - 1];
    setDirection(-1);
    if (previousTab) {
      tabHistoryRef.current = tabHistoryRef.current.slice(0, -1);
      setActiveTab(previousTab);
      return;
    }

    setActiveTab('more');
  }, []);

  const isTabInMore = useCallback((tabId: string) => {
    const tab = tabConfig.find((item) => item.id === tabId);
    if (!tab) return false;
    return !tab.visible;
  }, [tabConfig]);

  useEffect(() => {
    const syncActiveTab = () => {
      const config = getTabConfig();
      setTabConfig(config);
      const allTabs = config.map((t) => t.id);
      const visibleTabs = config.filter(t => t.visible).map(t => t.id);
      if (visibleTabs.length === 0) {
        setActiveTab('home');
        return;
      }

      if (activeTab !== 'account' && !allTabs.includes(activeTab)) {
        setActiveTab(visibleTabs[0]);
      }
    };

    syncActiveTab();
    window.addEventListener('splitmate_tab_config_changed', syncActiveTab);
    window.addEventListener('focus', syncActiveTab);

    return () => {
      window.removeEventListener('splitmate_tab_config_changed', syncActiveTab);
      window.removeEventListener('focus', syncActiveTab);
    };
  }, [activeTab]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handleRef: { remove: () => Promise<void> } | null = null;

    const attach = async () => {
      handleRef = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (showAddPersonalModal) {
          setShowAddPersonalModal(false);
          return;
        }

        if (showAddSharedModal) {
          handleCloseSharedModal();
          return;
        }

        if (showAddGroupExpenseModal) {
          setShowAddGroupExpenseModal(false);
          return;
        }

        if (showOnboarding) {
          setShowOnboarding(false);
          return;
        }

        // 1. Handle hidden "more" feature sub-tabs (they have UI Back buttons)
        if (moreCardTabIds.has(activeTab) && isTabInMore(activeTab)) {
          handleFeatureBack();
          return;
        }

        // 2. Handle Account/Settings tab (it has a UI Back button)
        if (activeTab === 'account') {
          handleAccountBack();
          return;
        }

        // 3. Handle double-back to exit on Home tab
        if (activeTab === 'home') {
          const now = Date.now();
          if (now - lastBackPressAtRef.current < 2000) {
            CapacitorApp.exitApp();
          } else {
            lastBackPressAtRef.current = now;
            toast({
              description: "Press back again to exit",
              duration: 2000,
            });
          }
          return;
        }

        // 4. Handle other top-level main tabs (Personal, Shared, Links, More, etc.)
        // jump to home instead of ignoring or going back in history
        if (activeTab !== 'home') {
          setActiveTab('home');
          return;
        }
      });
    };

    void attach();
    return () => {
      if (handleRef) {
        void handleRef.remove();
      }
    };
  }, [activeTab, showAddPersonalModal, showAddSharedModal, showAddGroupExpenseModal, showOnboarding, toast, isTabInMore, handleAccountBack, handleFeatureBack]);

  const handleCloseSharedModal = () => setShowAddSharedModal(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    
    if (isAtBottom && isFabVisible) {
      setIsFabVisible(false);
    } else if (!isAtBottom && !isFabVisible) {
      setIsFabVisible(true);
    }
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeTab
            onAddPersonal={() => setShowAddPersonalModal(true)}
            onAddShared={() => setShowAddSharedModal(true)}
            onOpenAccount={openAccountTab}
            onNavigateToTab={navigateToTab}
          />
        );
      case 'personal':
        return (
          <PersonalTab onOpenAccount={openAccountTab} onBack={isTabInMore('personal') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('personal')} />
        );
      case 'shared':
        return (
          <SharedTab onOpenAccount={openAccountTab} onBack={isTabInMore('shared') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('shared')} />
        );
      case 'transactions':
        return (
          <TransactionsTab
            onOpenAccount={openAccountTab}
            onBack={isTabInMore('transactions') ? handleFeatureBack : undefined}
            onNavigateToTab={navigateToTab}
            bannerAdActive={isTabInMore('transactions')}
          />
        );
      case 'links':
        return (
          <LinksTab onOpenAccount={openAccountTab} onBack={isTabInMore('links') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('links')} />
        );
      case 'categories':
        return (
          <CategoryInsightsTab onOpenAccount={openAccountTab} onBack={isTabInMore('categories') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('categories')} />
        );
      case 'budgets':
        return (
          <BudgetsTab onOpenAccount={openAccountTab} onBack={isTabInMore('budgets') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('budgets')} />
        );
      case 'accounts':
        return (
          <AccountsTab onOpenAccount={openAccountTab} onBack={isTabInMore('accounts') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('accounts')} />
        );
      case 'more':
        return (
          <MoreTab onOpenAccount={openAccountTab} onOpenFeatureTab={navigateToTab} />
        );
      case 'loans':
        return (
          <LoansTab onOpenAccount={openAccountTab} onBack={isTabInMore('loans') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('loans')} />
        );
      case 'goals':
        return (
          <GoalsTab onOpenAccount={openAccountTab} onBack={isTabInMore('goals') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('goals')} />
        );
      case 'subscriptions':
        return (
          <SubscriptionsTab onOpenAccount={openAccountTab} onBack={isTabInMore('subscriptions') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('subscriptions')} />
        );
      case 'converter':
        return (
          <ConverterTab onOpenAccount={openAccountTab} onBack={isTabInMore('converter') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('converter')} />
        );
      case 'sms-transactions':
        return (
          <SmsTransactionsTab onOpenAccount={openAccountTab} onBack={isTabInMore('sms-transactions') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('sms-transactions')} />
        );
      case 'calendar':
        return (
          <CalendarTab onOpenAccount={openAccountTab} onBack={isTabInMore('calendar') ? handleFeatureBack : undefined} bannerAdActive={isTabInMore('calendar')} />
        );
      case 'account':
        return (
          <SettingsTab onBack={handleAccountBack} />
        );
      default:
        return (
          <HomeTab
            onAddPersonal={() => { }}
            onAddShared={() => { }}
            onOpenAccount={openAccountTab}
            onNavigateToTab={navigateToTab}
          />
        );
    }
  };

  const variants = {
    enter: (direction: number) => ({
      x: (pageSlideEnabled && direction !== 0) ? (direction > 0 ? '100%' : '-100%') : 0,
      opacity: 0,
      scale: pageSlideEnabled ? 0.99 : 1,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 260, damping: 26 },
        opacity: { duration: 0.2 },
        scale: { duration: 0.2 }
      }
    },
    exit: (direction: number) => ({
      x: (pageSlideEnabled && direction !== 0) ? (direction > 0 ? '-100%' : '100%') : 0,
      opacity: 0,
      scale: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 260, damping: 26 },
        opacity: { duration: 0.2 }
      }
    }),
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Main Content Area - We use grid to prevent jumps and flicker during tab slide */}
      <main className="grid grid-cols-1 grid-rows-1 items-start min-h-screen pt-safe-top overflow-hidden relative bg-transparent">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={activeTab}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ 
              gridArea: '1/1',
              willChange: 'transform, opacity',
            }}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-auto pb-40 scroll-smooth"
          >
            {renderActiveTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global FAB - Positioned outside the transformed main area */}
      <AnimatePresence>
        {isFabVisible && activeTab === 'shared' && (
          <motion.div
            key="group-fab"
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.05 }}
            className={cn(
              "fixed right-4 z-[50]",
              isTabInMore(activeTab) ? "bottom-[7.5rem]" : "bottom-[240px]"
            )}
          >
            <button
              onClick={() => setShowAddGroupExpenseModal(true)}
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all hover:scale-110"
              style={{
                background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                boxShadow: '0 8px 32px -8px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
              title="Add Group Expense"
            >
              <div className="relative">
                <Users size={24} strokeWidth={2} className="text-white/90" />
                <Plus 
                  size={15} 
                  strokeWidth={5} 
                  className="absolute -top-1.5 -right-2.5 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]" 
                />
              </div>
            </button>
          </motion.div>
        )}

        {isFabVisible && tabsWithFab.has(activeTab) && (
          <motion.div
            key="main-fab"
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={cn(
              "fixed right-4 z-[50]",
              isTabInMore(activeTab) ? "bottom-16" : "bottom-[176px]"
            )}
          >
            <button
              onClick={handleFabClick}
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all hover:scale-110"
              style={{
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
                boxShadow: '0 8px 32px -8px hsl(var(--primary) / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.15)',
                border: '1px solid hsl(var(--glass-border))',
              }}
            >
              <Plus size={24} strokeWidth={2.5} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Bottom Navigation */}
      {activeTab !== 'account' && !isTabInMore(activeTab) && (
        <BottomNavigation activeTab={activeTab} onTabChange={navigateToTab} />
      )}

      {/* Global Modals */}
      <AddPersonalExpenseModal
        isOpen={showAddPersonalModal}
        onClose={() => setShowAddPersonalModal(false)}
        onAdd={() => setShowAddPersonalModal(false)}
      />

      <AddSharedExpenseModal
        isOpen={showAddSharedModal}
        onClose={handleCloseSharedModal}
        onAdd={handleCloseSharedModal}
      />

      <GroupExpenseModal
        isOpen={showAddGroupExpenseModal}
        onClose={() => setShowAddGroupExpenseModal(false)}
        onAdd={() => setShowAddGroupExpenseModal(false)}
      />
    </div>
  );
};

export default Index;
