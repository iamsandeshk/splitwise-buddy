import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Download, Upload, Trash2, Info, Moon, Sun, Monitor, Smartphone,
  Database, FileJson, AlertTriangle, Check, X, ChevronRight,
  ChevronLeft, ChevronUp, ChevronDown, Shield, Coins, LayoutGrid,
  Eye, EyeOff, GripVertical, Palette, Coffee, RotateCcw,
  UserCircle2, Save, Camera, ArrowLeft, LogIn, LogOut, Search,
  Pencil, CloudUpload, Home, User, Users, ExternalLink, PieChart,
  WalletCards, Landmark, Target, Repeat, ArrowLeftRight, Globe, Sparkles,
  Calendar, MessageSquare,
  FileSpreadsheet, HardDrive, Activity, CheckSquare, Plus, RefreshCw, HelpCircle, Bell, Settings, CreditCard, Link as LinkIcon, Crown, Share2, Lock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NativeAdCard } from '@/components/NativeAdCard';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  exportAllData,
  importData,
  getPersonalExpenses,
  getSharedExpenses,
  getLinks,
  getGroups,
  clearPersonalExpenses,
  clearSharedExpenses,
  clearLinksData,
  clearMoreTabData,
  getCurrency,
  setCurrency,
  CURRENCIES,
  getTabConfig,
  setTabConfig,
  getSwipeNavEnabled,
  setSwipeNavEnabled,
  getLiquidGlassEnabled,
  setLiquidGlassEnabled,
  getPageSlideEnabled,
  setPageSlideEnabled,
  getAccountProfile,
  saveAccountProfile,
  MAX_BOTTOM_TABS,
  FIXED_BOTTOM_TAB_IDS,
  getLoans,
  getGoals,
  getSubscriptions,
  getHomeSettings,
  saveHomeSettings,
  clearAllData,
  triggerForceSync,
  getAdsEnabled,
  setAdsEnabled,
  showRewardAd,
  type TabConfig,
  type AccountProfile,
  type HomeTabSettings
} from '@/lib/storage';
import { getStoredTheme, setStoredTheme, type ThemeMode } from '@/lib/theme';
import { getStoredAccentColor, setStoredAccentColor, type AccentColor } from '@/lib/accentColor';
import { getGooglePhotoUrl, signInWithGoogle, signOutGoogle, subscribeGoogleAuth } from '@/integrations/firebase/auth';
import { getCurrentGoogleUser } from '@/integrations/firebase/auth';
import { loadBackupForCurrentUser, saveBackupForCurrentUser } from '@/integrations/firebase/backup';
import { useToast } from '@/hooks/use-toast';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAdFree } from '@/hooks/useAdFree';
import { useProGate } from '@/hooks/useProGate';
import { getProOverride, isDevOverrideEmail, isProUserCached, setProOverride } from '@/lib/proAccess';

const APP_VERSION = '4.7';

type DeleteStep = 'closed' | 'select' | 'confirm';

interface SettingsTabProps {
  onBack?: () => void;
}

const DEFAULT_TAB_LAYOUT: TabConfig[] = [
  { id: 'home', visible: true },
  { id: 'personal', visible: true },
  { id: 'transactions', visible: true },
  { id: 'accounts', visible: true },
  { id: 'shared', visible: false },
  { id: 'sms-transactions', visible: false },
  { id: 'calendar', visible: false },
  { id: 'links', visible: false },
  { id: 'categories', visible: false },
  { id: 'budgets', visible: false },
  { id: 'loans', visible: false },
  { id: 'goals', visible: false },
  { id: 'subscriptions', visible: false },
  { id: 'converter', visible: false },
  { id: 'more', visible: true },
];

export function SettingsTab({ onBack }: SettingsTabProps) {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme());
  const [accentColor, setAccentColorState] = useState<AccentColor>(getStoredAccentColor());
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('closed');
  const [deleteSelections, setDeleteSelections] = useState({ personal: false, shared: false, links: false, more: false });
  const [selectedCurrency, setSelectedCurrency] = useState(getCurrency().code);
  const [tabs, setTabs] = useState<TabConfig[]>(getTabConfig());
  const [swipeNavEnabled, setSwipeNavEnabledState] = useState(() => getSwipeNavEnabled());
  const [liquidGlassEnabled, setLiquidGlassEnabledState] = useState(() => getLiquidGlassEnabled());
  const [pageSlideEnabled, setPageSlideEnabledState] = useState(() => getPageSlideEnabled());
  const [profile, setProfile] = useState<AccountProfile>(getAccountProfile());
  const [lastSavedProfile, setLastSavedProfile] = useState<AccountProfile>(getAccountProfile());
  const [profileSavedAt, setProfileSavedAt] = useState<number>(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(() => Boolean(getCurrentGoogleUser() || getAccountProfile().email));
  const [isGoogleAuthBusy, setIsGoogleAuthBusy] = useState(false);
  const [isCloudBackupBusy, setIsCloudBackupBusy] = useState(false);
  const [isCloudRestoreBusy, setIsCloudRestoreBusy] = useState(false);
  const [cloudBackupUpdatedAt, setCloudBackupUpdatedAt] = useState<Date | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [proOverrideMode, setProOverrideMode] = useState<'on' | 'off'>(() => (getProOverride() === 'on' ? 'on' : 'off'));

  const [showCustomize, setShowCustomize] = useState(false);
  const [showAnimationMenu, setShowAnimationMenu] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCurrencyBrowser, setShowCurrencyBrowser] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState<'none' | 'local' | 'cloud'>('none');
  const [currencySearch, setCurrencySearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [showFullScreenAvatar, setShowFullScreenAvatar] = useState(false);
  const [activePicker, setActivePicker] = useState<'goals' | 'subs' | 'links' | 'balances' | 'categories' | null>(null);
  const [adsEnabled, setAdsEnabledState] = useState(() => getAdsEnabled());
  const { isAdFree, remainingTime, adFreeUntil } = useAdFree();
  const { isPro, plan } = useProGate();
  const isEffectivePro = isPro || isProUserCached();

  const adFreeProgress = isAdFree ? Math.max(0, Math.min(1, (adFreeUntil - Date.now()) / (24 * 60 * 60 * 1000))) : 0;
  const adFreeOffset = 157 * (1 - adFreeProgress);

  useEffect(() => {
    const handleAdsChange = () => setAdsEnabledState(getAdsEnabled());
    window.addEventListener('splitmate_ads_changed', handleAdsChange);
    return () => window.removeEventListener('splitmate_ads_changed', handleAdsChange);
  }, []);

  useEffect(() => {
    const handleProChange = () => setProOverrideMode(getProOverride() === 'on' ? 'on' : 'off');
    window.addEventListener('splitmate_pro_changed', handleProChange);
    return () => window.removeEventListener('splitmate_pro_changed', handleProChange);
  }, []);

  useEffect(() => {
    if (isEffectivePro || !profile.nightlyBackupEnabled) {
      return;
    }

    const currentSaved = getAccountProfile();
    if (!currentSaved.nightlyBackupEnabled) {
      setProfile((prev) => (prev.nightlyBackupEnabled ? { ...prev, nightlyBackupEnabled: false } : prev));
      return;
    }

    const updated = { ...currentSaved, nightlyBackupEnabled: false };
    const saved = saveAccountProfile(updated);
    if (!saved) return;

    setProfile((prev) => ({ ...prev, nightlyBackupEnabled: false }));
    if (!isEditingProfile) {
      setLastSavedProfile(updated);
    }
  }, [isEffectivePro, isEditingProfile, profile.nightlyBackupEnabled]);

  useEffect(() => {
    if (activePicker) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [activePicker]);

  const allPeople = useMemo(() => {
    const shared = getSharedExpenses().map(e => e.personName);
    const loans = getLoans().map(l => l.personName);
    return Array.from(new Set([...shared, ...loans])).filter(Boolean).sort();
  }, []);

  const allCategories = useMemo(() => {
    const personal = getPersonalExpenses().map(e => e.category);
    const shared = getSharedExpenses().map(e => (e as { category?: string }).category).filter(Boolean);
    return Array.from(new Set([...personal, ...shared])).sort();
  }, []);
  const dragStartY = useRef(0);
  const dragItemHeight = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<AccountProfile>(getAccountProfile());
  const [homeSettings, setHomeSettings] = useState<HomeTabSettings>(getHomeSettings());
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const { toast } = useToast();

  // Handle system back gestures for various overlays
  const handleCloseCustomize = useCallback(() => setShowCustomize(false), []);
  useBackHandler(showCustomize, handleCloseCustomize);
  useBackHandler(showCurrencyBrowser, () => setShowCurrencyBrowser(false));
  useBackHandler(showPrivacy, () => setShowPrivacy(false));
  useBackHandler(showFullScreenAvatar, () => setShowFullScreenAvatar(false));
  useBackHandler(deleteStep !== 'closed', () => setDeleteStep('closed'));
  useBackHandler(showBackupModal !== 'none', () => setShowBackupModal('none'));
  useBackHandler(isEditingProfile, () => setIsEditingProfile(false));
  useBackHandler(activePicker !== null, () => setActivePicker(null));

  const normalizeProfile = useCallback((value: AccountProfile): AccountProfile => ({
    name: value.name.trim() || 'Guest',
    email: value.email.trim(),
    bio: value.bio.trim(),
    avatar: value.avatar,
  }), []);

  const sanitizeAvatarUrl = useCallback((value?: string | null) => {
    const raw = (value ?? '').trim();
    if (!raw) return undefined;
    const allowed = raw.startsWith('https://') || raw.startsWith('http://') || raw.startsWith('data:image/');
    if (!allowed) return undefined;

    if (raw.includes('googleusercontent.com') && !/[?&]sz=\d+/i.test(raw)) {
      // Use 150 for thumbnail but full view will upgrade it
      return `${raw}${raw.includes('?') ? '&' : '?'}sz=150`;
    }

    return raw;
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const applyGoogleProfile = useCallback((payload: { displayName?: string | null; email?: string | null; photoURL?: string | null }) => {
    const currentProfile = profileRef.current;
    const googleAvatar = sanitizeAvatarUrl(payload.photoURL);
    const nextProfile: AccountProfile = {
      ...currentProfile,
      name: payload.displayName?.trim() || currentProfile.name || 'Guest',
      email: payload.email?.trim() || currentProfile.email || '',
      avatar: googleAvatar || currentProfile.avatar,
    };

    setProfile(nextProfile);
    saveAccountProfile(nextProfile);
    setLastSavedProfile(nextProfile);
    setProfileSavedAt(Date.now());
    setIsEditingProfile(false);
  }, [sanitizeAvatarUrl]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile.avatar]);

  const isProfileDirty = JSON.stringify(normalizeProfile(profile)) !== JSON.stringify(normalizeProfile(lastSavedProfile));

  useEffect(() => {
    const unsubscribe = subscribeGoogleAuth((user) => {
      setIsGoogleConnected(Boolean(user));
      if (!user) {
        setCloudBackupUpdatedAt(null);
        return;
      }
      const googleProvider = user.providerData.find((provider) => provider.providerId === 'google.com');
      applyGoogleProfile({
        displayName: user.displayName || googleProvider?.displayName,
        email: user.email || googleProvider?.email,
        photoURL: getGooglePhotoUrl(user) || googleProvider?.photoURL,
      });

      void loadBackupForCurrentUser({ enforceFreeLimit: false })
        .then((backup) => {
          setCloudBackupUpdatedAt(backup?.updatedAt ?? null);
        })
        .catch(() => {
          setCloudBackupUpdatedAt(null);
        });
    });

    return () => unsubscribe();
  }, [applyGoogleProfile]);

  const getGoogleErrorMessage = (code: string, rawMessage = '') => {
    const msg = rawMessage.toLowerCase();
    if (code === 'auth/configuration-not-found') return 'Google sign-in is not enabled in Firebase Auth for this project. Enable Google provider and set support email.';
    if (code === 'auth/unauthorized-domain') return 'This app domain is not authorized in Firebase Authentication.';
    if (code === 'auth/invalid-credential') return 'Invalid Google credential. Check Firebase Google provider and Android SHA fingerprints.';
    if (
      code.includes('10') ||
      code.includes('DEVELOPER_ERROR') ||
      msg.includes('developer_error') ||
      msg.includes('12500') ||
      msg.includes('12501') ||
      msg.includes('google-services')
    ) {
      return 'Android Google Sign-In is not configured correctly. Add app SHA-1/SHA-256 in Firebase and place latest google-services.json in android/app.';
    }
    if (code === 'auth/popup-blocked') return 'Popup was blocked. Allow popups for this site and try again.';
    if (code === 'auth/popup-closed-by-user') return 'Sign-in popup was closed before completion.';
    if (code === 'auth/operation-not-supported-in-this-environment') return 'This environment does not support popup sign-in. Redirect sign-in will be used.';
    if (code === 'auth/network-request-failed') return 'Network request failed. Check your internet connection.';
    return code || 'Unknown sign-in error.';
  };

  const refreshComponentState = useCallback(() => {
    setProfile(getAccountProfile());
    setTabs(getTabConfig());
    setSelectedCurrency(getCurrency().code);
    setSwipeNavEnabledState(getSwipeNavEnabled());
    setLiquidGlassEnabledState(getLiquidGlassEnabled());
    setPageSlideEnabledState(getPageSlideEnabled());
    setHomeSettings(getHomeSettings());
    setLastSavedProfile(getAccountProfile());
    // Trigger window events to notify other components (e.g., bottom bars)
    window.dispatchEvent(new Event('splitmate_account_changed'));
    window.dispatchEvent(new Event('splitmate_tab_config_changed'));
    window.dispatchEvent(new Event('splitmate_currency_changed'));
    window.dispatchEvent(new Event('splitmate_data_changed'));
  }, []);

  const handleGoogleSignIn = async () => {
    setIsGoogleAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      if (!user) {
        toast({ title: 'Redirecting to Google', description: 'Complete sign in and return to app.' });
        return;
      }

      const googleProvider = user.providerData.find((provider) => provider.providerId === 'google.com');
      applyGoogleProfile({
        displayName: user.displayName || googleProvider?.displayName,
        email: user.email || googleProvider?.email,
        photoURL: getGooglePhotoUrl(user) || googleProvider?.photoURL,
      });
      setCloudBackupUpdatedAt(null);
      toast({ title: 'Signed in with Google', description: 'Restore your cloud backup manually from Settings if you want to bring back old data.' });
      setIsGoogleConnected(true);

      // Refresh UI state instead of hard reloading
      refreshComponentState();
    } catch (error) {
      const code = (error as { code?: string; message?: string } | null)?.code ?? '';
      const rawMessage = (error as { message?: string } | null)?.message ?? '';
      toast({
        title: 'Google sign in failed',
        description: getGoogleErrorMessage(code, rawMessage) || rawMessage || 'Unknown sign-in error.',
        variant: 'destructive',
      });
    } finally {
      setIsGoogleAuthBusy(false);
    }
  };

  const handleCloudBackup = async () => {
    if (!isGoogleConnected) {
      toast({ title: 'Sign in required', description: 'Sign in with Google to save cloud backup.', variant: 'destructive' });
      return;
    }

    if (showBackupModal === 'none') {
      setShowBackupModal('cloud');
      return;
    }

    setShowBackupModal('none');
    setIsCloudBackupBusy(true);
    try {
      const payload = exportAllData();
      await saveBackupForCurrentUser(payload, APP_VERSION);

      // Perform a force sync of all shared expenses to ensure peers are up to date
      triggerForceSync();

      const now = new Date();
      setCloudBackupUpdatedAt(now);
      toast({ title: 'Cloud backup saved', description: 'Backup linked to your Google account.' });
    } catch (error) {
      const message = (error as { message?: string } | null)?.message || 'Could not upload backup to cloud.';
      const isDailyLimit = /free cloud backup already used for today/i.test(message);
      toast({
        title: isDailyLimit ? 'Free backup used for today' : 'Cloud backup failed',
        description: message,
        variant: isDailyLimit ? 'default' : 'destructive',
      });
    } finally {
      setIsCloudBackupBusy(false);
    }
  };

  const handleSilentCloudBackup = async () => {
    if (!isGoogleConnected) return;
    setIsCloudBackupBusy(true);
    try {
      const payload = exportAllData();
      await saveBackupForCurrentUser(payload, APP_VERSION, { silentIfFree: true });
      setCloudBackupUpdatedAt(new Date());
    } catch (e) {
      console.error('Silent backup failed', e);
    } finally {
      setIsCloudBackupBusy(false);
    }
  };

  const triggerSignOutFlow = () => {
    void handleSilentCloudBackup();
    setShowSignOutConfirm(true);
  };

  const handleCloudRestore = async () => {
    if (!isGoogleConnected) {
      toast({ title: 'Sign in required', description: 'Sign in with Google to restore cloud backup.', variant: 'destructive' });
      return;
    }

    setIsCloudRestoreBusy(true);
    try {
      const backup = await loadBackupForCurrentUser();
      if (!backup?.payload) {
        toast({ title: 'No cloud backup found', description: 'Save one first from this account.' });
        return;
      }

      const success = importData(backup.payload);
      if (!success) {
        toast({ title: 'Cloud restore failed', description: 'Backup format is invalid.', variant: 'destructive' });
        return;
      }

      setCloudBackupUpdatedAt(backup.updatedAt ?? new Date());
      toast({ title: 'Cloud restore complete', description: 'App data restored from your Google account backup.' });

      // Refresh UI state without reloading
      refreshComponentState();
    } catch (error) {
      const message = (error as { message?: string } | null)?.message || 'Could not fetch cloud backup.';
      const isDailyLimit = /free cloud restore already used for today/i.test(message);
      toast({
        title: isDailyLimit ? 'Free restore used for today' : 'Cloud restore failed',
        description: message,
        variant: isDailyLimit ? 'default' : 'destructive',
      });
    } finally {
      setIsCloudRestoreBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setIsGoogleAuthBusy(true);
    try {
      // 1. Final sync to cloud
      await handleSilentCloudBackup();

      // 2. Sign out from Firebase
      await signOutGoogle();

      // 3. WIPE ALL LOCAL DATA for privacy and fresh start
      clearAllData();

      toast({ title: 'Signed out', description: 'Your local data was cleared.' });

      // Hard redirect to clear all internal app memory state
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (error) {
      toast({ title: 'Sign out failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsGoogleAuthBusy(false);
    }
  };

  useEffect(() => {
    // Force sync on mount to fix HMR or stale state issues
    setTabs(getTabConfig());
  }, []);

  const handleCurrencyChange = (code: string) => {
    setSelectedCurrency(code);
    setCurrency(code);
    toast({ title: 'Currency Updated', description: `Now using ${CURRENCIES.find(c => c.code === code)?.name}` });
  };

  const personalCount = getPersonalExpenses().length;
  const sharedCount = getSharedExpenses().length;
  const linksCount = getLinks().length;
  const groupsCount = getGroups().length;
  const moreCount = getLoans().length + getGoals().length + getSubscriptions().length;
  const visibleTabsCount = tabs.filter(t => t.visible).length;
  const bottomTabs = tabs.filter((t) => t.visible);
  const fixedTabSet = new Set<string>(FIXED_BOTTOM_TAB_IDS);

  const handleThemeChange = (mode: ThemeMode) => {
    if (theme === mode) return;
    setTheme(mode);
    setStoredTheme(mode);
    const label = mode === 'system' ? 'Auto (System)' : mode === 'dark' ? 'Dark' : 'Light';
    toast({ title: 'Theme Updated', description: `${label} mode is now active.` });
  };

  const TAB_LABELS: Record<string, string> = {
    home: 'Home',
    personal: 'Personal',
    transactions: 'Transactions',
    shared: 'Split',
    'sms-transactions': 'SMS',
    calendar: 'Calendar',
    links: 'Links',
    categories: 'Categories',
    budgets: 'Budgets',
    accounts: 'Accounts',
    loans: 'Loans',
    goals: 'Goals',
    subscriptions: 'Subscriptions',
    converter: 'Converter',
    more: 'More',
  };

  const TAB_ICONS: Record<string, LucideIcon> = {
    home: Home,
    personal: User,
    transactions: Activity,
    shared: Users,
    'sms-transactions': MessageSquare,
    calendar: Calendar,
    links: ExternalLink,
    categories: PieChart,
    budgets: WalletCards,
    accounts: CreditCard,
    loans: Landmark,
    goals: Target,
    subscriptions: Repeat,
    converter: ArrowLeftRight,
    more: Globe,
  };

  const TAB_COLORS: Record<string, string> = {
    home: 'text-primary',
    personal: 'text-primary',
    transactions: 'text-primary',
    shared: 'text-warning',
    'sms-transactions': 'text-primary',
    calendar: 'text-primary',
    links: 'text-primary',
    categories: 'text-primary',
    budgets: 'text-primary',
    accounts: 'text-primary',
    loans: 'text-warning',
    goals: 'text-success',
    subscriptions: 'text-primary',
    converter: 'text-primary',
    more: 'text-primary',
  };

  const FLAG_MAP: Record<string, string> = {
    USD: '🇺🇸', INR: '🇮🇳', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
    AUD: '🇦🇺', CAD: '🇨🇦', AED: '🇦🇪', SGD: '🇸🇬', BRL: '🇧🇷'
  };

  const updateTabConfig = (newTabs: TabConfig[]) => {
    setTabs(newTabs);
    setTabConfig(newTabs);
    window.dispatchEvent(new Event('splitmate_tab_config_changed'));
  };

  const handleResetCustomization = () => {
    const defaultCurrency = CURRENCIES.find(c => c.code === 'USD')?.code || 'USD';
    setSelectedCurrency(defaultCurrency);
    setCurrency(defaultCurrency);
    setTheme('system');
    setStoredTheme('system');
    setAccentColorState('orange');
    setStoredAccentColor('orange');
    updateTabConfig(DEFAULT_TAB_LAYOUT);
    toast({
      title: 'Customization Reset',
      description: 'Theme, currency, accent color, and tab layout were reset to defaults.',
    });
  };

  const toggleTabVisibility = (id: string) => {
    if (fixedTabSet.has(id)) {
      toast({ title: 'Fixed Tab', description: `${TAB_LABELS[id] || id} must stay on the bottom bar.` });
      return;
    }

    const target = tabs.find((t) => t.id === id);
    if (!target) return;
    if (!target.visible && visibleTabsCount >= MAX_BOTTOM_TABS) {
      toast({
        title: 'Bottom tab limit reached',
        description: `You can keep up to ${MAX_BOTTOM_TABS} bottom tabs. Hide one tab first.`,
      });
      return;
    }

    const newTabs = tabs.map(t => t.id === id ? { ...t, visible: !t.visible } : t);
    updateTabConfig(newTabs);
  };

  const moveBottomTab = (id: string, direction: 'up' | 'down') => {
    const visible = tabs.filter((tab) => tab.visible);
    const hidden = tabs.filter((tab) => !tab.visible);
    const index = visible.findIndex((tab) => tab.id === id);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= visible.length) return;

    const reordered = [...visible];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    updateTabConfig([...reordered, ...hidden]);
  };

  const toggleHomeSetting = (key: keyof Omit<HomeTabSettings, 'currencyRateCodes' | 'sectionOrder'>) => {
    const next = { ...homeSettings, [key]: !homeSettings[key] };
    setHomeSettings(next);
    saveHomeSettings(next);
  };

  const moveHomeSection = (id: string, direction: 'up' | 'down') => {
    const order = [...homeSettings.sectionOrder];
    const index = order.indexOf(id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;

    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    const next = { ...homeSettings, sectionOrder: order };
    setHomeSettings(next);
    saveHomeSettings(next);
  };

  const toggleSelectedItem = (type: 'links' | 'subs' | 'goals' | 'balances' | 'categories', id: string) => {
    const keyMap = {
      links: 'selectedLinkIds',
      subs: 'selectedSubscriptionIds',
      goals: 'selectedGoalIds',
      balances: 'selectedPersonNames',
      categories: 'selectedCategoryNames'
    } as const;

    const key = keyMap[type];
    const current = (homeSettings[key] as string[]) || [];
    const isSelected = current.includes(id);

    let nextIds: string[];
    if (isSelected) {
      nextIds = current.filter(i => i !== id);
    } else {
      // Limit to 2 items as requested
      if (current.length >= 2) return;
      nextIds = [...current, id];
    }

    const next = { ...homeSettings, [key]: nextIds };
    setHomeSettings(next);
    saveHomeSettings(next);
  };

  const handleProfileChange = (key: keyof AccountProfile, value: AccountProfile[keyof AccountProfile]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleEditDetails = () => {
    setIsEditingProfile(true);
    if (!isGoogleConnected) {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCancelProfileEdit = () => {
    setProfile(lastSavedProfile);
    setIsEditingProfile(false);
  };

  const resizeImageToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = String(reader.result || '');
      };

      img.onload = () => {
        const size = 560;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not available'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const scale = Math.max(size / img.width, size / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const offsetX = (size - drawWidth) / 2;
        const offsetY = (size - drawHeight) / 2;

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // Prefer WebP (sharper at similar size), fallback to high-quality JPEG.
        let output = canvas.toDataURL('image/webp', 0.98);
        if (!output.startsWith('data:image/webp')) {
          output = canvas.toDataURL('image/jpeg', 0.97);
        }
        resolve(output);
      };

      img.onerror = () => reject(new Error('Invalid image'));
      reader.onerror = () => reject(new Error('Unable to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const avatar = await resizeImageToDataUrl(file);
      const nextProfile = { ...profile, avatar };
      setProfile(nextProfile);
      saveAccountProfile({
        name: nextProfile.name.trim() || 'Guest',
        email: nextProfile.email.trim(),
        bio: nextProfile.bio.trim(),
        avatar,
      });
      const normalized = normalizeProfile(nextProfile);
      setLastSavedProfile(normalized);
      setProfile(normalized);
      setIsEditingProfile(false);
      setProfileSavedAt(Date.now());
      toast({ title: 'Profile Photo Updated', description: 'Your account picture was saved.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add profile picture.';
      toast({ title: 'Upload Failed', description: message, variant: 'destructive' });
    }

    event.target.value = '';
  };

  const handleSaveProfile = () => {
    if (!isProfileDirty) return;
    const normalizedProfile: AccountProfile = normalizeProfile(profile);
    setProfile(normalizedProfile);
    try {
      saveAccountProfile(normalizedProfile);
      setLastSavedProfile(normalizedProfile);
      setIsEditingProfile(false);
      setProfileSavedAt(Date.now());
      toast({ title: 'Account Updated', description: 'Your profile details were saved.' });
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save account details.', variant: 'destructive' });
    }
  };

  const handleDragStart = (index: number, clientY: number) => {
    const el = itemRefs.current.get(index);
    if (el) dragItemHeight.current = el.offsetHeight + 8;
    setDragIndex(index);
    setDragOffsetY(0);
    dragStartY.current = clientY;
  };

  const handleDragMove = useCallback((clientY: number) => {
    if (dragIndex === null) return;
    const delta = clientY - dragStartY.current;
    setDragOffsetY(delta);
    const steps = Math.round(delta / dragItemHeight.current);
    if (steps !== 0) {
      const newIndex = Math.max(0, Math.min(tabs.length - 1, dragIndex + steps));
      if (newIndex !== dragIndex) {
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(dragIndex, 1);
        newTabs.splice(newIndex, 0, moved);
        setTabs(newTabs);
        setDragIndex(newIndex);
        setDragOffsetY(0);
        dragStartY.current = clientY;
      }
    }
  }, [dragIndex, tabs]);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null) {
      updateTabConfig(tabs);
      setDragIndex(null);
      setDragOffsetY(0);
    }
  }, [dragIndex, tabs]);

  const handleLongPressStart = (index: number, clientY: number) => {
    longPressTimer.current = setTimeout(() => {
      handleDragStart(index, clientY);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 200);
  };

  const handleLongPressCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  }, []);

  useEffect(() => {
    const shouldLock = showCustomize || showCurrencyBrowser || activePicker !== null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (shouldLock) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showCustomize, showCurrencyBrowser, showBackupModal, activePicker]);

  const backupStats = useMemo(() => {
    return {
      personal: getPersonalExpenses().length,
      shared: getSharedExpenses().length,
      groups: getGroups().length,
      links: getLinks().length,
      loans: getLoans().length,
      goals: getGoals().length,
      subscriptions: getSubscriptions().length,
    };
  }, []);

  const orderedCurrencies = useMemo(() => {
    const selected = CURRENCIES.find((currency) => currency.code === selectedCurrency);
    const others = CURRENCIES.filter((currency) => currency.code !== selectedCurrency);
    return selected ? [selected, ...others] : CURRENCIES;
  }, [selectedCurrency]);

  const quickCurrencies = useMemo(() => orderedCurrencies.slice(0, 10), [orderedCurrencies]);
  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return orderedCurrencies;

    return orderedCurrencies.filter((currency) =>
      currency.code.toLowerCase().includes(q) ||
      currency.name.toLowerCase().includes(q) ||
      currency.symbol.toLowerCase().includes(q)
    );
  }, [currencySearch, orderedCurrencies]);

  const handleExport = async () => {
    if (showBackupModal === 'none') {
      setShowBackupModal('local');
      return;
    }

    setShowBackupModal('none');
    setIsExporting(true);
    try {
      const data = exportAllData();
      const fileName = `splitmate-backup-${new Date().toISOString().split('T')[0]}.json`;
      if (Capacitor.isNativePlatform()) {
        const saved = await Filesystem.writeFile({
          path: `backups/${fileName}`,
          data,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: 'SplitMate Backup',
            text: 'Your backup JSON is ready.',
            url: saved.uri,
            dialogTitle: 'Save or share backup file',
          });
        }

        toast({
          title: 'Exported!',
          description: `Saved to Documents/backups/${fileName}`,
        });
      } else {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Small delay before cleanup
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 200);

        toast({ title: 'Exported!', description: `Saved as ${fileName}` });
      }
    } catch {
      toast({ title: "Export Failed", description: "Unable to save the file.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const success = importData(text);
      if (success) {
        toast({ title: "Imported!", description: "Data restored successfully." });
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast({ title: "Import Failed", description: "Invalid file format.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Import Failed", description: "Couldn't read the file.", variant: "destructive" });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const toggleDeleteSelection = (key: 'personal' | 'shared' | 'links' | 'more') => {
    setDeleteSelections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllForDelete = () => {
    const allSelected = deleteSelections.personal && deleteSelections.shared && deleteSelections.links && deleteSelections.more;
    setDeleteSelections({ personal: !allSelected, shared: !allSelected, links: !allSelected, more: !allSelected });
  };

  const selectedDeleteCount = () => {
    let count = 0;
    if (deleteSelections.personal) count += personalCount;
    if (deleteSelections.shared) count += sharedCount;
    if (deleteSelections.links) count += linksCount + groupsCount;
    if (deleteSelections.more) count += moreCount;
    return count;
  };

  const handleConfirmDelete = () => {
    const allSelected = deleteSelections.personal && deleteSelections.shared && deleteSelections.links && deleteSelections.more;
    if (deleteSelections.personal) clearPersonalExpenses();
    if (deleteSelections.shared) clearSharedExpenses();
    if (deleteSelections.links) clearLinksData();
    if (deleteSelections.more) clearMoreTabData();
    // Reset onboarding when all data is cleared so user sees welcome screen again
    if (allSelected) {
      localStorage.removeItem('splitmate_onboarding_done');
    }

    const parts = [];
    if (deleteSelections.personal) parts.push('personal expenses');
    if (deleteSelections.shared) parts.push('shared expenses');
    if (deleteSelections.links) parts.push('links & groups');
    if (deleteSelections.more) parts.push('extra tools');

    toast({ title: "Data Deleted", description: `Cleared ${parts.join(', ')}.` });
    setDeleteStep('closed');
    setDeleteSelections({ personal: false, shared: false, links: false, more: false });
    setTimeout(() => window.location.reload(), 800);
  };

  const hasAnySelection = deleteSelections.personal || deleteSelections.shared || deleteSelections.links || deleteSelections.more;

  return (
    <div className="p-4 space-y-6 pb-20">
      {/* Header — crafted */}
      <div className="pt-4 pb-1">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl slab flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
              aria-label="Back"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[28px] font-bold leading-none tracking-tight">Settings<span className="text-primary">.</span></h1>
          </div>
        </div>
        <hr className="rule-dashed mt-4" />
      </div>

      {/* Account Profile */}
      <div>
        <p className="text-xs text-muted-foreground px-2 mb-2 uppercase">Profile</p>
        <div className="ios-card-modern p-4">
          {!isEditingProfile ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {/* Avatar */}
                <button
                  onClick={() => {
                    if (profile.avatar && !avatarLoadFailed) setShowFullScreenAvatar(true);
                  }}
                  className="relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-secondary border border-border/10 shrink-0"
                  style={{
                    boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.15)',
                  }}
                >
                  {profile.avatar && !avatarLoadFailed ? (
                    <img
                      src={profile.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setAvatarLoadFailed(true);
                      }}
                    />
                  ) : (
                    <UserCircle2 size={36} className="text-muted-foreground" />
                  )}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

                {/* Name & Email Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-base font-bold truncate text-foreground">{profile.name || 'Guest'}</p>
                    {isEffectivePro && (
                      <img
                        src="/assets/pro-verified-gold.png"
                        alt="Pro verified"
                        className="w-4 h-4 object-contain"
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{profile.email || 'No email added yet'}</p>
                  {profile.bio && (
                    <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{profile.bio}</p>
                  )}
                </div>
              </div>

              {/* Action Buttons on the right */}
              <div className="flex items-center gap-2 shrink-0">
                {isGoogleConnected ? (
                  // Google Connected: Only Sign Out, no edit details button
                  <button
                    onClick={triggerSignOutFlow}
                    disabled={isGoogleAuthBusy}
                    className="h-10 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    style={{ background: 'transparent', border: '1px solid hsl(var(--destructive) / 0.3)' }}
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                ) : (
                  // Guest: Edit details and Google Sign-in
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleEditDetails}
                      className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-95 bg-secondary border border-border/10"
                      title="Edit Profile"
                    >
                      <Pencil size={16} className="text-primary" />
                    </button>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleAuthBusy}
                      className="h-10 px-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-60 text-xs text-primary-foreground"
                      style={{
                        background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
                        boxShadow: '0 4px 12px -4px hsl(var(--primary) / 0.5)',
                      }}
                    >
                      <LogIn size={14} />
                      {isGoogleAuthBusy ? '...' : 'Sign In'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Editing details (only available to Guest accounts since edit button is hidden/removed for Google accounts)
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-secondary border border-border/10 cursor-pointer group shrink-0"
                >
                  {profile.avatar && !avatarLoadFailed ? (
                    <img
                      src={profile.avatar}
                      alt="Profile"
                      className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setAvatarLoadFailed(true);
                      }}
                    />
                  ) : (
                    <UserCircle2 size={36} className="text-muted-foreground group-hover:opacity-75 transition-opacity" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil size={14} className="text-white" />
                  </div>
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Edit Account Details</p>
                  <p className="text-xs text-muted-foreground">Change name, email or custom bio</p>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  ref={nameInputRef}
                  value={profile.name}
                  onChange={(e) => {
                    if (!isGoogleConnected) handleProfileChange('name', e.target.value);
                  }}
                  placeholder="Your name"
                  className="w-full h-11 px-3 rounded-xl text-sm"
                  style={{
                    background: 'hsl(var(--secondary) / 0.45)',
                    border: '1px solid hsl(var(--border) / 0.3)',
                  }}
                />
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => {
                    if (!isGoogleConnected) handleProfileChange('email', e.target.value);
                  }}
                  placeholder="Email (optional)"
                  className="w-full h-11 px-3 rounded-xl text-sm"
                  style={{
                    background: 'hsl(var(--secondary) / 0.45)',
                    border: '1px solid hsl(var(--border) / 0.3)',
                  }}
                />
                <textarea
                  value={profile.bio}
                  onChange={(e) => handleProfileChange('bio', e.target.value)}
                  placeholder="Short bio (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                  style={{ background: 'hsl(var(--secondary) / 0.45)', border: '1px solid hsl(var(--border) / 0.3)' }}
                />
              </div>

              {isProfileDirty ? (
                <div className="flex gap-2.5">
                  <button
                    onClick={handleCancelProfileEdit}
                    className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm border border-border bg-secondary/50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-semibold text-sm"
                    style={{
                      background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))',
                      color: 'hsl(var(--primary-foreground))',
                    }}
                  >
                    <Save size={14} />
                    Save Changes
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCancelProfileEdit}
                  className="w-full px-4 py-3 rounded-2xl font-semibold text-sm border border-border bg-secondary/50"
                >
                  Close Editor
                </button>
              )}
            </div>
          )}
        </div>

        {/* Google explanation link for guests */}
        {!isEditingProfile && !isGoogleConnected && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setShowPrivacy(true)}
              className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
            >
              <Shield size={12} />
              Why do I need to sign in?
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground px-2 mb-2 uppercase">PRO</p>
        <div className="ios-card-modern overflow-hidden">

          {/* Pro Features row */}
          <button
            onClick={() => navigate('/pro')}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all relative overflow-hidden group active:scale-[0.98]"
            style={{
              background: isEffectivePro
                ? 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted) / 0.55))'
                : 'linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted) / 0.35))',
            }}
          >
            <img
              src="/assets/pro-verified-gold.png"
              alt="Pro verified"
              className="w-7 h-7 object-contain shrink-0"
            />
            <div className="flex-1 text-left">
              <h2 className="font-semibold text-sm text-foreground mb-0.5">
                Pro Features
              </h2>
              <p className={cn('text-[11px] text-muted-foreground', isEffectivePro && 'text-success/80')}>
                {isEffectivePro ? `Current plan: ${plan ?? 'Pro'}` : 'Upgrade to unlock premium tools'}
              </p>
            </div>
            <div className="flex items-center justify-center w-6 h-6 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5">
              <ChevronRight size={18} className="text-muted-foreground/60 group-hover:text-primary transition-colors" />
            </div>
          </button>

          {/* Divider + Ads row — only when not Pro */}
          {!isEffectivePro && (
            <>
              <div className="h-px bg-border/20 mx-4" />
              <button
                className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all relative active:scale-[0.985] group"
                style={{
                  background: isAdFree
                    ? 'linear-gradient(165deg, hsl(var(--card)), hsl(142 70% 45% / 0.04))'
                    : 'linear-gradient(160deg, hsl(var(--card)), hsl(var(--primary) / 0.03))',
                }}
                onClick={async () => {
                  if (isAdFree) return;
                  const success = await showRewardAd();
                  if (success) {
                    toast({ title: "Reward Earned! 💎", description: "Ads have been successfully disabled for 24 hours. Enjoy your premium experience!" });
                  }
                }}
              >
                <div className={cn(
                  "shrink-0 transition-all duration-700",
                  isAdFree ? "text-emerald-500" : "text-primary"
                )}>
                  {isAdFree ? <Crown size={20} className="animate-pulse" /> : <EyeOff size={20} />}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className={cn("font-black text-[13px] uppercase tracking-tighter italic", isAdFree ? "text-emerald-500" : "text-foreground")}>
                      {isAdFree ? 'Premium Ad-Free Active' : 'Remove Advertisements'}
                    </h2>
                    {isAdFree && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold leading-none mt-1.5 uppercase tracking-widest opacity-60">
                    {isAdFree ? `Clean UI for the next ${remainingTime}` : 'Go Ad-Free for 24 Hours'}
                  </p>
                </div>
                {isAdFree ? (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-inner">
                      <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">{remainingTime}</span>
                    </div>
                    <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em] pr-0.5">Expires</span>
                  </div>
                ) : (
                  <ChevronRight size={16} className="text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0" />
                )}
              </button>
            </>
          )}

          {/* Test Free Mode — dev only */}
          {isDevOverrideEmail(profile?.email) && (
            <>
              <div className="h-px bg-border/20 mx-4" />
              <div
                onClick={() => {
                  const next = proOverrideMode === 'on' ? 'off' : 'on';
                  setProOverride(next === 'on' ? 'on' : null);
                  setProOverrideMode(next);
                  if (next === 'on') {
                    localStorage.removeItem('ad_free_until');
                    setAdsEnabledState(true);
                    setAdsEnabled(true);
                    window.dispatchEvent(new Event('splitmate_ads_changed'));
                  }
                  toast({
                    title: next === 'on' ? 'Test Free Enabled' : 'Test Free Disabled',
                    description: next === 'on' ? 'Pro access is forced off locally, including lifetime plans.' : 'Real subscription access is restored.',
                  });
                }}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all cursor-pointer active:scale-[0.985] group"
              >
                <div className={cn(
                  "shrink-0 transition-colors duration-300",
                  proOverrideMode === 'on' ? "text-emerald-500" : "text-muted-foreground"
                )}>
                  {proOverrideMode === 'on' ? <Lock size={20} /> : <Crown size={20} />}
                </div>
                <div className="flex-1 text-left">
                  <h2 className="font-bold text-sm">Test Free Mode</h2>
                  <p className="text-[11px] text-muted-foreground">Force local free-tier behavior</p>
                </div>
                <div className={cn(
                  "w-12 h-6 rounded-full relative transition-all duration-300 border shrink-0",
                  proOverrideMode === 'on' ? "bg-emerald-500/20" : "bg-secondary"
                )}>
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-all duration-300",
                    proOverrideMode === 'on' ? "left-7 bg-emerald-500" : "left-1 bg-muted-foreground"
                  )} />
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground px-2 mb-2 uppercase">PREFERENCES</p>
        <div className="ios-card-modern overflow-hidden">

          {/* Customization */}
          <button
            onClick={() => setShowCustomize(true)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all active:scale-[0.985] group"
            style={{
              background: 'linear-gradient(160deg, hsl(var(--card)), hsl(var(--primary) / 0.03))',
            }}
          >
            <Palette size={20} className="text-white shrink-0" />
            <div className="flex-1 text-left">
              <h2 className="font-bold text-sm">Customization</h2>
              <p className="text-[11px] text-muted-foreground">Theme, Currency &amp; Bottom Tabs</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>

          {/* Divider */}
          <div className="h-px bg-border/20 mx-4" />

          {!isEffectivePro && <NativeAdCard variant="inline" />}

          {!isEffectivePro && <div className="h-px bg-border/20 mx-4" />}

          {/* Animation */}
          <button
            onClick={() => setShowAnimationMenu(true)}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all active:scale-[0.985] group"
            style={{
              background: 'linear-gradient(160deg, hsl(var(--card)), hsl(45 90% 50% / 0.03))',
            }}
          >
            <Sparkles size={20} className="text-white shrink-0" />
            <div className="flex-1 text-left">
              <h2 className="font-bold text-sm">Animation</h2>
              <p className="text-[11px] text-muted-foreground">Motion &amp; transition effects</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>

        </div>
      </div>


      {/* Animation Settings Modal */}
      {createPortal(
        <AnimatePresence>
          {showAnimationMenu && (
            <div className="fixed inset-0 z-[100000] flex items-end justify-center p-4 sm:p-0 pointer-events-none">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAnimationMenu(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
              />
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 220 }}
                className="relative w-full max-w-md bg-card border border-border/10 rounded-[1.5rem] shadow-2xl z-[120] overflow-hidden flex flex-col max-h-[75vh] mb-4 pointer-events-auto"
              >
                {/* Drag Indicator */}
                <div className="flex justify-center pt-3 pb-0">
                  <div className="w-10 h-1 rounded-full bg-muted/20" />
                </div>

                <div className="p-6 pb-4 border-b border-border/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black tracking-tighter text-foreground">Advanced Animation</h3>
                    <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mt-1">Experimental UX Props</p>
                  </div>
                  <button
                    onClick={() => setShowAnimationMenu(false)}
                    className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground active:scale-90 transition-all border border-border/5 shadow-sm"
                  >
                    <Check size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-20">
                  {/* Liquid Glass Prop */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Sparkles size={16} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-xs uppercase tracking-tight text-foreground">Liquid Navigation</h4>
                        <p className="text-[10px] font-medium text-muted-foreground leading-none mt-1">Physics-based tab transitions</p>
                      </div>
                      <div
                        onClick={() => {
                          const next = !liquidGlassEnabled;
                          setLiquidGlassEnabledState(next);
                          setLiquidGlassEnabled(next);
                          window.dispatchEvent(new CustomEvent('splitmate_liquid_glass_changed', { detail: next }));
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-all duration-500 ease-in-out cursor-pointer",
                          liquidGlassEnabled ? "bg-primary" : "bg-secondary"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-500 ease-in-out shadow-sm",
                          liquidGlassEnabled ? "left-7" : "left-1"
                        )} />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-border/5" />

                  {/* Page Sliding Prop */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                        <ChevronRight size={16} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-xs uppercase tracking-tight text-foreground">Page Sliding</h4>
                        <p className="text-[10px] font-medium text-muted-foreground leading-none mt-1">Cross-page sliding motion</p>
                      </div>
                      <div
                        onClick={() => {
                          const next = !pageSlideEnabled;
                          setPageSlideEnabledState(next);
                          setPageSlideEnabled(next);
                          window.dispatchEvent(new Event('splitmate_page_slide_changed'));
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-all duration-500 ease-in-out cursor-pointer",
                          pageSlideEnabled ? "bg-primary" : "bg-secondary"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-500 ease-in-out shadow-sm",
                          pageSlideEnabled ? "left-7" : "left-1"
                        )} />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-border/5" />

                  {/* Swipe Navigation Prop */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                        <ArrowLeftRight size={16} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-xs uppercase tracking-tight text-foreground">Swipe Control</h4>
                        <p className="text-[10px] font-medium text-muted-foreground leading-none mt-1">Edge-swipe gestures</p>
                      </div>
                      <div
                        onClick={() => {
                          const next = !swipeNavEnabled;
                          setSwipeNavEnabledState(next);
                          setSwipeNavEnabled(next);
                          window.dispatchEvent(new Event('splitmate_swipe_nav_changed'));
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full relative transition-all duration-500 ease-in-out cursor-pointer",
                          swipeNavEnabled ? "bg-primary" : "bg-secondary"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-500 ease-in-out shadow-sm",
                          swipeNavEnabled ? "left-7" : "left-1"
                        )} />
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}



      {/* Backup & Restore */}
      <div>
        <p className="text-xs text-muted-foreground px-2 mb-2 uppercase">DATA</p>
        <div className="ios-card-modern p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-secondary rounded-xl flex items-center justify-center">
              <Database size={13} className="text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-sm">Backup & Restore</h2>
          </div>
          {isGoogleConnected && (
            <p className="text-[10px] text-muted-foreground font-medium italic opacity-80">
              {cloudBackupUpdatedAt
                ? `Sync: ${cloudBackupUpdatedAt.toLocaleDateString()}`
                : 'Not synced'}
            </p>
          )}
        </div>

        {isGoogleConnected && (
          <div
            onClick={() => {
              const next = !profile.nightlyBackupEnabled;
              const currentSaved = getAccountProfile();
              const updated = { ...currentSaved, nightlyBackupEnabled: next };
              const saved = saveAccountProfile(updated);
              if (!saved) return;
              handleProfileChange('nightlyBackupEnabled', next);
              if (!isEditingProfile) {
                setLastSavedProfile(updated);
              }
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl transition-all bg-secondary/20 border border-border/5 active:scale-[0.99] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500",
                profile.nightlyBackupEnabled ? "bg-success/10 rotate-12" : "bg-muted/10 opacity-70"
              )}>
                <Sparkles size={16} className={profile.nightlyBackupEnabled ? "text-success" : "text-muted-foreground"} />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold leading-none">Autosave to Cloud</p>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-medium leading-tight">Syncs daily at 12:00 am</p>
              </div>
            </div>

            <div className={cn(
              "w-10 h-5 rounded-full relative transition-all duration-300 border border-border/10",
              profile.nightlyBackupEnabled ? "bg-success/20" : "bg-secondary/60"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-300 shadow-sm flex items-center justify-center",
                profile.nightlyBackupEnabled ? "left-6 bg-success" : "left-0.5 bg-muted-foreground"
              )}>
                {profile.nightlyBackupEnabled && <Check size={8} className="text-white" strokeWidth={5} />}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {isGoogleConnected && (
            <>
              {/* Cloud Backup Item */}
              <button
                onClick={handleCloudBackup}
                disabled={isCloudBackupBusy}
                className="flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'hsl(var(--success) / 0.08)',
                  border: '1px solid hsl(var(--success) / 0.12)',
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(var(--success) / 0.15)' }}>
                  <CloudUpload size={18} className="text-success" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[11px] font-bold text-success leading-tight">Cloud Save</p>
                  <p className="text-[9px] text-success/70 font-medium truncate">Backup</p>
                </div>
              </button>

              {/* Cloud Restore Item */}
              <button
                onClick={handleCloudRestore}
                disabled={isCloudRestoreBusy}
                className="flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'hsl(var(--primary) / 0.08)',
                  border: '1px solid hsl(var(--primary) / 0.12)',
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(var(--primary) / 0.15)' }}>
                  <RotateCcw size={18} className="text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[11px] font-bold text-primary leading-tight">Cloud Load</p>
                  <p className="text-[9px] text-primary/70 font-medium truncate">Restore</p>
                </div>
              </button>
            </>
          )}

          {/* Export JSON Item */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: 'hsl(var(--secondary) / 0.5)',
              border: '1px solid hsl(var(--border) / 0.2)',
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-background/60 shadow-sm flex-shrink-0">
              <Upload size={18} className="text-foreground" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[11px] font-bold leading-tight">Export File</p>
              <p className="text-[9px] text-muted-foreground font-medium truncate">JSON File</p>
            </div>
          </button>

          {/* Import JSON Item */}
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={isImporting}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id="import-file"
            />
            <label
              htmlFor="import-file"
              className="w-full flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-95 cursor-pointer"
              style={{
                background: 'hsl(var(--secondary) / 0.5)',
                border: '1px solid hsl(var(--border) / 0.2)',
              }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-background/60 shadow-sm flex-shrink-0">
                <Download size={18} className="text-foreground" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[11px] font-bold leading-tight">Import File</p>
                <p className="text-[9px] text-muted-foreground font-medium truncate">JSON File</p>
              </div>
            </label>
          </div>
        </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="ios-card-modern overflow-hidden" style={{ border: '1px solid hsl(var(--danger) / 0.25)' }}>
        <button
          onClick={() => {
            setDeleteStep('select');
            setDeleteSelections({ personal: false, shared: false, links: false, more: false });
          }}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all active:scale-[0.985] group"
          style={{
            background: 'linear-gradient(160deg, hsl(var(--card)), hsl(var(--danger) / 0.03))',
          }}
        >
          <Trash2 size={20} className="text-white shrink-0" />
          <div className="flex-1 text-left">
            <h2 className="font-bold text-sm" style={{ color: 'hsl(var(--danger))' }}>Delete All Data</h2>
            <p className="text-[11px] text-muted-foreground">Permanently delete app data</p>
          </div>
          <ChevronRight size={16} style={{ color: 'hsl(var(--danger))' }} />
        </button>
      </div>

      <div>
        <p className="text-xs text-muted-foreground px-2 mb-2 uppercase">ABOUT</p>
        <div className="ios-card-modern overflow-hidden">
          <a
            href="https://x.com/The1UX"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3.5 px-4 py-3.5 transition-all active:scale-[0.985] group no-underline"
          >
            <UserCircle2 size={20} className="text-white shrink-0" />
            <div className="flex-1 text-left min-w-0">
              <h2 className="font-bold text-sm text-foreground">About Developer</h2>
              <p className="text-[11px] text-muted-foreground">Hi, I'm Sandesh! Privacy-first apps.</p>
            </div>
            <div className="h-8 px-3 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-tighter flex items-center gap-1.5 shrink-0 shadow-sm">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.25h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Follow
            </div>
          </a>
        </div>
      </div>

      {/* ── Portals ── */}



      {/* ── Customization Full-Page ── */}
      {showCustomize && !showCurrencyBrowser && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-[10000] flex flex-col bg-background overscroll-none"
          style={{
            top: '-200px', // Reach way above parent safe-area shift
            paddingTop: '200px', // Move content back down
            height: 'calc(100dvh + 200px)',
            width: '100vw',
            background: 'hsl(var(--background))',
          }}
          onTouchMove={(e) => { if (dragIndex !== null) { e.preventDefault(); handleDragMove(e.touches[0].clientY); } }}
          onTouchEnd={() => { handleLongPressCancel(); handleDragEnd(); }}
          onMouseMove={(e) => { if (dragIndex !== null) handleDragMove(e.clientY); }}
          onMouseUp={() => { handleLongPressCancel(); handleDragEnd(); }}
        >
          {/* Header — editorial */}
          <div className="px-5 pt-12 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCustomize(false)}
                className="w-10 h-10 rounded-2xl bg-secondary/60 border border-border/55 flex items-center justify-center active:scale-95 transition-all"
                aria-label="Back"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Customization</h1>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">
            {/* Theme — Appearance */}
            <section>
              <div className="section-head mb-3">
                <h2>Appearance</h2>
                <span className="mono-label">01 / Theme</span>
              </div>
              <div className="slab-flat p-5 space-y-4">
                <p className="text-[13px] text-muted-foreground leading-snug">
                  Choose how the app looks. <span className="text-foreground font-semibold">Auto</span> follows your phone.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { mode: 'light' as ThemeMode, icon: Sun, label: 'Light' },
                    { mode: 'dark' as ThemeMode, icon: Moon, label: 'Dark' },
                    { mode: 'system' as ThemeMode, icon: Monitor, label: 'Auto' },
                  ]).map(({ mode, icon: Icon, label }) => {
                    const active = theme === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => handleThemeChange(mode)}
                        className={cn(
                          "h-16 flex flex-col items-center justify-center gap-1.5 rounded-2xl border transition-all active:scale-[0.97]",
                          active
                            ? "bg-primary/10 border-primary/50 text-primary"
                            : "bg-secondary/40 border-border/55 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon size={18} strokeWidth={2.2} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Accent Color Section */}
            <section>
              <div className="section-head mb-3">
                <h2>Accent Color</h2>
                <span className="mono-label">02 / Color</span>
              </div>
              <div className="slab-flat p-5">
                <div className="flex items-center justify-between px-2 py-1">
                  {([
                    { id: 'orange' as AccentColor, label: 'Orange', bgClass: 'bg-[#ff6b35]' },
                    { id: 'purple' as AccentColor, label: 'Purple', bgClass: 'bg-[#8b5cf6]' },
                    { id: 'green' as AccentColor, label: 'Green', bgClass: 'bg-[#10b981]' },
                    { id: 'blue' as AccentColor, label: 'Blue', bgClass: 'bg-[#3b82f6]' },
                    { id: 'red' as AccentColor, label: 'Red', bgClass: 'bg-[#f43f5e]' },
                  ]).map(({ id, label, bgClass }) => {
                    const active = accentColor === id;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          if (accentColor === id) return;
                          setAccentColorState(id);
                          setStoredAccentColor(id);
                          toast({ title: 'Accent Color Updated', description: `${label} theme is now active.` });
                        }}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center relative active:scale-90 transition-all border-2",
                          active ? "border-primary bg-primary/10" : "border-transparent hover:border-border/40"
                        )}
                        title={label}
                      >
                        <div className={cn("w-8 h-8 rounded-full shrink-0 shadow-sm", bgClass)} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Currency */}
            <section>
              <div className="section-head mb-3">
                <h2>Main Currency</h2>
                <span className="mono-label">03 / Money</span>
              </div>
              <div className="slab-flat p-5 space-y-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] text-muted-foreground leading-snug">
                    Used across every screen.
                  </p>
                  <span className="text-[11px] font-bold text-primary tabular tracking-wide">
                    {selectedCurrency} · {CURRENCIES.find(c => c.code === selectedCurrency)?.name}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {quickCurrencies.map((c) => {
                    const active = selectedCurrency === c.code;
                    return (
                      <button
                        key={c.code}
                        onClick={() => handleCurrencyChange(c.code)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95",
                          active
                            ? "bg-primary/10 border-primary/50"
                            : "bg-secondary/30 border-border/55"
                        )}
                      >
                        <span className={cn("text-xl font-bold leading-none", active ? "text-primary" : "text-foreground")}>
                          {c.symbol}
                        </span>
                        <span className={cn("text-[10px] font-bold tracking-wider", active ? "text-primary" : "text-muted-foreground")}>
                          {c.code}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    setCurrencySearch('');
                    setShowCurrencyBrowser(true);
                  }}
                  className="btn-ghost-dashed w-full !py-3 gap-2"
                >
                  <Search size={14} />
                  Browse all currencies
                </button>
              </div>
            </section>


            {/* Home Dashboard section */}
            <section>
              <div className="section-head mb-3">
                <h2>Home Dashboard</h2>
                <span className="mono-label">04 / Widgets</span>
              </div>
              <div className="slab-flat p-5 space-y-4">
                <p className="text-[13px] text-muted-foreground leading-snug">
                  Toggle widgets on or off, and drag the arrows to <span className="text-foreground font-semibold">reorder</span> what shows first on Home.
                </p>


              <div className="space-y-2.5">
                {homeSettings.sectionOrder.map((sectionId, index) => {
                  const item = [
                    { id: 'stats', label: 'Stats & Totals', icon: Activity, desc: 'Incoming, outgoing & person counts', settingKey: 'showStats' },
                    { id: 'spending', label: 'Spending Breakdown', icon: PieChart, desc: 'Category-wise distribution chart', settingKey: 'showSpendingBreakdown' },
                    { id: 'balances', label: 'Top Balances', icon: Users, desc: 'Quick view of people who owe you', settingKey: 'showTopBalances' },
                    { id: 'categories', label: 'Category Insights', icon: LayoutGrid, desc: 'Detailed spending by category', settingKey: 'showCategories' },
                    { id: 'budgets', label: 'My Budgets', icon: Landmark, desc: 'Track your budget limits', settingKey: 'showBudgets' },
                    { id: 'converter', label: 'Currency Converter', icon: Globe, desc: 'Quick exchange rate tool', settingKey: 'showConverter' },
                    { id: 'personal', label: 'Recent Personal', icon: User, desc: 'Your latest private expenses', settingKey: 'showRecentPersonal' },
                    { id: 'shared', label: 'Recent Shared', icon: Users, desc: 'Latest activity in shared tabs', settingKey: 'showRecentShared' },
                    { id: 'goals', label: 'Active Goals', icon: Target, desc: 'Track your saving progress', settingKey: 'showGoals' },
                    { id: 'loans', label: 'Ongoing Loans', icon: Landmark, desc: 'View borrowed & given loans', settingKey: 'showLoans' },
                    { id: 'subs', label: 'Upcoming Bills', icon: Repeat, desc: 'Next due subscriptions', settingKey: 'showSubscriptions' },
                    { id: 'links', label: 'Pinned Links', icon: ExternalLink, desc: 'Quick access to top websites', settingKey: 'showPinnedLinks' },
                    { id: 'rates', label: 'Live Rates', icon: Globe, desc: 'Market exchange rates', settingKey: 'showCurrencyRates' },
                  ].find(i => i.id === sectionId);

                  if (!item) return null;
                  const isEnabled = homeSettings[item.settingKey as keyof HomeTabSettings] as boolean;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all border",
                        isEnabled
                          ? "bg-primary/10 border-primary/20"
                          : "bg-secondary/20 border-transparent grayscale-[0.6] opacity-70"
                      )}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHomeSetting(item.settingKey as keyof Omit<HomeTabSettings, 'currencyRateCodes' | 'sectionOrder'>);
                        }}
                        className="flex-1 flex items-center gap-3 text-left min-w-0"
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
                          isEnabled ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                        )}>
                          <item.icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-bold text-sm leading-tight", isEnabled ? "text-foreground" : "text-muted-foreground")}>{item.label}</p>
                          <p className={cn("text-[10px] font-medium mt-0.5 truncate", isEnabled ? "text-muted-foreground" : "text-muted-foreground/70")}>{item.desc}</p>
                        </div>
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center border transition-all shrink-0",
                          isEnabled ? "bg-primary border-primary" : "bg-transparent border-border"
                        )}>
                          {isEnabled && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
                        </div>
                      </button>

                      {isEnabled && ['goals', 'subs', 'links', 'balances', 'categories'].includes(item.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePicker(item.id as 'goals' | 'subs' | 'links' | 'balances' | 'categories');
                          }}
                          className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center hover:bg-secondary/50 active:scale-90 transition-all ml-1 shrink-0"
                        >
                          <ChevronRight size={14} className="text-muted-foreground" />
                        </button>
                      )}

                      <div className="flex flex-col gap-1 pl-2 border-l border-border/10">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); moveHomeSection(item.id, 'up'); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-transparent text-muted-foreground disabled:opacity-30 active:scale-90 transition-all hover:bg-secondary/40"
                        >
                          <ChevronUp size={14} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          disabled={index === homeSettings.sectionOrder.length - 1}
                          onClick={(e) => { e.stopPropagation(); moveHomeSection(item.id, 'down'); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center bg-transparent text-muted-foreground disabled:opacity-30 active:scale-90 transition-all hover:bg-secondary/40"
                        >
                          <ChevronDown size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </section>


            {/* Item Picker Modal */}
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
                      initial={{ y: "100%", opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: "100%", opacity: 0 }}
                      transition={{ type: "spring", damping: 28, stiffness: 220 }}
                      className="relative w-full max-w-md bg-card border border-border/10 rounded-[1.5rem] shadow-2xl z-[120] overflow-hidden flex flex-col max-h-[75vh] mb-4 pointer-events-auto"
                    >
                      {/* Drag Indicator */}
                      <div className="flex justify-center pt-3 pb-0">
                        <div className="w-10 h-1 rounded-full bg-muted/20" />
                      </div>

                      <div className="p-6 pb-4 border-b border-border/5 flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-black tracking-tighter text-foreground capitalize">Select {activePicker}</h3>
                          <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mt-1">Core Dashboard Elements</p>
                        </div>
                        <button
                          onClick={() => setActivePicker(null)}
                          className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground active:scale-90 transition-all border border-border/5 shadow-sm"
                        >
                          <Check size={20} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-3 pb-10">
                        {activePicker === 'goals' && getGoals().map(goal => {
                          const isSelected = homeSettings.selectedGoalIds.includes(goal.id);
                          return (
                            <div
                              key={goal.id}
                              onClick={() => toggleSelectedItem('goals', goal.id)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                isSelected ? "bg-primary/10 border-primary/20 shadow-sm" : "bg-secondary/10 border-transparent opacity-70"
                              )}
                            >
                              <span className="font-bold text-sm">{goal.name}</span>
                              {isSelected && <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center"><Check size={14} className="text-primary-foreground" strokeWidth={3} /></div>}
                            </div>
                          );
                        })}

                        {activePicker === 'subs' && getSubscriptions().map(sub => {
                          const isSelected = homeSettings.selectedSubscriptionIds.includes(sub.id);
                          return (
                            <div
                              key={sub.id}
                              onClick={() => toggleSelectedItem('subs', sub.id)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                isSelected ? "bg-primary/10 border-primary/20 shadow-sm" : "bg-secondary/10 border-transparent opacity-70"
                              )}
                            >
                              <span className="font-bold text-sm">{sub.appName}</span>
                              {isSelected && <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center"><Check size={14} className="text-primary-foreground" strokeWidth={3} /></div>}
                            </div>
                          );
                        })}

                        {activePicker === 'links' && getLinks().map(link => {
                          const isSelected = homeSettings.selectedLinkIds.includes(link.id);
                          return (
                            <div
                              key={link.id}
                              onClick={() => toggleSelectedItem('links', link.id)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                isSelected ? "bg-primary/10 border-primary/20 shadow-sm" : "bg-secondary/10 border-transparent opacity-70"
                              )}
                            >
                              <span className="font-bold text-sm truncate pr-2">{link.title || link.name}</span>
                              {isSelected && <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center"><Check size={14} className="text-primary-foreground" strokeWidth={3} /></div>}
                            </div>
                          );
                        })}

                        {activePicker === 'balances' && allPeople.map(person => {
                          const isSelected = homeSettings.selectedPersonNames.includes(person);
                          return (
                            <div
                              key={person}
                              onClick={() => toggleSelectedItem('balances', person)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                isSelected ? "bg-primary/10 border-primary/20 shadow-sm" : "bg-secondary/10 border-transparent opacity-70"
                              )}
                            >
                              <span className="font-bold text-sm">{person}</span>
                              {isSelected && <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center"><Check size={14} className="text-primary-foreground" strokeWidth={3} /></div>}
                            </div>
                          );
                        })}

                        {activePicker === 'categories' && allCategories.map(cat => {
                          const isSelected = homeSettings.selectedCategoryNames.includes(cat);
                          return (
                            <div
                              key={cat}
                              onClick={() => toggleSelectedItem('categories', cat)}
                              className={cn(
                                "p-4 rounded-2xl border transition-all flex items-center justify-between",
                                isSelected ? "bg-primary/10 border-primary/20 shadow-sm" : "bg-secondary/10 border-transparent opacity-70"
                              )}
                            >
                              <span className="font-bold text-sm">{cat}</span>
                              {isSelected && <div className="w-6 h-6 bg-primary rounded-xl flex items-center justify-center"><Check size={14} className="text-primary-foreground" strokeWidth={3} /></div>}
                            </div>
                          );
                        })}

                        {((activePicker === 'goals' && getGoals().length === 0) ||
                          (activePicker === 'subs' && getSubscriptions().length === 0) ||
                          (activePicker === 'links' && getLinks().length === 0) ||
                          (activePicker === 'balances' && allPeople.length === 0) ||
                          (activePicker === 'categories' && allCategories.length === 0)) && (
                            <div className="py-20 text-center space-y-3">
                              <div className="w-14 h-14 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
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

            {/* Divider */}
            <div className="h-px" style={{ background: 'hsl(var(--border) / 0.3)' }} />

            {/* Bottom Tabs section */}
            <section>
              <div className="section-head mb-3">
                <h2>Bottom Navigation</h2>
                <span className="mono-label">05 / Tabs</span>
              </div>
              <div className="slab-flat p-5 space-y-4">
                <p className="text-[13px] text-muted-foreground leading-snug">
                  Reorder the tabs at the bottom of the app. Use the arrows or <span className="text-foreground font-semibold">long-press &amp; drag</span>.
                </p>

                <div className="space-y-2">
                  {bottomTabs.map((tab, index) => {
                    const isFixed = fixedTabSet.has(tab.id);
                    const Icon = TAB_ICONS[tab.id] || Sparkles;
                    const iconColor = TAB_COLORS[tab.id] || 'text-primary';
                    return (
                      <div
                        key={tab.id}
                        className={cn(
                          "h-14 flex items-center gap-3 p-2 rounded-2xl transition-all bg-secondary/40 border border-border/55 active:scale-[0.98]",
                          tab.id === 'home' && "border-primary/45"
                        )}
                        ref={(el) => {
                          if (el) itemRefs.current.set(index, el);
                          else itemRefs.current.delete(index);
                        }}
                        style={{
                          transform: dragIndex === index ? `translateY(${dragOffsetY}px)` : 'translateY(0px)',
                          transition: dragIndex === index ? 'none' : 'transform 0.18s ease',
                          zIndex: dragIndex === index ? 10 : 1,
                          opacity: dragIndex === index ? 0.96 : 1,
                        }}
                      >
                        <div
                          className="flex-1 flex items-center gap-3 min-w-0"
                          style={{ touchAction: 'none', cursor: 'grab' }}
                          onTouchStart={(e) => {
                            if (e.touches[0]) handleLongPressStart(index, e.touches[0].clientY);
                          }}
                          onTouchEnd={handleLongPressCancel}
                          onTouchCancel={handleLongPressCancel}
                          onMouseDown={(e) => handleLongPressStart(index, e.clientY)}
                          onMouseUp={handleLongPressCancel}
                          onMouseLeave={handleLongPressCancel}
                        >
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-background border border-border/55 shrink-0">
                            <Icon size={17} className={iconColor} strokeWidth={2.4} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-sm block truncate text-foreground leading-tight">
                              {TAB_LABELS[tab.id] || tab.id}
                            </span>
                            <span className="mono-label">
                              {tab.id === 'home' ? 'Default · first tab' : isFixed ? 'Pinned' : `Position ${index + 1}`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pr-1">
                          <button
                            onClick={() => moveBottomTab(tab.id, 'up')}
                            disabled={index === 0}
                            className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 bg-background border border-border/55 hover:border-primary/40 active:scale-90 transition-all text-muted-foreground hover:text-primary"
                            aria-label="Move up"
                          >
                            <ChevronUp size={15} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => moveBottomTab(tab.id, 'down')}
                            disabled={index === bottomTabs.length - 1}
                            className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 bg-background border border-border/55 hover:border-primary/40 active:scale-90 transition-all text-muted-foreground hover:text-primary"
                            aria-label="Move down"
                          >
                            <ChevronDown size={15} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Reset */}
            <section className="pt-2">
              <button
                onClick={handleResetCustomization}
                className="btn-ghost-dashed w-full gap-2 !py-4"
              >
                <RotateCcw size={15} />
                Reset everything to defaults
              </button>
              <p className="text-[11px] text-muted-foreground text-center mt-2 leading-snug">
                Restores theme, currency, widgets, and tab order. Your data stays safe.
              </p>
            </section>

          </div>
        </div>,
        document.body
      )}

      {showCustomize && showCurrencyBrowser && createPortal(
        <div className="fixed inset-0 z-[10001] flex flex-col" style={{ background: 'hsl(var(--background))', overscrollBehavior: 'contain' }}>
          <div className="flex items-center gap-4 px-6 pt-12 pb-4">
            <button
              onClick={() => setShowCurrencyBrowser(false)}
              className="w-11 h-11 rounded-2xl bg-secondary/80 border border-border/10 flex items-center justify-center active:scale-90 transition-all shadow-sm"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">All Currencies</h1>
              <p className="text-xs text-muted-foreground">Search and choose your currency</p>
            </div>
          </div>

          <div className="px-5 pb-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={currencySearch}
                onChange={(e) => setCurrencySearch(e.target.value)}
                placeholder="Search by name, code, or symbol"
                className="w-full h-11 pl-10 pr-3 rounded-2xl text-sm"
                style={{ background: 'hsl(var(--muted) / 0.3)', border: '1px solid hsl(var(--border) / 0.2)' }}
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-2" style={{ overscrollBehavior: 'contain' }}>
            {filteredCurrencies.length === 0 ? (
              <div className="ios-card-modern p-4 text-sm text-muted-foreground text-center">
                No currency found for "{currencySearch}".
              </div>
            ) : (
              filteredCurrencies.map((currency) => {
                const isSelected = selectedCurrency === currency.code;
                return (
                  <button
                    key={currency.code}
                    onClick={() => {
                      handleCurrencyChange(currency.code);
                      setShowCurrencyBrowser(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200"
                    style={{
                      background: isSelected ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--card))',
                      border: `1px solid ${isSelected ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--border) / 0.25)'}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold"
                      style={{ background: 'hsl(var(--secondary) / 0.65)', color: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--foreground))' }}
                    >
                      {currency.symbol}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{currency.name}</p>
                      <p className="text-xs text-muted-foreground">{currency.code}</p>
                    </div>
                    {isSelected && <Check size={16} className="text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete Modal ── */}
      {deleteStep !== 'closed' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'hsl(0 0% 0% / 0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setDeleteStep('closed')}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Step 1: Select what to delete */}
            {deleteStep === 'select' && (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--danger) / 0.12)' }}>
                    <Trash2 size={18} style={{ color: 'hsl(var(--danger))' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Delete Data</h3>
                    <p className="text-xs text-muted-foreground">Choose what to remove</p>
                  </div>
                </div>

                {/* Select all */}
                <button
                  onClick={selectAllForDelete}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground"
                  style={{ background: 'hsl(var(--secondary) / 0.5)' }}
                >
                  <div className="w-5 h-5 rounded-md border flex items-center justify-center"
                    style={{
                      background: deleteSelections.personal && deleteSelections.shared && deleteSelections.links && deleteSelections.more ? 'hsl(var(--danger))' : 'transparent',
                      borderColor: deleteSelections.personal && deleteSelections.shared && deleteSelections.links && deleteSelections.more ? 'hsl(var(--danger))' : 'hsl(var(--border))',
                    }}>
                    {deleteSelections.personal && deleteSelections.shared && deleteSelections.links && deleteSelections.more && <Check size={12} color="white" />}
                  </div>
                  Select All
                </button>

                {/* Personal */}
                <button
                  onClick={() => toggleDeleteSelection('personal')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-150 text-left"
                  style={{
                    background: deleteSelections.personal ? 'hsl(var(--danger) / 0.08)' : 'hsl(var(--secondary) / 0.5)',
                    border: `1px solid ${deleteSelections.personal ? 'hsl(var(--danger) / 0.25)' : 'hsl(var(--border) / 0.25)'}`,
                  }}
                >
                  <div className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                    style={{
                      background: deleteSelections.personal ? 'hsl(var(--danger))' : 'transparent',
                      borderColor: deleteSelections.personal ? 'hsl(var(--danger))' : 'hsl(var(--border))',
                    }}>
                    {deleteSelections.personal && <Check size={12} color="white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Personal Expenses</p>
                    <p className="text-[11px] text-muted-foreground">{personalCount} expense{personalCount !== 1 ? 's' : ''} will be deleted</p>
                  </div>
                  <span className="text-lg font-bold" style={{ color: deleteSelections.personal ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))' }}>
                    {personalCount}
                  </span>
                </button>

                {/* Shared */}
                <button
                  onClick={() => toggleDeleteSelection('shared')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-150 text-left"
                  style={{
                    background: deleteSelections.shared ? 'hsl(var(--danger) / 0.08)' : 'hsl(var(--secondary) / 0.5)',
                    border: `1px solid ${deleteSelections.shared ? 'hsl(var(--danger) / 0.25)' : 'hsl(var(--border) / 0.25)'}`,
                  }}
                >
                  <div className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                    style={{
                      background: deleteSelections.shared ? 'hsl(var(--danger))' : 'transparent',
                      borderColor: deleteSelections.shared ? 'hsl(var(--danger))' : 'hsl(var(--border))',
                    }}>
                    {deleteSelections.shared && <Check size={12} color="white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Shared Expenses</p>
                    <p className="text-[11px] text-muted-foreground">{sharedCount} transaction{sharedCount !== 1 ? 's' : ''} & all balances</p>
                  </div>
                  <span className="text-lg font-bold" style={{ color: deleteSelections.shared ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))' }}>
                    {sharedCount}
                  </span>
                </button>

                {/* Links */}
                <button
                  onClick={() => toggleDeleteSelection('links')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-150 text-left"
                  style={{
                    background: deleteSelections.links ? 'hsl(var(--danger) / 0.08)' : 'hsl(var(--secondary) / 0.5)',
                    border: `1px solid ${deleteSelections.links ? 'hsl(var(--danger) / 0.25)' : 'hsl(var(--border) / 0.25)'}`,
                  }}
                >
                  <div className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                    style={{
                      background: deleteSelections.links ? 'hsl(var(--danger))' : 'transparent',
                      borderColor: deleteSelections.links ? 'hsl(var(--danger))' : 'hsl(var(--border))',
                    }}>
                    {deleteSelections.links && <Check size={12} color="white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Links & Groups</p>
                    <p className="text-[11px] text-muted-foreground">{linksCount} link{linksCount !== 1 ? 's' : ''}, {groupsCount} group{groupsCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-lg font-bold" style={{ color: deleteSelections.links ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))' }}>
                    {linksCount + groupsCount}
                  </span>
                </button>

                {/* More Features */}
                <button
                  onClick={() => toggleDeleteSelection('more')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-150 text-left"
                  style={{
                    background: deleteSelections.more ? 'hsl(var(--danger) / 0.08)' : 'hsl(var(--secondary) / 0.5)',
                    border: `1px solid ${deleteSelections.more ? 'hsl(var(--danger) / 0.25)' : 'hsl(var(--border) / 0.25)'}`,
                  }}
                >
                  <div className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                    style={{
                      background: deleteSelections.more ? 'hsl(var(--danger))' : 'transparent',
                      borderColor: deleteSelections.more ? 'hsl(var(--danger))' : 'hsl(var(--border))',
                    }}>
                    {deleteSelections.more && <Check size={12} color="white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">Extra Features & Tools</p>
                    <p className="text-[11px] text-muted-foreground">Loans, Goals, Subscriptions & Notes</p>
                  </div>
                  <span className="text-lg font-bold" style={{ color: deleteSelections.more ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))' }}>
                    {moreCount}
                  </span>
                </button>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDeleteStep('closed')}
                    className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm"
                    style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border) / 0.3)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => hasAnySelection && setDeleteStep('confirm')}
                    disabled={!hasAnySelection}
                    className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm disabled:opacity-30 transition-opacity"
                    style={{
                      background: 'hsl(var(--danger))',
                      color: 'white',
                      boxShadow: hasAnySelection ? '0 4px 12px -4px hsl(var(--danger) / 0.5)' : 'none',
                    }}
                  >
                    Continue ({selectedDeleteCount()})
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Final confirmation */}
            {deleteStep === 'confirm' && (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--danger) / 0.15)' }}>
                    <AlertTriangle size={18} style={{ color: 'hsl(var(--danger))' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base" style={{ color: 'hsl(var(--danger))' }}>Are you sure?</h3>
                    <p className="text-xs text-muted-foreground">This cannot be undone</p>
                  </div>
                </div>

                {/* Summary of what's being deleted */}
                <div className="rounded-2xl p-3.5 space-y-2" style={{ background: 'hsl(var(--danger) / 0.06)', border: '1px solid hsl(var(--danger) / 0.12)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'hsl(var(--danger))' }}>Will be permanently deleted:</p>
                  {deleteSelections.personal && (
                    <div className="flex items-center gap-2 text-sm">
                      <X size={12} style={{ color: 'hsl(var(--danger))' }} />
                      <span>{personalCount} personal expense{personalCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {deleteSelections.shared && (
                    <div className="flex items-center gap-2 text-sm">
                      <X size={12} style={{ color: 'hsl(var(--danger))' }} />
                      <span>{sharedCount} shared transaction{sharedCount !== 1 ? 's' : ''} + all balances</span>
                    </div>
                  )}
                  {deleteSelections.links && (
                    <div className="flex items-center gap-2 text-sm">
                      <X size={12} style={{ color: 'hsl(var(--danger))' }} />
                      <span>{linksCount} link{linksCount !== 1 ? 's' : ''} & {groupsCount} group{groupsCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {deleteSelections.more && (
                    <div className="flex items-center gap-2 text-sm">
                      <X size={12} style={{ color: 'hsl(var(--danger))' }} />
                      <span>{moreCount} extra tool item{moreCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  <div className="pt-1.5 mt-1.5" style={{ borderTop: '1px solid hsl(var(--danger) / 0.1)' }}>
                    <p className="text-xs font-bold" style={{ color: 'hsl(var(--danger))' }}>Total: {selectedDeleteCount()} items</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setDeleteStep('select')}
                    className="flex-1 px-4 py-3 rounded-2xl font-semibold text-sm"
                    style={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border) / 0.3)' }}
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 px-4 py-3 rounded-2xl font-bold text-sm"
                    style={{
                      background: 'hsl(var(--danger))',
                      color: 'white',
                      boxShadow: '0 4px 12px -4px hsl(var(--danger) / 0.5)',
                    }}
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Backup Confirmation Modal ── */}
      {showBackupModal !== 'none' && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 sm:p-0"
          style={{ background: 'hsl(0 0% 0% / 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowBackupModal('none')}
        >
          <div
            className="w-full max-w-sm rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300"
            style={{
              background: 'hsl(var(--card))',
              boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center text-center space-y-3 pt-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-sm"
                  style={{ background: showBackupModal === 'local' ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--success) / 0.1)' }}>
                  {showBackupModal === 'local' ? (
                    <FileJson size={28} className="text-primary" />
                  ) : (
                    <CloudUpload size={28} className="text-success" />
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-gray-900 leading-none">
                    {showBackupModal === 'local' ? 'Export Data' : 'Cloud Backup'}
                  </h3>
                  <p className="text-sm font-medium text-muted-foreground mt-2">
                    Review your data summary before proceeding.
                  </p>
                </div>
              </div>

              <div className="bg-secondary/40 p-4 rounded-3xl border border-border/5">
                <div className="space-y-3">
                  {[
                    { label: 'Personal Expenses', count: backupStats.personal, icon: User },
                    { label: 'Shared Groups & Bills', count: backupStats.shared, icon: Users },
                    { label: 'Loans & Debts', count: backupStats.loans, icon: Landmark },
                    { label: 'Financial Goals', count: backupStats.goals, icon: Target },
                    { label: 'Cloud Links', count: backupStats.links, icon: ExternalLink },
                    { label: 'Subscriptions', count: backupStats.subscriptions, icon: Repeat },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm border border-border/10">
                          <item.icon size={12} className="text-gray-500" />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{item.label}</span>
                      </div>
                      <span className="text-[11px] font-black w-7 h-7 shrink-0 flex items-center justify-center rounded-full"
                        style={{
                          background: showBackupModal === 'local' ? 'hsl(var(--primary) / 0.1)' : 'hsl(var(--success) / 0.1)',
                          color: showBackupModal === 'local' ? 'hsl(var(--primary))' : 'hsl(var(--success))'
                        }}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={showBackupModal === 'local' ? handleExport : handleCloudBackup}
                  className="w-full py-4 rounded-2xl font-bold text-sm text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                  style={{ background: showBackupModal === 'local' ? 'hsl(var(--primary))' : 'hsl(var(--success))' }}
                >
                  {showBackupModal === 'local' ? <Download size={18} /> : <CloudUpload size={18} />}
                  {showBackupModal === 'local' ? 'Export to Device' : 'Backup to Cloud'}
                </button>
                <button
                  onClick={() => setShowBackupModal('none')}
                  className="w-full py-4 rounded-2xl font-bold text-sm text-gray-500 bg-secondary hover:bg-secondary/80 active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Privacy Info Modal ── */}
      {showPrivacy && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'hsl(0 0% 0% / 0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowPrivacy(false)}
        >
          <div
            className="w-full max-w-sm rounded-[24px] overflow-hidden"
            style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border) / 0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.12)' }}>
                  <Shield size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Privacy & Sign In</h3>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Check size={10} className="text-primary" />
                    100% Optional
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-foreground/90 leading-relaxed px-1">
                <p>
                  You do <strong className="font-bold">NOT</strong> need to sign in to use this app. All your data is stored securely on your device by default.
                </p>
                <div className="p-3 rounded-2xl" style={{ background: 'hsl(var(--secondary) / 0.5)', border: '1px solid hsl(var(--border) / 0.3)' }}>
                  <h4 className="font-semibold text-xs mb-1">Why ask for a Google account?</h4>
                  <p className="text-xs text-muted-foreground">
                    Signing in simply allows you to backup your app data securely to your own Google Drive.
                    We do not track you, sell your data, or access any files outside of this app's backup folder.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setShowPrivacy(false)}
                  className="w-full px-4 py-3 rounded-2xl font-semibold text-sm transition-all"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sign Out Confirmation Sheet */}
      {showSignOutConfirm && createPortal(
        <div className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300" onClick={() => setShowSignOutConfirm(false)}>
          <div
            className="w-full max-w-md bg-card rounded-[2.5rem] p-8 pt-10 pb-12 space-y-6 animate-in slide-in-from-bottom-10 border border-border/10 duration-500 shadow-2xl relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Backglow line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-muted/20 rounded-full mt-3" />

            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-[2.5rem] bg-destructive/10 flex items-center justify-center mx-auto mb-4 border border-destructive/20 active:scale-95 transition-all">
                <LogOut size={36} className="text-destructive translate-x-1" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Sign Out?</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="h-14 rounded-2xl bg-secondary font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all text-muted-foreground border border-border/10"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  setShowSignOutConfirm(false);
                  handleGoogleSignOut();
                }}
                className="h-14 rounded-2xl bg-destructive text-white font-black uppercase tracking-widest text-[11px] shadow-lg shadow-destructive/20 active:scale-95 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full Screen Avatar View */}
      {showFullScreenAvatar && profile.avatar && createPortal(
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => setShowFullScreenAvatar(false)}
        >
          <div className="absolute top-12 right-6 z-10">
            <button
              onClick={() => setShowFullScreenAvatar(false)}
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-all border border-white/10"
            >
              <X size={24} className="text-white" />
            </button>
          </div>

          <div
            className="w-full max-w-[90vw] aspect-square rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white/5 animate-in zoom-in-95 duration-500"
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              // Upgrade quality for Google photos in full view
              let highResAvatar = profile.avatar;
              if (highResAvatar?.includes('googleusercontent.com')) {
                highResAvatar = highResAvatar.replace(/[?&]sz=\d+/i, '').replace(/[?&]s=\d+/i, '');
                highResAvatar += highResAvatar.includes('?') ? '&s=0' : '?s=0'; // s=0 often means original resolution
              }
              return (
                <img
                  src={highResAvatar}
                  alt="Profile Full View"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              );
            })()}
          </div>

          <div className="absolute bottom-12 left-0 right-0 text-center space-y-2 px-8">
            <h2 className="text-xl font-bold text-white tracking-tight">{profile.name}</h2>
            <div className="flex items-center justify-center gap-2 opacity-50">
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
              <p className="text-[9px] text-white font-black uppercase tracking-[0.3em]">Original Quality Active</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

