// Local Storage Management for SplitMate
import { toast } from "sonner";
import { pushUpdateToCloud } from "@/integrations/firebase/sync";
import { isProUserCached, requestProUpgrade } from "@/lib/proAccess";

export interface PersonalExpense {
  id: string;
  amount: number;
  reason: string;
  category: string;
  date: string;
  createdAt: string;
  accountId?: string;
  isIncome?: boolean;
  source?: 'manual' | 'sms';
  smsExternalId?: string;
  isMirror?: boolean;
  mirrorFromId?: string;
}

export interface SharedExpense {
  id: string;
  amount: number;
  reason: string;
  paidBy: string; // 'me' or person name
  forPerson: string; // person name, 'me', or 'all'
  personName: string; // The primary counter-party name
  date: string;
  createdAt: string;
  settled: boolean;
  category?: string;
  groupId?: string;
  fromEmail?: string;
  isIncoming?: boolean; // If true, it was received from sync
  createdByMe?: boolean; // Explicitly marks if created on this device
  splitParticipants?: string[]; // Everyone involved in the split
  accountId?: string;
}

export type SmsTargetTab = 'personal' | 'split' | 'group';

export interface SmsTransactionCandidate {
  id: string;
  externalId: string;
  sourceAddress: string;
  body: string;
  amount: number;
  date: string;
  reason: string;
  name: string;
  targetTab?: SmsTargetTab;
  targetPersonName?: string;
  targetGroupId?: string;
  createdAt: string;
}

export type FinancialAccountType = 'savings' | 'bank' | 'credit-card' | 'cash' | 'wallet' | 'other';

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  budget: number;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAccountSummary extends FinancialAccount {
  income: number;
  personalSpent: number;
  sharedSpent: number;
  available: number;
}

export interface FriendGroup {
  id: string;
  name: string;
  members: string[]; // List of names
  memberEmails?: Record<string, string>; // name → gmail mapping for targeted sync
  managerName?: string; // 🔥 Added for manager permission flow
  managerEmail?: string; // 🔥 Manager identified by email for cross-device sync
  color: string;
  createdAt: string;
  syncEmails?: string[]; // 🔥 Changed to array for multiple collaborators
}

export type TripSplitType = 'equal' | 'percentage' | 'exact';

export interface TripExpense {
  id: string;
  tripId: string;
  title: string;
  category: 'Food' | 'Travel' | 'Stay' | 'Activities' | 'Other';
  amount: number;
  paidBy: string[];
  paidByAmounts?: Record<string, number>;
  borrowedFromAmounts?: Record<string, number>;
  splitBetween: string[];
  splitType: TripSplitType;
  customSplit?: Record<string, number>;
  excludedUserIds?: string[];
  paidOnBehalfOf?: string;
  borrowedFrom?: string;
  borrowedAmount?: number;
  date: string;
  createdAt: string;
}

export interface TripPlace {
  id: string;
  tripId: string;
  day: number;
  name: string;
  lat?: number;
  lng?: number;
  openTime?: string;
  closeTime?: string;
  category?: string;
}

export interface TripSettlement {
  from: string;
  to: string;
  amount: number;
}

export interface TripDocument {
  id: string;
  tripId: string;
  name: string;
  type: 'pdf' | 'image' | 'other';
  tag?: 'Travel' | 'ID' | 'Hotel' | 'Other';
  filePath: string;
  mimeType?: string;
  dataUrl?: string;
  reusable?: boolean;
  createdAt: string;
}

export interface TripHistoryItem {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: string[];
  expenses: TripExpense[];
  places: TripPlace[];
  settlements: TripSettlement[];
  totalSpent: number;
  perPerson: number;
  createdAt: string;
}

export interface PersonBalance {
  name: string;
  totalGiven: number; // Amount they gave me
  totalOwed: number;  // Amount I gave them
  netBalance: number; // Positive = they owe me, Negative = I owe them
  transactions: SharedExpense[];
}

export interface LinkItem {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  title?: string;
  previewImage?: string;
  createdAt: string;
  groupId?: string;
  pinned?: boolean;
  locked?: boolean;
  pin?: string;
}

export interface LinkGroup {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  pinned?: boolean;
}

export const STORAGE_KEYS = {
  PERSONAL_EXPENSES: 'splitmate_personal_expenses',
  PERSONAL_MONTHLY_BUDGET: 'splitmate_personal_monthly_budget',
  SHARED_EXPENSES: 'splitmate_shared_expenses',
  SETTINGS: 'splitmate_settings',
  ONBOARDING_DONE: 'splitmate_onboarding_done',
  CURRENCY: 'splitmate_currency',
  ACCOUNT_PROFILE: 'splitmate_account_profile',
  QUICK_NOTES: 'splitmate_quick_notes',
  TRIP_PLANS: 'splitmate_trip_plans',
  TRIP_HISTORY: 'splitmate_trip_history',
  TRIP_DOCUMENTS: 'splitmate_trip_documents',
  IMPORTANT_DATES: 'splitmate_important_dates',
  SHOPPING_ITEMS: 'splitmate_shopping_items',
  LOANS: 'splitmate_loans',
  GOALS: 'splitmate_goals',
  SUBSCRIPTIONS: 'splitmate_subscriptions',
  BUDGET_PLANNER: 'splitmate_budget_planner',
  HOME_SETTINGS: 'splitmate_home_settings',
  PERSON_PROFILES: 'splitmate_person_profiles',
  PENDING_SYNC_UPDATES: 'splitmate_pending_sync_updates',
  REJECTION_NOTIFICATIONS: 'splitmate_rejection_notifications',
  LAST_ACTIVE_TAB: 'splitmate_last_active_tab',
  FRIEND_GROUPS: 'splitmate_friend_groups',
  ACCOUNTS: 'splitmate_accounts',
  SMS_TRANSACTIONS: 'splitmate_sms_transactions',
  ADS_ENABLED: 'splitmate_ads_enabled',
};

export const FREE_LIMITS = {
  MAX_PERSONS: 3,
  MAX_SHARED_GROUPS: 1,
  MAX_TRANSACTIONS: 8,
  MAX_ACCOUNTS: 3,
  MAX_LINKS: 4,
  MAX_LINK_GROUPS: 1,
  MAX_GOALS: 1,
  MAX_LOANS: 1,
  MAX_SUBSCRIPTIONS: 2,
  MAX_COLLAB_EMAILS: 1,
} as const;

function toLocalDayKey(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getUniqueCollaboratorEmails(): string[] {
  const ownEmail = getAccountProfile().email?.toLowerCase().trim();
  const emails = new Set<string>();

  const profiles = getPersonProfiles();
  Object.values(profiles).forEach((profile) => {
    const email = profile.email?.toLowerCase().trim();
    if (email && email !== ownEmail) emails.add(email);
  });

  getFriendGroups().forEach((group) => {
    (group.syncEmails || []).forEach((email) => {
      const normalized = email.toLowerCase().trim();
      if (normalized && normalized !== ownEmail) emails.add(normalized);
    });

    Object.values(group.memberEmails || {}).forEach((email) => {
      const normalized = email.toLowerCase().trim();
      if (normalized && normalized !== ownEmail) emails.add(normalized);
    });
  });

  return Array.from(emails);
}

function canAddTransaction(isMirror = false): boolean {
  if (isProUserCached()) return true;
  if (isMirror) return true;

  const todayKey = toLocalDayKey(new Date().toISOString());
  const personalCountToday = getPersonalExpenses().filter((item) => {
    if (item.isMirror) return false;
    return toLocalDayKey(item.createdAt || item.date) === todayKey;
  }).length;
  const sharedCountToday = getSharedExpenses().filter((item) => {
    return toLocalDayKey(item.createdAt || item.date) === todayKey;
  }).length;
  const totalToday = personalCountToday + sharedCountToday;

  if (totalToday >= FREE_LIMITS.MAX_TRANSACTIONS) {
    requestProUpgrade(
      'transactions',
      'Free users can add up to 8 transactions per day. Upgrade to Pro for unlimited history.',
    );
    return false;
  }

  return true;
}

function canAddCollaboratorEmail(email: string): boolean {
  if (isProUserCached()) return true;

  const normalized = email.toLowerCase().trim();
  const ownEmail = getAccountProfile().email?.toLowerCase().trim();
  if (!normalized || normalized === ownEmail) return true;

  const uniqueEmails = getUniqueCollaboratorEmails();
  if (uniqueEmails.includes(normalized)) return true;

  if (uniqueEmails.length >= FREE_LIMITS.MAX_COLLAB_EMAILS) {
    requestProUpgrade(
      'collaboration',
      'Free users can sync with only 1 collaborator. Upgrade to Pro for full collaboration sync.',
    );
    return false;
  }

  return true;
}

export const getAdsEnabled = (): boolean => {
  const value = localStorage.getItem(STORAGE_KEYS.ADS_ENABLED);
  return value === null ? true : value === 'true';
};

export const setAdsEnabled = (enabled: boolean) => {
  localStorage.setItem(STORAGE_KEYS.ADS_ENABLED, String(enabled));
  
  // If user manually turns ads back ON, we reset any existing rewarded ad-free status
  if (enabled) {
    localStorage.removeItem('ad_free_until');
  }
  
  window.dispatchEvent(new Event('splitmate_ads_changed'));
};

/**
 * showRewardAd
 * Triggers a rewarded video ad. If completed, disables ads for 24 hours.
 */
export const showRewardAd = async (grantAdFree: boolean = true) => {
  const { AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob');
  const { Capacitor } = await import('@capacitor/core');
  
  if (!Capacitor.isNativePlatform()) {
    if (grantAdFree) {
      const until = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('ad_free_until', String(until));
      window.dispatchEvent(new Event('splitmate_ads_changed'));
    }
    return true;
  }

  try {
    // 1. Verify Internet Status first to prevent "offline" skip bypasses
    if (!navigator.onLine) {
      toast.error("Internet Required", { description: "Please connect to the internet to watch the ad and go ad-free." });
      return false;
    }

    // 2. Prepare but check for errors
    await AdMob.prepareRewardVideoAd({
      adId: 'ca-app-pub-2635018944245510/8671306515',
      isTesting: false,
    });
    
    // 3. Track reward status strictly
    let isRewarded = false;
    const l1 = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      isRewarded = true;
    });

    await AdMob.showRewardVideoAd();
    
    // Wait for ad completion/dismissal
    await new Promise(resolve => setTimeout(resolve, 800));
    l1.remove();

    if (isRewarded) {
      if (grantAdFree) {
        const until = Date.now() + 24 * 60 * 60 * 1000;
        localStorage.setItem('ad_free_until', String(until));
        window.dispatchEvent(new Event('splitmate_ads_changed'));
        toast.success("Premium Active!", { description: "You are now ad-free for the next 24 hours." });
      }
      return true;
    } else {
      toast.error("Ad Skipped", { description: "You must watch the full ad to go ad-free." });
      return false;
    }
  } catch (err) {
    console.warn('[AdMob] Reward ad failed:', err);
    toast.error("Oops!", { description: "Could not load ad. Please try again later." });
    return false;
  }
};

const LINKS_STORAGE_KEYS = {
  LINKS: 'splitmate_links',
  GROUPS: 'splitmate_link_groups'
};

// Currency
export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export interface AccountProfile {
  name: string;
  email: string;
  bio: string;
  avatar?: string;
  nightlyBackupEnabled?: boolean;
}

export interface QuickNote {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'checklist';
  checklistItems: QuickChecklistItem[];
  tags: string[];
  color: QuickNoteColor;
  archived: boolean;
  trashedAt?: string;
  locked?: boolean;
  pin?: string;
  attachments: QuickNoteAttachment[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuickChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface QuickNoteAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export type QuickNoteColor =
  | 'default'
  | 'sun'
  | 'mint'
  | 'sky'
  | 'peach'
  | 'rose'
  | 'slate';

export interface TripPlan {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget?: number;
  members?: string[];
  budgetManager?: string;
  notes?: string;
  checklist: string[];
  expenses?: TripExpense[];
  places?: TripPlace[];
  settlements?: TripSettlement[];
  endTripLockedAt?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportantDateItem {
  id: string;
  title: string;
  date: string;
  category: 'birthday' | 'anniversary' | 'personal' | 'custom' | 'event' | 'deadline' | 'other';
  personName?: string;
  customCategoryLabel?: string;
  emoji?: string;
  details?: string;
  repeatType?: 'none' | 'yearly' | 'monthly' | 'custom';
  repeatIntervalDays?: number;
  repeatYearly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  listId?: string;
  name: string;
  quantity: number;
  estimatedPrice?: number;
  category?: ShoppingCategory;
  favorite?: boolean;
  productLink?: string;
  linkTitle?: string;
  linkFavicon?: string;
  done: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ShoppingCategory =
  | 'groceries'
  | 'produce'
  | 'dairy'
  | 'bakery'
  | 'meat'
  | 'household'
  | 'personal-care'
  | 'electronics'
  | 'fashion'
  | 'other';

export interface ShoppingList {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  items: ShoppingItem[];
}

export interface LoanItem {
  id: string;
  loanName: string;
  counterpartyName?: string;
  direction: 'you-gave' | 'you-borrowed';
  principal: number;
  outstandingPrincipal: number;
  interestRate: number;
  interestStartsOn: string;
  dueDate: string;
  durationType: 'month' | 'year';
  transactions: LoanTransaction[];
  notes?: string;
  closedAt?: string;
  // Legacy field retained for compatibility with old stored data.
  personName?: string;
  createdAt: string;
}

export interface LoanTransaction {
  id: string;
  type: 'add-principal' | 'payment';
  amount: number;
  createdAt: string;
  note?: string;
}

export interface GoalTransaction {
  id: string;
  amount: number;
  createdAt: string;
}

export interface GoalItem {
  id: string;
  name: string;
  targetAmount: number;
  expectedDate: string;
  locked: boolean;
  pin?: string;
  transactions: GoalTransaction[];
  createdAt: string;
}

export type SubscriptionCycle = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'lifetime';

export interface PersonProfile {
  name: string;
  email?: string;
  avatar?: string;
  color?: string;
  linkedSince?: string;
}

export interface PendingSyncUpdate {
  id: string;
  fromName: string;
  fromEmail?: string;
  groupName?: string; // 🔥 Added for auto-creating groups
  groupMembers?: string[];
  memberEmails?: Record<string, string>;
  syncEmails?: string[]; // Complete sync list for broadcasting
  expense: SharedExpense;
  type: 'added' | 'deleted' | 'settled' | 'updated';
  reason?: string;
  timestamp: string;
}

export interface RejectionUpdate {
  id: string;
  recipientName: string; // The name I have for them
  senderEmail: string; // My email (sending rejection back)
  reason: string;
  originalExpense: SharedExpense;
  timestamp: string;
}

export interface SubscriptionItem {
  id: string;
  appName: string;
  amount: number;
  cycle: SubscriptionCycle;
  logoUrl?: string;
  startDate?: string;
  paused?: boolean;
  createdAt: string;
}

export interface BudgetPlannerConfig {
  monthlyIncome: number;
  fixedExpenses: number;
  savingsGoal: number;
  targetDailyAllowance: number;
  categoryBudgets: Record<string, number>;
}

export interface HomeTabSettings {
  showStats: boolean;
  showSpendingBreakdown: boolean;
  showTopBalances: boolean;
  showGoals: boolean;
  showLoans: boolean;
  showSubscriptions: boolean;
  showPinnedLinks: boolean;
  showCurrencyRates: boolean;
  showCategories: boolean;
  showBudgets: boolean;
  showConverter: boolean;
  showRecentPersonal: boolean;
  showRecentShared: boolean;
  currencyRateCodes: string[];
  sectionOrder: string[];
  selectedLinkIds: string[];
  selectedSubscriptionIds: string[];
  selectedGoalIds: string[];
  selectedPersonNames: string[];
  selectedCategoryNames: string[];
}

const DEFAULT_HOME_SETTINGS: HomeTabSettings = {
  showStats: true,
  showSpendingBreakdown: true,
  showTopBalances: true,
  showGoals: false,
  showLoans: false,
  showSubscriptions: false,
  showPinnedLinks: false,
  showCurrencyRates: false,
  showCategories: false,
  showBudgets: false,
  showConverter: false,
  showRecentPersonal: false,
  showRecentShared: false,
  currencyRateCodes: ['USD', 'EUR', 'GBP'],
  sectionOrder: ['stats', 'spending', 'balances', 'goals', 'loans', 'subs', 'links', 'rates', 'categories', 'budgets', 'converter', 'personal', 'shared'],
  selectedLinkIds: [],
  selectedSubscriptionIds: [],
  selectedGoalIds: [],
  selectedPersonNames: [],
  selectedCategoryNames: [],
};

const DEFAULT_ACCOUNT_PROFILE: AccountProfile = {
  name: 'Guest',
  email: '',
  bio: '',
  nightlyBackupEnabled: false,
};

export function getAccountProfile(): AccountProfile {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNT_PROFILE);
    if (!stored) return { ...DEFAULT_ACCOUNT_PROFILE };
    const parsed = JSON.parse(stored) as Partial<AccountProfile>;
    return {
      name: parsed.name?.trim() || DEFAULT_ACCOUNT_PROFILE.name,
      email: parsed.email?.trim() || '',
      bio: parsed.bio?.trim() || '',
      avatar: typeof parsed.avatar === 'string' ? parsed.avatar : undefined,
      nightlyBackupEnabled: parsed.nightlyBackupEnabled ?? DEFAULT_ACCOUNT_PROFILE.nightlyBackupEnabled,
    };
  } catch {
    return { ...DEFAULT_ACCOUNT_PROFILE };
  }
}

export function saveAccountProfile(profile: AccountProfile): boolean {
  if (!isProUserCached() && profile.nightlyBackupEnabled) {
    requestProUpgrade(
      'auto-backup',
      'Auto cloud backup is a Pro feature. Upgrade to Pro to enable it.',
    );
    return false;
  }

  const normalizedProfile: AccountProfile = {
    name: profile.name?.trim() || DEFAULT_ACCOUNT_PROFILE.name,
    email: profile.email?.trim() || '',
    bio: profile.bio?.trim() || '',
    avatar: typeof profile.avatar === 'string' ? profile.avatar : undefined,
    nightlyBackupEnabled: profile.nightlyBackupEnabled ?? DEFAULT_ACCOUNT_PROFILE.nightlyBackupEnabled,
  };

  localStorage.setItem(STORAGE_KEYS.ACCOUNT_PROFILE, JSON.stringify(normalizedProfile));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('splitmate_account_changed'));
  }

  return true;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },

  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', locale: 'zh-HK' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },

  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan', locale: 'zh-CN' },

  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', locale: 'es-MX' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso', locale: 'es-AR' },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', locale: 'es-CL' },

  { code: 'COP', symbol: 'COP', name: 'Colombian Peso', locale: 'es-CO' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', locale: 'es-PE' },

  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', locale: 'en-PH' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', locale: 'ko-KR' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', locale: 'th-TH-u-nu-latn' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', locale: 'zh-TW' },

  { code: 'PKR', symbol: 'PKR', name: 'Pakistani Rupee', locale: 'en-PK' },
  { code: 'LKR', symbol: 'LKR', name: 'Sri Lankan Rupee', locale: 'en-LK' },
  { code: 'NPR', symbol: 'NPR', name: 'Nepalese Rupee', locale: 'ne-NP-u-nu-latn' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', locale: 'bn-BD-u-nu-latn' },

  { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', locale: 'en-GH' },

  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', locale: 'ar-AE-u-nu-latn' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', locale: 'ar-SA-u-nu-latn' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal', locale: 'ar-QA-u-nu-latn' },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar', locale: 'ar-KW-u-nu-latn' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', locale: 'ar-OM-u-nu-latn' },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar', locale: 'ar-BH-u-nu-latn' },

  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', locale: 'ru-RU' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', locale: 'uk-UA' },

  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', locale: 'cs-CZ' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', locale: 'hu-HU' },
  { code: 'RON', symbol: 'RON', name: 'Romanian Leu', locale: 'ro-RO' },

  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', locale: 'da-DK' },

  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },

  { code: 'UGX', symbol: 'UGX', name: 'Uganda Shilling', locale: 'en-UG' },
  { code: 'EGP', symbol: 'EGP', name: 'Egyptian Pound', locale: 'ar-EG-u-nu-latn' },
  { code: 'IQD', symbol: 'IQD', name: 'Iraqi Dinar', locale: 'ar-IQ-u-nu-latn' },

  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani', locale: 'fa-AF-u-nu-latn' },
  { code: 'ALL', symbol: 'ALL', name: 'Albanian Lek', locale: 'sq-AL' },
  { code: 'DZD', symbol: 'DZD', name: 'Algerian Dinar', locale: 'ar-DZ-u-nu-latn' },
  { code: 'AOA', symbol: 'AOA', name: 'Angolan Kwanza', locale: 'pt-AO' },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram', locale: 'hy-AM' },

  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat', locale: 'az-AZ' },
  { code: 'BAM', symbol: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', locale: 'bs-BA' },
  { code: 'BWP', symbol: 'P', name: 'Botswanan Pula', locale: 'en-BW' },
  { code: 'BND', symbol: 'B$', name: 'Brunei Dollar', locale: 'ms-BN' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev', locale: 'bg-BG' },

  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel', locale: 'km-KH-u-nu-latn' },
  { code: 'XAF', symbol: 'XAF', name: 'Central African CFA Franc', locale: 'fr-CM' },
  { code: 'XOF', symbol: 'XOF', name: 'West African CFA Franc', locale: 'fr-SN' },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón', locale: 'es-CR' },

  { code: 'CUP', symbol: 'CUP', name: 'Cuban Peso', locale: 'es-CU' },
  { code: 'DOP', symbol: 'RD$', name: 'Dominican Peso', locale: 'es-DO' },
  { code: 'ETB', symbol: 'ETB', name: 'Ethiopian Birr', locale: 'am-ET' },
  { code: 'FJD', symbol: 'FJ$', name: 'Fijian Dollar', locale: 'en-FJ' },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari', locale: 'ka-GE' },

  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal', locale: 'es-GT' },
  { code: 'HNL', symbol: 'L', name: 'Honduran Lempira', locale: 'es-HN' },
  { code: 'ISK', symbol: 'ISK', name: 'Icelandic Króna', locale: 'is-IS' },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar', locale: 'en-JM' },
  { code: 'JOD', symbol: 'JOD', name: 'Jordanian Dinar', locale: 'ar-JO-u-nu-latn' },

  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge', locale: 'kk-KZ' },
  { code: 'LAK', symbol: '₭', name: 'Laotian Kip', locale: 'lo-LA-u-nu-latn' },
  { code: 'MKD', symbol: 'MKD', name: 'Macedonian Denar', locale: 'mk-MK' },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary', locale: 'mg-MG' },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tögrög', locale: 'mn-MN' },
];

export function getCurrency(): CurrencyInfo {
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENCY);
  if (stored) {
    const found = CURRENCIES.find(c => c.code === stored);
    if (found) return found;
  }
  return CURRENCIES.find(c => c.code === 'USD') || CURRENCIES[0];
}

export function setCurrency(code: string): void {
  localStorage.setItem(STORAGE_KEYS.CURRENCY, code);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('splitmate_currency_changed'));
  }
}

export function isOnboardingDone(): boolean {
  return localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE) === 'true';
}

export function setOnboardingDone(): void {
  localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
}

// Personal Expenses
export function savePersonalExpense(expense: PersonalExpense): boolean {
  const defaultAccountId = getDefaultAccountId();
  const normalizedExpense: PersonalExpense = {
    ...expense,
    accountId: expense.accountId || defaultAccountId,
  };

  const expenses = getPersonalExpenses();
  const index = expenses.findIndex(e => e.id === normalizedExpense.id);
  
  if (index !== -1) {
    expenses[index] = normalizedExpense;
  } else {
    if (!canAddTransaction(normalizedExpense.isMirror)) return false;
    expenses.push(normalizedExpense);
  }
  
  localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(expenses));
  window.dispatchEvent(new Event('splitmate_data_changed'));
  return true;
}

export function getPersonalMonthlyBudget(): number {
  const stored = localStorage.getItem(STORAGE_KEYS.PERSONAL_MONTHLY_BUDGET);
  if (!stored) return 0;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function setPersonalMonthlyBudget(amount: number): void {
  const normalized = Number(amount);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    localStorage.removeItem(STORAGE_KEYS.PERSONAL_MONTHLY_BUDGET);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.PERSONAL_MONTHLY_BUDGET, String(Math.round(normalized * 100) / 100));
}

export function getPersonalExpenses(): PersonalExpense[] {
  const stored = localStorage.getItem(STORAGE_KEYS.PERSONAL_EXPENSES);
  return stored ? JSON.parse(stored) : [];
}

export function deletePersonalExpense(id: string): void {
  const pExpenses = getPersonalExpenses();
  const expenseToDelete = pExpenses.find(e => e.id === id);

  const updatedPExpenses = pExpenses.filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(updatedPExpenses));

  // SYNC Shared Expense if it's a mirror
  if (expenseToDelete?.isMirror && expenseToDelete.mirrorFromId) {
    const sExpenses = getSharedExpenses().filter(e => e.id !== expenseToDelete.mirrorFromId);
    localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(sExpenses));
  }

  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function updatePersonalExpense(id: string, updates: Partial<PersonalExpense>): void {
  const pExpenses = getPersonalExpenses();
  const index = pExpenses.findIndex(e => e.id === id);
  if (index !== -1) {
    pExpenses[index] = { ...pExpenses[index], ...updates };
    localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(pExpenses));

    // SYNC Shared if it's a mirror
    if (pExpenses[index].isMirror && pExpenses[index].mirrorFromId) {
      const sExpenses = getSharedExpenses();
      const sExpense = sExpenses.find(se => se.id === pExpenses[index].mirrorFromId);
      if (sExpense) {
        if (updates.reason !== undefined) sExpense.reason = updates.reason;
        if (updates.amount !== undefined) sExpense.amount = updates.amount;
        if (updates.date !== undefined) sExpense.date = updates.date;
        localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(sExpenses));
      }
    }

    window.dispatchEvent(new Event('splitmate_data_changed'));
  }
}

export function updatePersonalExpenseReason(id: string, reason: string): void {
  updatePersonalExpense(id, { reason });
}

export function getFriendGroups(): FriendGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FRIEND_GROUPS);
    const groups = stored ? JSON.parse(stored) : [];

    const myProfile = getAccountProfile();
    const myProfileName = myProfile.name?.toLowerCase() || '';
    const myEmail = myProfile.email?.toLowerCase() || '';
    if (!myProfileName && !myEmail) return groups;

    // Load local person profiles for peer name resolution
    const localProfiles: Record<string, any> = JSON.parse(localStorage.getItem('splitmate_person_profiles') || '{}');

    return groups.map((g: FriendGroup) => {
      const memberEmailsMap: Record<string, string> = g.memberEmails || {};

      // Build a canonical name resolver for each raw member name
      const resolveOneMember = (rawName: string): string => {
        if (!rawName) return rawName;
        // 1. Name-match my own profile name
        if (rawName.toLowerCase() === myProfileName) return 'me';
        // 2. Email-match: if this member's mapped email is MY email, they are 'me'
        const memberEmail = (memberEmailsMap[rawName] || '').toLowerCase();
        if (myEmail && memberEmail === myEmail) return 'me';
        // 3. Check if we have a local profile with that email → use local name
        if (memberEmail) {
          const localMatch = Object.values(localProfiles).find(
            (p: any) => p.email?.toLowerCase() === memberEmail
          );
          if (localMatch) return (localMatch as any).name;
        }
        return rawName;
      };

      // Resolve all members and deduplicate (two names might resolve to 'me')
      const resolvedMembers = [...new Set(g.members.map(resolveOneMember))] as string[];

      // Resolve managerName using managerEmail as the stable truth.
      // IMPORTANT: never infer manager from name-matching alone; two devices can share names.
      let resolvedManagerName = g.managerName; // default: keep raw stored name
      if (g.managerEmail && myEmail) {
        if (g.managerEmail.toLowerCase() === myEmail) {
          resolvedManagerName = 'me';
        } else {
          const entry = Object.entries(memberEmailsMap).find(
            ([, email]) => (email as string).toLowerCase() === g.managerEmail!.toLowerCase()
          );
          if (entry) resolvedManagerName = entry[0];
        }
      }

      return {
        ...g,
        members: resolvedMembers,
        managerName: resolvedManagerName
      };
    });
  } catch {
    return [];
  }
}

export function getFriendGroup(id: string): FriendGroup | null {
  return getFriendGroups().find(g => g.id === id) || null;
}

export function addFriendGroupSyncEmail(groupId: string, email: string): void {
  const accountEmail = getAccountProfile().email?.toLowerCase().trim();
  const normalizedEmail = email.toLowerCase().trim();
  if (normalizedEmail === accountEmail) return;
  if (!canAddCollaboratorEmail(normalizedEmail)) return;

  const groups = getFriendGroups();
  const group = groups.find(g => g.id === groupId);
  if (group) {
    if (!group.syncEmails) group.syncEmails = [];
    if (!group.syncEmails.includes(normalizedEmail)) {
      group.syncEmails.push(normalizedEmail);
      localStorage.setItem(STORAGE_KEYS.FRIEND_GROUPS, JSON.stringify(groups));
      window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
    }
  }
}

export function removeFriendGroupSyncEmail(groupId: string, email: string): void {
  const groups = getFriendGroups();
  const group = groups.find(g => g.id === groupId);
  if (group && group.syncEmails) {
    group.syncEmails = group.syncEmails.filter(e => e !== email.toLowerCase().trim());
    localStorage.setItem(STORAGE_KEYS.FRIEND_GROUPS, JSON.stringify(groups));
    window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
  }
}

export function saveFriendGroups(groups: FriendGroup[]): void {
  localStorage.setItem(STORAGE_KEYS.FRIEND_GROUPS, JSON.stringify(groups));
  window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
}

export function saveFriendGroup(group: FriendGroup): boolean {
  const groups = getFriendGroups();
  const index = groups.findIndex(g => g.id === group.id);
  const nonMeMembers = Array.from(new Set(group.members.filter((member) => member !== 'me')));

  if (!isProUserCached() && nonMeMembers.length > FREE_LIMITS.MAX_PERSONS) {
    requestProUpgrade(
      'persons',
      'Free users can add only 3 people. Upgrade to Pro for unlimited shared members.',
    );
    return false;
  }

  if (index < 0 && !isProUserCached() && groups.length >= FREE_LIMITS.MAX_SHARED_GROUPS) {
    requestProUpgrade(
      'groups',
      'Free users can create only 1 shared group. Upgrade to Pro for multiple groups.',
    );
    return false;
  }
  
  if (!group.managerName) {
    group.managerName = 'me';
    group.managerEmail = getAccountProfile().email || undefined;
  }

  if (index >= 0) {
    groups[index] = group;
  } else {
    groups.push(group);
  }
  saveFriendGroups(groups);
  return true;
}

export function deleteFriendGroup(id: string): void {
  const groups = getFriendGroups().filter(g => g.id !== id);
  localStorage.setItem(STORAGE_KEYS.FRIEND_GROUPS, JSON.stringify(groups));

  // Also delete all expenses in this group
  const expenses = getSharedExpenses().filter(e => e.groupId !== id);
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

  window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

// Shared Expenses
export function saveSharedExpense(expense: SharedExpense, skipSync = false): boolean {
  const defaultAccountId = getDefaultAccountId();
  const normalizedExpense: SharedExpense = {
    ...expense,
    accountId: expense.paidBy === 'me' ? (expense.accountId || defaultAccountId) : undefined,
  };

  const expenses = getSharedExpenses();
  const index = expenses.findIndex(e => e.id === normalizedExpense.id);
  
  if (index !== -1) {
    // Keep existing flags
    if (normalizedExpense.createdByMe === undefined) normalizedExpense.createdByMe = expenses[index].createdByMe;
    if (normalizedExpense.isIncoming === undefined) normalizedExpense.isIncoming = expenses[index].isIncoming;
    expenses[index] = normalizedExpense;
  } else {
    const uniquePeople = new Set(expenses.map((entry) => entry.personName).filter(Boolean));
    if (!isProUserCached() && !uniquePeople.has(normalizedExpense.personName) && uniquePeople.size >= FREE_LIMITS.MAX_PERSONS) {
      requestProUpgrade(
        'persons',
        'Free users can add only 3 people. Upgrade to Pro for unlimited shared members.',
      );
      return false;
    }

    if (!canAddTransaction(false)) return false;
    // Set for new
    if (normalizedExpense.createdByMe === undefined) normalizedExpense.createdByMe = !skipSync;
    if (normalizedExpense.isIncoming === undefined) normalizedExpense.isIncoming = skipSync;
    expenses.push(normalizedExpense);
  }
  
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

  // Auto-create/Update person profile and normalize name based on email
  if (normalizedExpense.personName) {
    const profiles = getPersonProfiles();
    const incomingSenderEmail = skipSync ? (normalizedExpense as any).fromEmail : undefined;

    // First, check if we have a profile with this exact email
    const profileWithEmail = incomingSenderEmail 
      ? Object.values(profiles).find((p: any) => p.email?.toLowerCase() === incomingSenderEmail.toLowerCase())
      : null;

    if (profileWithEmail) {
      // 🚀 CRITICAL: If a profile with this email exists, we MUST use the local name 
      // instead of whatever name was sent in the sync update. 
      // This prevents "Sandu" and "SK" from being two different cards for one person.
      normalizedExpense.personName = profileWithEmail.name;
    } else {
      // If no profile with email, check by name
      const profileWithName = profiles[normalizedExpense.personName];
      
      if (!profileWithName) {
        // Create new profile if neither name nor email matched
        savePersonProfile({
          name: normalizedExpense.personName,
          email: incomingSenderEmail || undefined
        });
      } else if (incomingSenderEmail && !profileWithName.email) {
        // Update existing name-only profile with the newly discovered email
        savePersonProfile({
          ...profileWithName,
          email: incomingSenderEmail
        });
      }
    }
  }

  // 🚀 Group Membership Maintenance
  if (normalizedExpense.groupId) {
    const groups = getFriendGroups();
    const existingGroup = groups.find(g => g.id === normalizedExpense.groupId);
    if (!existingGroup) {
      const gName = (normalizedExpense as any).groupName || "Shared Group";
      saveFriendGroup({
        id: normalizedExpense.groupId,
        name: gName,
        members: ['me', normalizedExpense.personName], // Initial members: target and sender
        color: '#8B5CF6',
        createdAt: new Date().toISOString(),
        syncEmails: skipSync && (normalizedExpense as any).fromEmail ? [(normalizedExpense as any).fromEmail] : [] // Link back for 2-way sync
      });
    } else {
      // Group exists, ensure sender is a member
      if (!existingGroup.members.includes(normalizedExpense.personName)) {
        // Double check: if they have an email, maybe they are already in under a different name?
        const incomingSenderEmail = skipSync ? (normalizedExpense as any).fromEmail : undefined;
        const profiles = getPersonProfiles();
        const emailMatch = incomingSenderEmail ? Object.values(profiles).find((p: any) => p.email?.toLowerCase() === incomingSenderEmail.toLowerCase()) : null;
        
        if (emailMatch && existingGroup.members.includes(emailMatch.name)) {
          // They are already in the group under the profile name, just update the expense name
          normalizedExpense.personName = emailMatch.name;
        } else {
          // Truly a new member
          existingGroup.members.push(normalizedExpense.personName);
          localStorage.setItem(STORAGE_KEYS.FRIEND_GROUPS, JSON.stringify(groups));
          window.dispatchEvent(new Event('splitmate_friend_groups_changed'));
        }
      }
    }
  }

  window.dispatchEvent(new Event('splitmate_data_changed'));

  // If someone paid for me, add it as personal expense too
  if (normalizedExpense.paidBy !== 'me' && normalizedExpense.forPerson === 'me') {
    // Smart category inference if still 'Other'
    let finalCategory = normalizedExpense.category || 'Other';

    if (finalCategory === 'Other') {
      const lowerReason = (normalizedExpense.reason || '').toLowerCase();
      if (lowerReason.includes('food') || lowerReason.includes('din') || lowerReason.includes('lunch') || lowerReason.includes('dinner') || lowerReason.includes('breakfast') || lowerReason.includes('nasta') || lowerReason.includes('drink') || lowerReason.includes('restaurant')) {
        finalCategory = 'Food & Dining';
      } else if (lowerReason.includes('bus') || lowerReason.includes('uber') || lowerReason.includes('taxi') || lowerReason.includes('train') || lowerReason.includes('petrol') || lowerReason.includes('fuel')) {
        finalCategory = 'Transportation';
      } else if (lowerReason.includes('shop') || lowerReason.includes('buying') || lowerReason.includes('amazon') || lowerReason.includes('clothes')) {
        finalCategory = 'Shopping';
      } else if (lowerReason.includes('movie') || lowerReason.includes('game') || lowerReason.includes('show') || lowerReason.includes('netflix')) {
        finalCategory = 'Entertainment';
      } else if (lowerReason.includes('bill') || lowerReason.includes('rent') || lowerReason.includes('electricity') || lowerReason.includes('water')) {
        finalCategory = 'Bills & Utilities';
      } else if (lowerReason.includes('doc') || lowerReason.includes('med') || lowerReason.includes('hosp')) {
        finalCategory = 'Healthcare';
      } else if (lowerReason.includes('travel') || lowerReason.includes('trip') || lowerReason.includes('flight') || lowerReason.includes('hotel')) {
        finalCategory = 'Travel';
      } else if (lowerReason.includes('milk') || lowerReason.includes('grocery') || lowerReason.includes('vege') || lowerReason.includes('fruit')) {
        finalCategory = 'Groceries';
      }
    }

    const personalExpense: PersonalExpense = {
      id: generateId(),
      amount: normalizedExpense.amount,
      reason: normalizedExpense.reason + ` (paid by ${normalizedExpense.personName})`,
      category: finalCategory,
      date: normalizedExpense.date,
      createdAt: normalizedExpense.createdAt,
      isMirror: true,
      mirrorFromId: normalizedExpense.id
    };
    savePersonalExpense(personalExpense);
  }

  // Collaboration Sync Logic
  if (!skipSync) {
    const profile = getPersonProfile(normalizedExpense.personName);
    const myProfile = getAccountProfile();

    if (profile?.email) {
      if (!myProfile.email) {
        console.warn("Sync skipped: You must be signed in with Google to sync expenses.");
        return true;
      }

      const inverseExpense: SharedExpense = {
        ...normalizedExpense,
        id: normalizedExpense.id,
        personName: myProfile.name,
        paidBy: normalizedExpense.paidBy === 'me' ? myProfile.name : 'me',
        forPerson: normalizedExpense.forPerson === 'me' ? myProfile.name : 'me',
      };

      addPeerUpdate({
        id: generateId(),
        fromName: myProfile.name,
        fromEmail: myProfile.email,
        expense: inverseExpense,
        type: 'added',
        // Pass sender email so receiver can auto-link the profile
        senderEmail: myProfile.email,
        timestamp: new Date().toISOString()
      } as any, profile.email);
    }
  }

  return true;
}

export function getSharedExpenses(): SharedExpense[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SHARED_EXPENSES);
    const expenses = stored ? JSON.parse(stored) : [];

    const myProfile = getAccountProfile();
    const myProfileName = myProfile.name?.toLowerCase() || '';
    const myEmail = myProfile.email?.toLowerCase() || '';
    if (!myProfileName && !myEmail) return expenses;

    // Load raw groups so we can build per-group alias maps
    const rawGroups: FriendGroup[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.FRIEND_GROUPS) || '[]');
    const localProfiles: Record<string, any> = JSON.parse(localStorage.getItem('splitmate_person_profiles') || '{}');

    // Build a group-id → resolver map
    const groupResolvers: Record<string, (name: string) => string> = {};
    rawGroups.forEach((g: FriendGroup) => {
      const memberEmailsMap: Record<string, string> = g.memberEmails || {};
      groupResolvers[g.id] = (rawName: string): string => {
        if (!rawName || rawName === 'all') return rawName;
        if (rawName.toLowerCase() === myProfileName) return 'me';
        const memberEmail = (memberEmailsMap[rawName] || '').toLowerCase();
        if (myEmail && memberEmail === myEmail) return 'me';
        if (memberEmail) {
          const localMatch = Object.values(localProfiles).find(
            (p: any) => p.email?.toLowerCase() === memberEmail
          );
          if (localMatch) return (localMatch as any).name;
        }
        return rawName;
      };
    });

    // Fallback resolver (name-match only) for non-group expenses
    const fallbackMap = (name: string) => {
      if (!name) return name;
      if (name.toLowerCase() === myProfileName) return 'me';
      return name;
    };

    return expenses.map((e: SharedExpense) => {
      if (e.groupId) {
        const resolve = groupResolvers[e.groupId] || fallbackMap;
        return {
          ...e,
          paidBy: resolve(e.paidBy),
          forPerson: e.forPerson === 'all' ? 'all' : resolve(e.forPerson),
          splitParticipants: e.splitParticipants?.map(resolve)
        };
      }
      return e;
    });
  } catch {
    return [];
  }
}


/**
 * Returns a list of suggested reasons based on frequency and recency.
 */
export function getSuggestedReasons(type: 'personal' | 'shared', isIncomeFilter?: boolean): string[] {
  try {
    let expenses: (PersonalExpense | SharedExpense)[] = type === 'personal' ? getPersonalExpenses() : getSharedExpenses();
    
    if (type === 'personal' && typeof isIncomeFilter === 'boolean') {
      expenses = (expenses as PersonalExpense[]).filter(e => !!e.isIncome === isIncomeFilter);
    }

    if (!expenses || expenses.length === 0) return [];

    const stats: Record<string, { count: number; lastUsed: number }> = {};
    
    expenses.forEach(e => {
      const reason = e.reason?.trim();
      if (!reason) return;
      
      // Filter out settlements and mirrored details to keep suggestions clean
      if (reason.toLowerCase().includes('settlement')) return;
      if (reason.toLowerCase().includes('(paid by')) return;
      
      if (!stats[reason]) {
        stats[reason] = { count: 0, lastUsed: 0 };
      }
      stats[reason].count += 1;
      const time = new Date(e.createdAt || e.date).getTime();
      if (time > stats[reason].lastUsed) {
        stats[reason].lastUsed = time;
      }
    });

    const reasons = Object.keys(stats);
    if (reasons.length === 0) return [];

    // Sort by frequency
    const byFrequency = [...reasons].sort((a, b) => stats[b].count - stats[a].count);
    const top1 = byFrequency[0];
    const top2 = byFrequency.length > 1 ? byFrequency[1] : null;

    // Pick a 3rd one based on recency that isn't already the top 2
    const byRecency = [...reasons].sort((a, b) => stats[b].lastUsed - stats[a].lastUsed);
    const topRecent = byRecency.find(r => r !== top1 && r !== top2) || null;

    const result = [top1];
    if (top2) result.push(top2);
    if (topRecent) result.push(topRecent);

    return result.slice(0, 3);
  } catch (e) {
    console.error("Error getting suggested reasons:", e);
    return [];
  }
}

/**
 * Returns a list of suggested person names based on transaction frequency and recency.
 */
export function getSuggestedPersons(): string[] {
  try {
    const expenses = getSharedExpenses();
    if (!expenses || expenses.length === 0) return [];

    const stats: Record<string, { count: number; lastUsed: number }> = {};
    
    expenses.forEach(e => {
      const name = e.personName?.trim();
      if (!name) return;
      
      if (!stats[name]) {
        stats[name] = { count: 0, lastUsed: 0 };
      }
      stats[name].count += 1;
      const time = new Date(e.createdAt || e.date).getTime();
      if (time > stats[name].lastUsed) {
        stats[name].lastUsed = time;
      }
    });

    const names = Object.keys(stats);
    if (names.length === 0) return [];

    // Top 2 by frequency
    const byFrequency = [...names].sort((a, b) => stats[b].count - stats[a].count);
    const top1 = byFrequency[0];
    const top2 = byFrequency.length > 1 ? byFrequency[1] : null;

    // Pick a 3rd one based on recency that isn't already the top 2
    const byRecency = [...names].sort((a, b) => stats[b].lastUsed - stats[a].lastUsed);
    const topRecent = byRecency.find(r => r !== top1 && r !== top2) || null;

    const result = [top1];
    if (top2) result.push(top2);
    if (topRecent) result.push(topRecent);

    return result.slice(0, 3);
  } catch (e) {
    console.error("Error getting suggested persons:", e);
    return [];
  }
}

export function deleteSharedExpense(id: string): void {
  const expenses = getSharedExpenses();
  const expense = expenses.find(e => e.id === id);
  const myProfile = getAccountProfile();
  if (expense) {
    // 1. Inform Peer - DELETE
    if (expense.groupId) {
      const group = getFriendGroup(expense.groupId);
      if (group?.syncEmails && group.syncEmails.length > 0) {
        group.syncEmails.forEach(email => {
          addPeerUpdate({
            id: generateId(),
            fromName: myProfile?.name || 'Friend',
            fromEmail: myProfile?.email || '',
            expense: expense,
            type: 'deleted',
            timestamp: new Date().toISOString()
          }, email);
        });
      }
    } else {
      const profile = getPersonProfile(expense.personName);
      if (profile?.email) {
        addPeerUpdate({
          id: generateId(),
          fromName: myProfile?.name || 'Friend',
          fromEmail: myProfile?.email || '',
          expense: expense, // Include original for ID reference
          type: 'deleted',
          timestamp: new Date().toISOString()
        }, profile.email);
      }
    }

    const nextExpenses = expenses.filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(nextExpenses));

    // Also clean up any mirrored personal expenses
    const personalExpenses = getPersonalExpenses().filter(pe => pe.mirrorFromId !== id);
    localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(personalExpenses));

    window.dispatchEvent(new Event('splitmate_data_changed'));
  }
}

export function updateSharedExpenseReason(id: string, reason: string): void {
  const expenses = getSharedExpenses();
  const expense = expenses.find(e => e.id === id);
  if (expense) {
    expense.reason = reason;
    localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

    // 1. Inform Peer - UPDATE
    if (expense.groupId) {
      const group = getFriendGroup(expense.groupId);
      if (group?.syncEmails && group.syncEmails.length > 0) {
        group.syncEmails.forEach(email => {
          addPeerUpdate({
            id: generateId(),
            fromName: getAccountProfile().name,
            fromEmail: getAccountProfile().email || '',
            expense: expense,
            type: 'updated',
            reason: reason,
            timestamp: new Date().toISOString()
          }, email);
        });
      }
    } else {
      const profile = getPersonProfile(expense.personName);
      if (profile?.email) {
        addPeerUpdate({
          id: generateId(),
          fromName: getAccountProfile().name,
          fromEmail: getAccountProfile().email || '',
          expense: expense,
          type: 'updated',
          reason: reason,
          timestamp: new Date().toISOString()
        }, profile.email);
      }
    }

    // SYNC Personal Mirror
    const pExpenses = getPersonalExpenses();
    const mirror = pExpenses.find(pe => pe.mirrorFromId === id);
    if (mirror) {
      mirror.reason = reason + ` (paid by ${expense.personName})`;
      localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(pExpenses));
    }

    window.dispatchEvent(new Event('splitmate_data_changed'));
  }
}

export function settleGroup(groupId: string, paymentMode: string = 'CASH', date: string = new Date().toISOString()): void {
  const expenses = getSharedExpenses();
  expenses.forEach(e => {
    if (e.groupId === groupId) e.settled = true;
  });
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function settlePersonInGroup(from: string, to: string, amount: number, groupId: string, paymentMode: string = 'CASH', date: string = new Date().toISOString()): void {
  if (!canAddTransaction(false)) return;

  const expenses = getSharedExpenses();
  const group = getFriendGroup(groupId);
  if (!group) return;

  const record: SharedExpense = {
    id: crypto.randomUUID(),
    personName: from === 'me' ? to : from, // For label
    amount: amount,
    reason: `Group Settlement via ${paymentMode}`,
    date: date,
    paidBy: from,
    forPerson: to,
    settled: false, // Keep it active to offset the debt
    category: 'Settlement',
    groupId: groupId,
    createdAt: new Date().toISOString()
  };
  expenses.push(record);
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

  // 📡 Broadcast settlement to ALL group sync emails
  const myProfile = getAccountProfile();
  if (group.syncEmails && group.syncEmails.length > 0 && myProfile.email) {
    // Correct the perspective for the broadcast based on whether it was sent or received
    // Actually, we'll just broadcast the record as is with from/to correctly mapped
    const settleRecordPeer: SharedExpense = {
      ...record,
      id: crypto.randomUUID(), // Unique doc for each peer
      personName: myProfile.name, // Perspective of peer
      // If 'from' was 'me' on my device, it becomes my name on their device
      paidBy: from === 'me' ? myProfile.name : from,
      forPerson: to === 'me' ? myProfile.name : to,
    };

    group.syncEmails.forEach(email => {
      addPeerUpdate({
        id: generateId(),
        fromName: myProfile.name,
        fromEmail: myProfile.email,
        groupName: group.name,
        syncEmails: Array.from(new Set([myProfile.email, ...group.syncEmails!])),
        expense: settleRecordPeer,
        type: 'added',
        timestamp: new Date().toISOString()
      }, email);
    });
  }

  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function settleExpenseWithPerson(personName: string, paymentMode: string = 'CASH', date: string = new Date().toISOString()): void {
  const expenses = getSharedExpenses();
  const balances = getPersonBalances(true);
  const person = balances.find(p => p.name === personName);

  if (!person) return;
  const netBalance = person.netBalance;

  let hasUnsettled = false;
  expenses.forEach(expense => {
    if (expense.personName === personName && !expense.settled) {
      expense.settled = true;
      hasUnsettled = true;
    }
  });

  if (hasUnsettled && Math.abs(netBalance) > 0) {
    if (!canAddTransaction(false)) return;

    const record: SharedExpense = {
      id: crypto.randomUUID(),
      personName: personName,
      amount: Math.abs(netBalance),
      reason: `Settlement via ${paymentMode}`,
      date: date,
      paidBy: netBalance > 0 ? personName : 'me',
      forPerson: netBalance > 0 ? 'me' : personName,
      settled: true,
      category: 'Settlement',
      createdAt: new Date().toISOString()
    };
    expenses.push(record);

    // Push settlement to cloud
    const profile = getPersonProfile(personName);
    const myProfile = getAccountProfile();
    if (profile && profile.email && myProfile?.email) {
      const inverseRecord: SharedExpense = {
        ...record,
        personName: myProfile.name,
        paidBy: record.paidBy === 'me' ? myProfile.name : 'me',
        forPerson: record.forPerson === 'me' ? myProfile.name : 'me',
      };
      
      const payload = {
        id: crypto.randomUUID(),
        fromName: myProfile.name,
        fromEmail: myProfile.email,
        expense: inverseRecord,
        type: 'added',
        timestamp: new Date().toISOString()
      };
      
      import('@/integrations/firebase/sync').then(({ pushUpdateToCloud }) => {
        pushUpdateToCloud(payload, profile.email!);
      }).catch(console.error);
    }
  }

  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function unsettleExpenseWithPerson(personName: string): void {
  let expenses = getSharedExpenses();
  
  const settlements = expenses.filter(expense => 
    expense.personName === personName && expense.category === 'Settlement'
  );

  expenses = expenses.filter(expense => 
    !(expense.personName === personName && expense.category === 'Settlement')
  );

  expenses.forEach(expense => {
    if (expense.personName === personName && expense.settled) {
      expense.settled = false;
    }
  });

  const profile = getPersonProfile(personName);
  const myProfile = getAccountProfile();
  if (profile && profile.email && myProfile?.email) {
    import('@/integrations/firebase/sync').then(({ pushUpdateToCloud }) => {
      settlements.forEach(settlement => {
        const inverseRecord: SharedExpense = {
          ...settlement,
          personName: myProfile.name,
          paidBy: settlement.paidBy === 'me' ? myProfile.name : 'me',
          forPerson: settlement.forPerson === 'me' ? myProfile.name : 'me',
        };
        const payload = {
          id: crypto.randomUUID(),
          fromName: myProfile.name,
          fromEmail: myProfile.email,
          expense: inverseRecord,
          type: 'deleted',
          timestamp: new Date().toISOString()
        };
        pushUpdateToCloud(payload, profile.email!);
      });
    }).catch(console.error);
  }

  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function toggleSharedExpenseSettlement(id: string): void {
  const expenses = getSharedExpenses();
  const next = expenses.map(expense =>
    expense.id === id ? { ...expense, settled: !expense.settled } : expense
  );
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(next));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function partialSettleSharedExpense(id: string, amountToSettle: number, paymentMode: string = 'CASH', date: string = new Date().toISOString()): void {
  if (amountToSettle > 0 && !canAddTransaction(false)) return;

  const expenses = getSharedExpenses();
  let personName = '';
  let groupId: string | undefined = undefined;

  const next = expenses.map(expense => {
    if (expense.id === id) {
      personName = expense.personName;
      groupId = expense.groupId;
      if (amountToSettle >= expense.amount) {
        return { ...expense, settled: true };
      } else {
        return { ...expense, amount: expense.amount - amountToSettle, settled: false };
      }
    }
    return expense;
  });

  if (amountToSettle > 0) {
    const record: SharedExpense = {
      id: crypto.randomUUID(),
      personName: personName,
      amount: amountToSettle,
      reason: `Settlement via ${paymentMode}`,
      date: date,
      paidBy: personName,
      forPerson: 'me',
      settled: true,
      category: 'Settlement',
      groupId: groupId,
      createdAt: new Date().toISOString()
    };
    next.push(record);
  }

  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(next));

  // 📡 Broadcast settlement ONLY to the specific person's email if mapped
  if (amountToSettle > 0 && groupId) {
    const group = getFriendGroup(groupId);
    const myProfile = getAccountProfile();
    const targetEmail = group?.memberEmails?.[personName];
    if (targetEmail && myProfile.email) {
      const settleRecord: SharedExpense = {
        id: crypto.randomUUID(),
        personName: myProfile.name,
        amount: amountToSettle,
        reason: `Settlement via ${paymentMode}`,
        date: date,
        paidBy: myProfile.name,
        forPerson: 'me',
        settled: true,
        category: 'Settlement',
        groupId: groupId,
        createdAt: new Date().toISOString()
      };
      addPeerUpdate({
        id: generateId(),
        fromName: myProfile.name,
        fromEmail: myProfile.email,
        groupName: group!.name,
        syncEmails: Array.from(new Set([myProfile.email, ...(group!.syncEmails || [])])),
        expense: settleRecord,
        type: 'added',
        timestamp: new Date().toISOString()
      }, targetEmail);
    }
  }

  window.dispatchEvent(new Event('splitmate_data_changed'));
}

// Balance Calculations
export function getPersonBalances(includeGroups: boolean = false): PersonBalance[] {
  const expenses = getSharedExpenses();
  const profiles = getPersonProfiles();
  const peopleMap = new Map<string, PersonBalance>();

  // Ensure everyone with a profile is included
  Object.keys(profiles).forEach(name => {
    peopleMap.set(name, {
      name,
      totalGiven: 0,
      totalOwed: 0,
      netBalance: 0,
      transactions: []
    });
  });

  expenses.forEach(expense => {
    // Filter out group expenses for individual balances UNLESS explicitly requested
    if (expense.groupId && !includeGroups) return;

    if (!peopleMap.has(expense.personName)) {
      peopleMap.set(expense.personName, {
        name: expense.personName,
        totalGiven: 0,
        totalOwed: 0,
        netBalance: 0,
        transactions: []
      });
    }

    const person = peopleMap.get(expense.personName)!;
    person.transactions.push(expense);

    if (!expense.settled) {
      if (expense.paidBy === 'me') {
        person.totalOwed += expense.amount; // I gave them
      } else {
        person.totalGiven += expense.amount; // They gave me
      }
    }
  });

  peopleMap.forEach(person => {
    person.netBalance = person.totalOwed - person.totalGiven;
  });

  return Array.from(peopleMap.values()).sort((a, b) => b.transactions.length - a.transactions.length);
}

export function getUniquePersonNames(): string[] {
  const expenses = getSharedExpenses();
  const names = new Set<string>();
  expenses.forEach(expense => {
    if (expense.personName) {
      names.add(expense.personName);
    }
  });
  return Array.from(names).sort();
}

export interface GroupBalance {
  groupId: string;
  name: string;
  color: string;
  members: string[];
  totalOwed: number;
  totalGiven: number;
  netBalance: number;
  totalSpend: number;
  transactions: SharedExpense[];
}

export function getGroupBalances(): GroupBalance[] {
  const expenses = getSharedExpenses();
  const groups = getFriendGroups();
  const balanceMap = new Map<string, GroupBalance>();

  groups.forEach(g => {
    balanceMap.set(g.id, {
      groupId: g.id,
      name: g.name,
      color: g.color || '#8B5CF6',
      members: g.members,
      totalOwed: 0,
      totalGiven: 0,
      netBalance: 0,
      totalSpend: 0,
      transactions: []
    });
  });

  expenses.forEach(expense => {
    if (!expense.groupId || !balanceMap.has(expense.groupId)) return;
    const group = balanceMap.get(expense.groupId)!;
    group.transactions.push(expense);

    if (!expense.settled) {
      if (expense.splitParticipants && expense.forPerson === 'all') {
        const share = expense.amount / expense.splitParticipants.length;
        const payer = expense.paidBy;

        // From "Me" perspective
        if (payer === 'me') {
          // I paid. Others owe me.
          const othersCount = expense.splitParticipants.filter(p => p !== 'me').length;
          group.totalOwed += share * othersCount;
        } else if (expense.splitParticipants.includes('me')) {
          // Someone else paid, and I'm part of it. I owe my share.
          group.totalGiven += share;
        }
      } else {
        // Individual/Legacy record
        if (expense.paidBy === 'me') group.totalOwed += expense.amount;
        else group.totalGiven += expense.amount;
      }
    }

    if (expense.category !== 'Settlement') {
      group.totalSpend += expense.amount;
    }
  });

  balanceMap.forEach(group => {
    group.netBalance = group.totalOwed - group.totalGiven;
  });

  return Array.from(balanceMap.values())
    .filter(g => g.transactions.length > 0)
    .sort((a, b) => {
      const latestA = a.transactions.length > 0 ? new Date(a.transactions[0].createdAt).getTime() : 0;
      const latestB = b.transactions.length > 0 ? new Date(b.transactions[0].createdAt).getTime() : 0;
      return latestB - latestA;
    });
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

export function getGroupMemberNetPositions(groupId: string): Record<string, number> {
  const expenses = getSharedExpenses().filter(e => e.groupId === groupId && !e.settled);
  const groups = getFriendGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return {};

  // net[displayName] = balance (+ means owed to them, - means they owe)
  const net: Record<string, number> = {};

  // Seed all known members so everyone shows up even with zero balance
  // Always use 'me' as the key for the current user
  const allMembers = group.members.includes('me') ? group.members : ['me', ...group.members];
  allMembers.forEach(m => { net[m] = 0; });

  expenses.forEach(tx => {
    if (tx.forPerson === 'all' && tx.splitParticipants && tx.splitParticipants.length > 0) {
      const share = tx.amount / tx.splitParticipants.length;

      // credit payer full amount, debit every participant their share
      net[tx.paidBy] = (net[tx.paidBy] ?? 0) + tx.amount;
      tx.splitParticipants.forEach(p => {
        net[p] = (net[p] ?? 0) - share;
      });
    } else if (tx.forPerson !== 'all') {
      // One-to-one: paidBy covered forPerson's expense
      net[tx.paidBy] = (net[tx.paidBy] ?? 0) + tx.amount;
      net[tx.forPerson] = (net[tx.forPerson] ?? 0) - tx.amount;
    }
  });

  return net;
}

export function getMinimalGroupSettlements(groupId: string): SimplifiedDebt[] {
  const positions = getGroupMemberNetPositions(groupId);

  const creditors: { name: string; amount: number }[] = [];
  const debtors: { name: string; amount: number }[] = [];

  Object.entries(positions).forEach(([name, balance]) => {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0.01) creditors.push({ name, amount: rounded });
    if (rounded < -0.01) debtors.push({ name, amount: -rounded }); // store positive
  });

  // Sort largest first for greedy min-cash-flow
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements: SimplifiedDebt[] = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const settle = Math.min(creditors[i].amount, debtors[j].amount);
    settlements.push({
      from: debtors[j].name,
      to: creditors[i].name,
      amount: Math.round(settle * 100) / 100,
    });
    creditors[i].amount -= settle;
    debtors[j].amount -= settle;
    if (creditors[i].amount < 0.01) i++;
    if (debtors[j].amount < 0.01) j++;
  }

  return settlements;
}
// Categories for Personal Expenses
export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Travel',
  'Groceries',
  'Other'
];

// Export/Import
export function exportAllData(): string {
  const data: Record<string, any> = {
    version: '2.1',
    exportedAt: new Date().toISOString()
  };

  // Add all storage keys
  Object.entries(STORAGE_KEYS).forEach(([_, key]) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  });

  // Add links storage keys
  Object.entries(LINKS_STORAGE_KEYS).forEach(([_, key]) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  });

  // Add specific keys not in the objects
  const otherKeys = [
    'splitmate_theme',
    'splitmate_tab_config',
    'splitmate_swipe_nav_enabled',
    'splitmate_liquid_glass_enabled',
    'splitmate_page_slide_enabled'
  ];

  otherKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  });

  return JSON.stringify(data);
}

export function importData(jsonData: string): boolean {
  try {
    const data = JSON.parse(jsonData);
    if (!data || typeof data !== 'object') return false;

    // Clear existing known data first to avoid merges
    clearAllData();

    Object.entries(data).forEach(([key, value]) => {
      // Skip meta fields
      if (key === 'version' || key === 'exportedAt') return;

      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, stringValue);
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to import data:', error);
    return false;
  }
}

// Partial clear functions
export function clearAllData(): void {
  // Clear all defined storage keys
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  Object.values(LINKS_STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

  // Clear other settings
  const otherKeys = [
    'splitmate_theme',
    'splitmate_tab_config',
    'splitmate_swipe_nav_enabled',
    'splitmate_liquid_glass_enabled',
    'splitmate_page_slide_enabled'
  ];
  otherKeys.forEach(key => localStorage.removeItem(key));

  // Also clear any other splitmate prefixed keys just in case
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('splitmate_') || key.startsWith('buddy_'))) {
      localStorage.removeItem(key);
      i--; // Adjust index since we removed an item
    }
  }
}

// Person Profiles
export function getPersonProfiles(): Record<string, PersonProfile> {
  const stored = localStorage.getItem(STORAGE_KEYS.PERSON_PROFILES);
  return stored ? JSON.parse(stored) : {};
}

export function getPersonProfile(name: string): PersonProfile | null {
  const profiles = getPersonProfiles();
  return profiles[name] || null;
}

export function savePersonProfile(profile: PersonProfile): boolean {
  const profiles = getPersonProfiles();
  const isNewPerson = !profiles[profile.name];

  if (isNewPerson && !isProUserCached() && Object.keys(profiles).length >= FREE_LIMITS.MAX_PERSONS) {
    requestProUpgrade(
      'persons',
      'Free users can add only 3 people. Upgrade to Pro for unlimited shared members.',
    );
    return false;
  }

  if (profile.email && !canAddCollaboratorEmail(profile.email)) {
    return false;
  }

  profiles[profile.name] = {
    ...profiles[profile.name],
    ...profile
  };
  localStorage.setItem(STORAGE_KEYS.PERSON_PROFILES, JSON.stringify(profiles));
  return true;
}

export function deletePerson(name: string): void {
  const profiles = getPersonProfiles();
  if (profiles[name]) {
    delete profiles[name];
    localStorage.setItem(STORAGE_KEYS.PERSON_PROFILES, JSON.stringify(profiles));
  }

  // Also delete all shared expenses associated with this person
  const expenses = getSharedExpenses();
  const nextShared = expenses.filter(e => e.personName !== name);
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(nextShared));

  // Also delete mirrored personal expenses
  const pExpenses = getPersonalExpenses();
  const nextPersonal = pExpenses.filter(pe => {
    // If it was mirrored from a shared expense that we just deleted, remove it too
    if (pe.mirrorFromId) {
      return !expenses.some(e => e.id === pe.mirrorFromId && e.personName === name);
    }
    return true;
  });
  localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(nextPersonal));

  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function updatePersonName(oldName: string, newName: string): void {
  // Update profiles
  const profiles = getPersonProfiles();
  if (profiles[oldName]) {
    const profile = profiles[oldName];
    profile.name = newName;
    profiles[newName] = profile;
    delete profiles[oldName];
    localStorage.setItem(STORAGE_KEYS.PERSON_PROFILES, JSON.stringify(profiles));
  }

  // Update shared expenses
  const expenses = getSharedExpenses();
  expenses.forEach(e => {
    if (e.personName === oldName) e.personName = newName;
    if (e.paidBy === oldName) e.paidBy = newName;
    if (e.forPerson === oldName) e.forPerson = newName;
  });
  localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

  window.dispatchEvent(new Event('splitmate_data_changed'));
}

// Pending Sync Updates (Simulated Peer updates)
export function getPendingSyncUpdates(): PendingSyncUpdate[] {
  const profile = getAccountProfile();
  const myEmail = profile.email?.toLowerCase();
  if (!myEmail) return [];

  const key = `${STORAGE_KEYS.PENDING_SYNC_UPDATES}_${myEmail}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

export function addPeerUpdate(update: PendingSyncUpdate, targetEmail: string): void {
  const normalizedEmail = targetEmail.toLowerCase();
  const key = `${STORAGE_KEYS.PENDING_SYNC_UPDATES}_${normalizedEmail}`;
  const updates = JSON.parse(localStorage.getItem(key) || '[]');
  updates.push(update);
  localStorage.setItem(key, JSON.stringify(updates));

  // PUSH TO CLOUD
  void pushUpdateToCloud(update, targetEmail);
}

export function removePendingSyncUpdate(id: string): void {
  const myEmail = getAccountProfile().email;
  if (!myEmail) return;
  const updates = getPendingSyncUpdates().filter(u => u.id !== id);
  localStorage.setItem(`${STORAGE_KEYS.PENDING_SYNC_UPDATES}_${myEmail}`, JSON.stringify(updates));
}

export function clearPendingSyncUpdates(): void {
  const myEmail = getAccountProfile().email;
  if (!myEmail) return;
  localStorage.removeItem(`${STORAGE_KEYS.PENDING_SYNC_UPDATES}_${myEmail}`);
}

// Rejections Flow
export function getRejectionUpdates(): RejectionUpdate[] {
  const profile = getAccountProfile();
  const myEmail = profile.email?.toLowerCase();
  if (!myEmail) return [];
  const key = `${STORAGE_KEYS.REJECTION_NOTIFICATIONS}_${myEmail}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

export function addRejectionUpdate(rejection: RejectionUpdate, targetEmail: string): void {
  import('@/integrations/firebase/sync').then(({ pushUpdateToCloud }) => {
    pushUpdateToCloud({
      ...rejection,
      type: 'rejection'
    }, targetEmail);
  }).catch(console.error);
}

export function removeRejectionUpdate(id: string): void {
  const profile = getAccountProfile();
  const myEmail = profile.email?.toLowerCase();
  if (!myEmail) return;
  const updates = getRejectionUpdates().filter(r => r.id !== id);
  localStorage.setItem(`${STORAGE_KEYS.REJECTION_NOTIFICATIONS}_${myEmail}`, JSON.stringify(updates));
}
export function clearPersonalExpenses(): void {
  localStorage.removeItem(STORAGE_KEYS.PERSONAL_EXPENSES);
}

export function clearSharedExpenses(): void {
  localStorage.removeItem(STORAGE_KEYS.SHARED_EXPENSES);
}

export function clearLinksData(): void {
  localStorage.removeItem(LINKS_STORAGE_KEYS.LINKS);
  localStorage.removeItem(LINKS_STORAGE_KEYS.GROUPS);
}

export function clearMoreTabData(): void {
  localStorage.removeItem(STORAGE_KEYS.LOANS);
  localStorage.removeItem(STORAGE_KEYS.GOALS);
  localStorage.removeItem(STORAGE_KEYS.SUBSCRIPTIONS);
  localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
  localStorage.removeItem(STORAGE_KEYS.QUICK_NOTES);
  localStorage.removeItem(STORAGE_KEYS.TRIP_PLANS);
  localStorage.removeItem(STORAGE_KEYS.TRIP_HISTORY);
  localStorage.removeItem(STORAGE_KEYS.TRIP_DOCUMENTS);
  localStorage.removeItem(STORAGE_KEYS.IMPORTANT_DATES);
  localStorage.removeItem(STORAGE_KEYS.SHOPPING_ITEMS);
}

export const FINANCIAL_ACCOUNT_TYPES: Array<{ value: FinancialAccountType; label: string }> = [
  { value: 'savings', label: 'Savings' },
  { value: 'bank', label: 'Bank' },
  { value: 'credit-card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
];

function normalizeMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normalizeAccount(account: Partial<FinancialAccount>, touch = false): FinancialAccount {
  const now = new Date().toISOString();
  return {
    id: account.id || generateId(),
    name: account.name?.trim() || 'Account',
    type: account.type || 'other',
    budget: normalizeMoney(account.budget),
    isDefault: Boolean(account.isDefault),
    createdAt: account.createdAt || now,
    updatedAt: touch ? now : account.updatedAt || now,
  };
}

function ensureSingleDefaultAccount(accounts: FinancialAccount[]): FinancialAccount[] {
  if (accounts.length === 0) return [];

  let defaultIndex = accounts.findIndex((account) => account.isDefault);
  if (defaultIndex < 0) defaultIndex = 0;

  return accounts.map((account, index) => ({
    ...account,
    isDefault: index === defaultIndex,
  }));
}

export function getAccounts(): FinancialAccount[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Partial<FinancialAccount>[];
    if (!Array.isArray(parsed)) return [];
    const sorted = parsed
      .map((item) => normalizeAccount(item))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return ensureSingleDefaultAccount(sorted);
  } catch {
    return [];
  }
}

export function getDefaultAccountId(): string | undefined {
  const accounts = getAccounts();
  if (accounts.length === 0) return undefined;
  return accounts.find((item) => item.isDefault)?.id || accounts[0].id;
}

export function saveAccounts(items: FinancialAccount[]): void {
  const normalized = ensureSingleDefaultAccount(items.map((item) => normalizeAccount(item)));
  localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(normalized));
  window.dispatchEvent(new Event('splitmate_accounts_changed'));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function saveAccount(account: FinancialAccount): boolean {
  const accounts = getAccounts();
  const normalized = normalizeAccount(account, true);
  const index = accounts.findIndex((item) => item.id === normalized.id);

  if (index < 0 && !isProUserCached() && accounts.length >= FREE_LIMITS.MAX_ACCOUNTS) {
    requestProUpgrade(
      'accounts',
      'Free users can create up to 3 accounts. Upgrade to Pro to add more accounts.',
    );
    return false;
  }

  if (index >= 0) {
    normalized.createdAt = accounts[index].createdAt;
    if (account.isDefault === undefined) {
      normalized.isDefault = accounts[index].isDefault;
    }
    if (normalized.isDefault) {
      accounts.forEach((item) => { item.isDefault = false; });
    }
    accounts[index] = normalized;
  } else {
    if (normalized.isDefault) {
      accounts.forEach((item) => { item.isDefault = false; });
    }
    accounts.unshift(normalized);
  }
  saveAccounts(accounts);
  return true;
}

export function deleteAccount(id: string): void {
  const accounts = getAccounts().filter((account) => account.id !== id);
  saveAccounts(accounts);
}

export function getAccountSummaries(): FinancialAccountSummary[] {
  const accounts = getAccounts();
  if (accounts.length === 0) return [];

  const personal = getPersonalExpenses();
  const shared = getSharedExpenses();

  return accounts.map((account) => {
    const relatedPersonal = personal.filter(
      (entry) => entry.accountId === account.id && !entry.isMirror,
    );

    const income = relatedPersonal
      .filter((entry) => !!entry.isIncome)
      .reduce((sum, entry) => sum + entry.amount, 0);

    const personalSpent = relatedPersonal
      .filter((entry) => !entry.isIncome)
      .reduce((sum, entry) => sum + entry.amount, 0);

    const sharedSpent = shared
      .filter((entry) => entry.accountId === account.id && entry.paidBy === 'me')
      .reduce((sum, entry) => sum + entry.amount, 0);

    const available = normalizeMoney(account.budget + income - personalSpent - sharedSpent);

    return {
      ...account,
      income: normalizeMoney(income),
      personalSpent: normalizeMoney(personalSpent),
      sharedSpent: normalizeMoney(sharedSpent),
      available,
    };
  });
}

export function getSmsTransactions(): SmsTransactionCandidate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SMS_TRANSACTIONS);
    const parsed = raw ? (JSON.parse(raw) as SmsTransactionCandidate[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}

export function saveSmsTransactions(items: SmsTransactionCandidate[]): void {
  localStorage.setItem(STORAGE_KEYS.SMS_TRANSACTIONS, JSON.stringify(items));
  window.dispatchEvent(new Event('splitmate_sms_transactions_changed'));
  window.dispatchEvent(new Event('splitmate_data_changed'));
}

export function upsertSmsTransactions(items: SmsTransactionCandidate[]): void {
  if (items.length === 0) return;
  const existing = getSmsTransactions();
  const byExternal = new Map(existing.map((item) => [item.externalId, item]));

  items.forEach((item) => {
    if (!item.externalId) return;
    const prev = byExternal.get(item.externalId);
    byExternal.set(item.externalId, prev ? { ...prev, ...item } : item);
  });

  saveSmsTransactions(Array.from(byExternal.values()));
}

export function updateSmsTransaction(id: string, updates: Partial<SmsTransactionCandidate>): void {
  const items = getSmsTransactions().map((item) => (item.id === id ? { ...item, ...updates } : item));
  saveSmsTransactions(items);
}

export function removeSmsTransaction(id: string): void {
  const items = getSmsTransactions().filter((item) => item.id !== id);
  saveSmsTransactions(items);
}

const DEFAULT_BUDGET_PLANNER_CONFIG: BudgetPlannerConfig = {
  monthlyIncome: 0,
  fixedExpenses: 0,
  savingsGoal: 0,
  targetDailyAllowance: 0,
  categoryBudgets: {},
};

export function getBudgetPlannerConfig(): BudgetPlannerConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.BUDGET_PLANNER);
    if (!stored) return { ...DEFAULT_BUDGET_PLANNER_CONFIG };
    const parsed = JSON.parse(stored) as Partial<BudgetPlannerConfig>;

    const sanitizeAmount = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    };

    const categoryBudgets: Record<string, number> = {};
    if (parsed.categoryBudgets && typeof parsed.categoryBudgets === 'object') {
      Object.entries(parsed.categoryBudgets).forEach(([key, value]) => {
        const amount = sanitizeAmount(value);
        if (amount > 0) categoryBudgets[key] = amount;
      });
    }

    return {
      monthlyIncome: sanitizeAmount(parsed.monthlyIncome),
      fixedExpenses: sanitizeAmount(parsed.fixedExpenses),
      savingsGoal: sanitizeAmount(parsed.savingsGoal),
      targetDailyAllowance: sanitizeAmount(parsed.targetDailyAllowance),
      categoryBudgets,
    };
  } catch {
    return { ...DEFAULT_BUDGET_PLANNER_CONFIG };
  }
}

export function saveBudgetPlannerConfig(config: Partial<BudgetPlannerConfig>): void {
  const sanitizeAmount = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };

  const categoryBudgets: Record<string, number> = {};
  if (config.categoryBudgets && typeof config.categoryBudgets === 'object') {
    Object.entries(config.categoryBudgets).forEach(([key, value]) => {
      const amount = sanitizeAmount(value);
      if (amount > 0) categoryBudgets[key] = amount;
    });
  }

  const normalized: BudgetPlannerConfig = {
    monthlyIncome: sanitizeAmount(config.monthlyIncome),
    fixedExpenses: sanitizeAmount(config.fixedExpenses),
    savingsGoal: sanitizeAmount(config.savingsGoal),
    targetDailyAllowance: sanitizeAmount(config.targetDailyAllowance),
    categoryBudgets,
  };

  localStorage.setItem(STORAGE_KEYS.BUDGET_PLANNER, JSON.stringify(normalized));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('splitmate_budget_changed'));
  }
}

export function getLoans(): LoanItem[] {
  const stored = localStorage.getItem(STORAGE_KEYS.LOANS);
  return stored ? JSON.parse(stored) : [];
}

export function saveLoans(items: LoanItem[]): boolean {
  if (!isProUserCached() && items.length > FREE_LIMITS.MAX_LOANS) {
    requestProUpgrade(
      'loans',
      'Free users can track only 1 loan. Upgrade to Pro for unlimited loan tracking.',
    );
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(items));
  return true;
}

export function getGoals(): GoalItem[] {
  const stored = localStorage.getItem(STORAGE_KEYS.GOALS);
  return stored ? JSON.parse(stored) : [];
}

export function saveGoals(items: GoalItem[]): boolean {
  if (!isProUserCached() && items.length > FREE_LIMITS.MAX_GOALS) {
    requestProUpgrade(
      'goals',
      'Free users can track only 1 goal. Upgrade to Pro for unlimited goals.',
    );
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(items));
  return true;
}

export function getSubscriptions(): SubscriptionItem[] {
  const stored = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
  return stored ? JSON.parse(stored) : [];
}

export function saveSubscriptions(items: SubscriptionItem[]): boolean {
  if (!isProUserCached() && items.length > FREE_LIMITS.MAX_SUBSCRIPTIONS) {
    requestProUpgrade(
      'subscriptions',
      'Free users can track up to 2 subscriptions. Upgrade to Pro for unlimited subscriptions.',
    );
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(items));
  return true;
}

// More Features Data
export function getQuickNotes(): QuickNote[] {
  const stored = localStorage.getItem(STORAGE_KEYS.QUICK_NOTES);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored) as Array<Partial<QuickNote>>;
    return parsed.map((item) => {
      const checklistItems = Array.isArray(item.checklistItems)
        ? item.checklistItems
          .map((check) => ({
            id: typeof check.id === 'string' ? check.id : generateId(),
            text: typeof check.text === 'string' ? check.text : '',
            completed: Boolean(check.completed),
          }))
          .filter((check) => check.text.trim().length > 0)
        : [];

      const attachments = Array.isArray(item.attachments)
        ? item.attachments
          .map((attachment) => ({
            id: typeof attachment.id === 'string' ? attachment.id : generateId(),
            name: typeof attachment.name === 'string' ? attachment.name : 'Attachment',
            mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : 'application/octet-stream',
            size: typeof attachment.size === 'number' ? attachment.size : 0,
            dataUrl: typeof attachment.dataUrl === 'string' ? attachment.dataUrl : '',
            createdAt: typeof attachment.createdAt === 'string' ? attachment.createdAt : new Date().toISOString(),
          }))
          .filter((attachment) => attachment.dataUrl)
        : [];

      const normalizedTitle = typeof item.title === 'string' ? item.title : '';
      const normalizedContent = typeof item.content === 'string' ? item.content : '';
      const normalizedType = item.type === 'checklist' ? 'checklist' : 'text';

      return {
        id: typeof item.id === 'string' ? item.id : generateId(),
        title: normalizedTitle,
        content: normalizedContent,
        type: normalizedType,
        checklistItems,
        tags: Array.isArray(item.tags)
          ? item.tags
            .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
            .filter((tag) => tag.length > 0)
          : [],
        color:
          item.color === 'sun' ||
            item.color === 'mint' ||
            item.color === 'sky' ||
            item.color === 'peach' ||
            item.color === 'rose' ||
            item.color === 'slate'
            ? item.color
            : 'default',
        archived: Boolean(item.archived),
        trashedAt: typeof item.trashedAt === 'string' ? item.trashedAt : undefined,
        locked: Boolean(item.locked),
        pin: typeof item.pin === 'string' ? item.pin : undefined,
        attachments,
        pinned: Boolean(item.pinned),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      } satisfies QuickNote;
    });
  } catch {
    return [];
  }
}

export function saveQuickNotes(notes: QuickNote[]): void {
  localStorage.setItem(STORAGE_KEYS.QUICK_NOTES, JSON.stringify(notes));
}

export function getTripPlans(): TripPlan[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TRIP_PLANS);
  return stored ? JSON.parse(stored) : [];
}

export function saveTripPlans(plans: TripPlan[]): void {
  localStorage.setItem(STORAGE_KEYS.TRIP_PLANS, JSON.stringify(plans));
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateExpenseShares(expense: TripExpense): Record<string, number> {
  const excluded = new Set(expense.excludedUserIds ?? []);
  const participants = expense.splitBetween.filter((member) => !excluded.has(member));

  if (participants.length === 0) return {};

  if (expense.splitType === 'percentage' && expense.customSplit) {
    const shareMap: Record<string, number> = {};
    let totalAssigned = 0;

    for (const member of participants) {
      const percent = expense.customSplit[member] ?? 0;
      const share = roundCurrency((expense.amount * percent) / 100);
      shareMap[member] = share;
      totalAssigned += share;
    }

    const diff = roundCurrency(expense.amount - totalAssigned);
    if (diff !== 0) {
      shareMap[participants[0]] = roundCurrency((shareMap[participants[0]] ?? 0) + diff);
    }

    return shareMap;
  }

  if (expense.splitType === 'exact' && expense.customSplit) {
    const shareMap: Record<string, number> = {};
    let totalAssigned = 0;

    for (const member of participants) {
      const share = roundCurrency(expense.customSplit[member] ?? 0);
      shareMap[member] = share;
      totalAssigned += share;
    }

    const diff = roundCurrency(expense.amount - totalAssigned);
    if (diff !== 0) {
      shareMap[participants[0]] = roundCurrency((shareMap[participants[0]] ?? 0) + diff);
    }

    return shareMap;
  }

  const equalShare = roundCurrency(expense.amount / participants.length);
  const shareMap: Record<string, number> = {};

  for (const member of participants) {
    shareMap[member] = equalShare;
  }

  const totalAssigned = equalShare * participants.length;
  const diff = roundCurrency(expense.amount - totalAssigned);
  if (diff !== 0) {
    shareMap[participants[0]] = roundCurrency(shareMap[participants[0]] + diff);
  }

  return shareMap;
}

export function calculateTripSettlement(expenses: TripExpense[], members: string[]) {
  const totalPaid: Record<string, number> = {};
  const totalShare: Record<string, number> = {};

  const ensureMember = (name: string) => {
    if (!(name in totalPaid)) totalPaid[name] = 0;
    if (!(name in totalShare)) totalShare[name] = 0;
  };

  for (const member of members) {
    totalPaid[member] = 0;
    totalShare[member] = 0;
  }

  for (const expense of expenses) {
    const payerEntries = Object.entries(expense.paidByAmounts ?? {}).filter(([, value]) => value > 0);

    if (payerEntries.length > 0) {
      let paidSum = 0;
      for (const [payer, rawAmount] of payerEntries) {
        ensureMember(payer);
        const amount = roundCurrency(rawAmount);
        totalPaid[payer] = roundCurrency((totalPaid[payer] ?? 0) + amount);
        paidSum += amount;
      }

      const paidDiff = roundCurrency(expense.amount - paidSum);
      if (paidDiff !== 0) {
        const fallbackPayer = payerEntries[0][0];
        ensureMember(fallbackPayer);
        totalPaid[fallbackPayer] = roundCurrency((totalPaid[fallbackPayer] ?? 0) + paidDiff);
      }
    } else {
      const payers = expense.paidBy.length > 0 ? expense.paidBy : [];
      if (payers.length > 0) {
        const paidPerPayer = roundCurrency(expense.amount / payers.length);
        for (const payer of payers) {
          ensureMember(payer);
          totalPaid[payer] = roundCurrency((totalPaid[payer] ?? 0) + paidPerPayer);
        }
        const paidDiff = roundCurrency(expense.amount - paidPerPayer * payers.length);
        if (paidDiff !== 0) {
          totalPaid[payers[0]] = roundCurrency((totalPaid[payers[0]] ?? 0) + paidDiff);
        }
      }
    }

    const shares = calculateExpenseShares(expense);
    for (const [member, share] of Object.entries(shares)) {
      ensureMember(member);
      totalShare[member] = roundCurrency((totalShare[member] ?? 0) + share);
    }

    if (expense.borrowedFromAmounts && Object.keys(expense.borrowedFromAmounts).length > 0 && expense.paidBy.length > 0) {
      const borrower = expense.paidBy[0];
      ensureMember(borrower);
      for (const [lender, amount] of Object.entries(expense.borrowedFromAmounts)) {
        if (amount <= 0) continue;
        ensureMember(lender);
        totalShare[borrower] = roundCurrency((totalShare[borrower] ?? 0) + roundCurrency(amount));
      }
    }

    if (expense.borrowedFrom && expense.paidBy.length > 0) {
      const borrower = expense.paidBy[0];
      const borrowedAmount = roundCurrency(expense.borrowedAmount ?? expense.amount);
      ensureMember(borrower);
      ensureMember(expense.borrowedFrom);
      totalShare[borrower] = roundCurrency((totalShare[borrower] ?? 0) + borrowedAmount);
      totalPaid[expense.borrowedFrom] = roundCurrency((totalPaid[expense.borrowedFrom] ?? 0) + borrowedAmount);
    }
  }

  const balances = members.map((member) => {
    const paid = roundCurrency(totalPaid[member] ?? 0);
    const share = roundCurrency(totalShare[member] ?? 0);
    return {
      member,
      totalPaid: paid,
      totalShare: share,
      balance: roundCurrency(paid - share),
    };
  });

  const creditors = balances
    .filter((entry) => entry.balance > 0)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.balance - a.balance);

  const debtors = balances
    .filter((entry) => entry.balance < 0)
    .map((entry) => ({ ...entry, balance: Math.abs(entry.balance) }))
    .sort((a, b) => a.balance - b.balance);

  const settlements: TripSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = roundCurrency(Math.min(debtor.balance, creditor.balance));

    if (amount > 0) {
      settlements.push({ from: debtor.member, to: creditor.member, amount });
    }

    debtor.balance = roundCurrency(debtor.balance - amount);
    creditor.balance = roundCurrency(creditor.balance - amount);

    if (debtor.balance <= 0.001) debtorIndex += 1;
    if (creditor.balance <= 0.001) creditorIndex += 1;
  }

  return {
    balances,
    settlements,
  };
}

export function getTripHistory(): TripHistoryItem[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY);
  return stored ? JSON.parse(stored) : [];
}

export function saveTripHistory(items: TripHistoryItem[]): void {
  localStorage.setItem(STORAGE_KEYS.TRIP_HISTORY, JSON.stringify(items));
}

export function getTripDocuments(): TripDocument[] {
  const stored = localStorage.getItem(STORAGE_KEYS.TRIP_DOCUMENTS);
  return stored ? JSON.parse(stored) : [];
}

export function saveTripDocuments(documents: TripDocument[]): void {
  localStorage.setItem(STORAGE_KEYS.TRIP_DOCUMENTS, JSON.stringify(documents));
}

export function addTripDocument(document: TripDocument): void {
  const documents = getTripDocuments();
  documents.push(document);
  saveTripDocuments(documents);
}

export function getTripDocumentsByTripId(tripId: string): TripDocument[] {
  return getTripDocuments().filter((doc) => doc.tripId === tripId);
}

export function endTripAndArchive(tripId: string): TripHistoryItem | null {
  const trips = getTripPlans();
  const target = trips.find((trip) => trip.id === tripId);
  if (!target) return null;

  const members = target.members ?? [];
  const expenses = target.expenses ?? [];
  const places = target.places ?? [];
  const settlementResult = calculateTripSettlement(expenses, members);
  const totalSpent = roundCurrency(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const perPerson = members.length > 0 ? roundCurrency(totalSpent / members.length) : 0;

  const historyItem: TripHistoryItem = {
    id: target.id,
    name: target.title,
    destination: target.destination,
    startDate: target.startDate,
    endDate: target.endDate,
    members,
    expenses,
    places,
    settlements: settlementResult.settlements,
    totalSpent,
    perPerson,
    createdAt: new Date().toISOString(),
  };

  const nextTrips = trips.map((trip) =>
    trip.id === tripId
      ? {
        ...trip,
        settlements: settlementResult.settlements,
        completed: true,
        endTripLockedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      : trip
  );

  saveTripPlans(nextTrips);
  saveTripHistory([historyItem, ...getTripHistory().filter((entry) => entry.id !== historyItem.id)]);

  return historyItem;
}

export function getTripBudgetStats(expenses: TripExpense[], totalBudget = 0) {
  const categoryTotals: Record<string, number> = {};
  const dailyTotals: Record<string, number> = {};

  for (const expense of expenses) {
    categoryTotals[expense.category] = roundCurrency((categoryTotals[expense.category] ?? 0) + expense.amount);
    dailyTotals[expense.date] = roundCurrency((dailyTotals[expense.date] ?? 0) + expense.amount);
  }

  const totalSpent = roundCurrency(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const remaining = roundCurrency(totalBudget - totalSpent);

  return {
    totalSpent,
    remaining,
    exceeded: remaining < 0,
    categoryTotals,
    dailyTotals,
  };
}

export function getImportantDates(): ImportantDateItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.IMPORTANT_DATES);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<Partial<ImportantDateItem>>;
    if (!Array.isArray(parsed)) return [];

    const validCategories = new Set<ImportantDateItem['category']>([
      'birthday',
      'anniversary',
      'personal',
      'custom',
      'event',
      'deadline',
      'other',
    ]);

    return parsed
      .filter((item) => typeof item?.id === 'string' && typeof item?.title === 'string' && typeof item?.date === 'string')
      .map((item) => {
        const normalizedRepeatType: ImportantDateItem['repeatType'] =
          item.repeatType === 'yearly' || item.repeatType === 'monthly' || item.repeatType === 'custom'
            ? item.repeatType
            : item.repeatYearly
              ? 'yearly'
              : 'none';

        const normalizedCategory = validCategories.has(item.category as ImportantDateItem['category'])
          ? (item.category as ImportantDateItem['category'])
          : 'personal';

        const interval = typeof item.repeatIntervalDays === 'number' && item.repeatIntervalDays > 0
          ? Math.round(item.repeatIntervalDays)
          : undefined;

        return {
          id: item.id as string,
          title: (item.title as string).trim(),
          date: item.date as string,
          category: normalizedCategory,
          personName: typeof item.personName === 'string' ? item.personName.trim() || undefined : undefined,
          customCategoryLabel:
            typeof item.customCategoryLabel === 'string' ? item.customCategoryLabel.trim() || undefined : undefined,
          emoji: typeof item.emoji === 'string' ? item.emoji.trim() || undefined : undefined,
          details: typeof item.details === 'string' ? item.details.trim() || undefined : undefined,
          repeatType: normalizedRepeatType,
          repeatIntervalDays: normalizedRepeatType === 'custom' ? interval ?? 30 : undefined,
          repeatYearly: normalizedRepeatType === 'yearly',
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

export function saveImportantDates(items: ImportantDateItem[]): void {
  localStorage.setItem(STORAGE_KEYS.IMPORTANT_DATES, JSON.stringify(items));
}

export function getShoppingLists(): ShoppingList[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SHOPPING_ITEMS);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    const now = new Date().toISOString();

    // Migration path: old schema stored plain ShoppingItem[]
    if (Array.isArray(parsed) && (parsed.length === 0 || !('items' in (parsed[0] as Record<string, unknown>)))) {
      const legacyItems = (parsed as Array<Partial<ShoppingItem>>).map((item) => ({
        id: typeof item.id === 'string' ? item.id : generateId(),
        listId: 'default',
        name: typeof item.name === 'string' ? item.name : '',
        quantity: typeof item.quantity === 'number' ? Math.max(1, Math.round(item.quantity)) : 1,
        estimatedPrice: typeof item.estimatedPrice === 'number' ? item.estimatedPrice : undefined,
        category: (item.category as ShoppingCategory | undefined) ?? 'other',
        favorite: Boolean(item.favorite),
        productLink: typeof item.productLink === 'string' ? item.productLink : undefined,
        linkTitle: typeof item.linkTitle === 'string' ? item.linkTitle : undefined,
        linkFavicon: typeof item.linkFavicon === 'string' ? item.linkFavicon : undefined,
        done: Boolean(item.done),
        notes: typeof item.notes === 'string' ? item.notes : undefined,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      }));

      const migrated: ShoppingList[] = [
        {
          id: 'default',
          name: 'My List',
          archived: false,
          createdAt: now,
          updatedAt: now,
          items: legacyItems,
        },
      ];
      localStorage.setItem(STORAGE_KEYS.SHOPPING_ITEMS, JSON.stringify(migrated));
      return migrated;
    }

    if (!Array.isArray(parsed)) return [];

    return (parsed as Array<Partial<ShoppingList>>)
      .filter((list) => typeof list?.id === 'string' && typeof list?.name === 'string')
      .map((list) => {
        const items = Array.isArray(list.items)
          ? list.items
            .filter((item) => typeof item?.id === 'string' && typeof item?.name === 'string')
            .map((item) => ({
              id: item.id as string,
              listId: typeof item.listId === 'string' ? item.listId : (list.id as string),
              name: (item.name as string).trim(),
              quantity: typeof item.quantity === 'number' ? Math.max(1, Math.round(item.quantity)) : 1,
              estimatedPrice: typeof item.estimatedPrice === 'number' ? item.estimatedPrice : undefined,
              category: (item.category as ShoppingCategory | undefined) ?? 'other',
              favorite: Boolean(item.favorite),
              productLink: typeof item.productLink === 'string' ? item.productLink : undefined,
              linkTitle: typeof item.linkTitle === 'string' ? item.linkTitle : undefined,
              linkFavicon: typeof item.linkFavicon === 'string' ? item.linkFavicon : undefined,
              done: Boolean(item.done),
              notes: typeof item.notes === 'string' ? item.notes : undefined,
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
              updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
            }))
          : [];

        return {
          id: list.id as string,
          name: (list.name as string).trim() || 'Untitled List',
          archived: Boolean(list.archived),
          createdAt: typeof list.createdAt === 'string' ? list.createdAt : now,
          updatedAt: typeof list.updatedAt === 'string' ? list.updatedAt : now,
          items,
        };
      });
  } catch {
    return [];
  }
}

export function saveShoppingLists(lists: ShoppingList[]): void {
  localStorage.setItem(STORAGE_KEYS.SHOPPING_ITEMS, JSON.stringify(lists));
}

// Compatibility helper for legacy callers that only need item-level count/listing.
export function getShoppingItems(): ShoppingItem[] {
  return getShoppingLists()
    .filter((list) => !list.archived)
    .flatMap((list) => list.items);
}

// Compatibility helper to preserve older write API by writing into default list.
export function saveShoppingItems(items: ShoppingItem[]): void {
  const now = new Date().toISOString();
  const existing = getShoppingLists();
  const defaultList = existing.find((list) => list.id === 'default');
  const normalizedItems = items.map((item) => ({ ...item, listId: 'default', category: item.category ?? 'other' }));

  if (defaultList) {
    const next = existing.map((list) =>
      list.id === 'default'
        ? { ...list, items: normalizedItems, updatedAt: now }
        : list
    );
    saveShoppingLists(next);
    return;
  }

  saveShoppingLists([
    {
      id: 'default',
      name: 'My List',
      archived: false,
      createdAt: now,
      updatedAt: now,
      items: normalizedItems,
    },
    ...existing,
  ]);
}

// Tab Configuration
export interface TabConfig {
  id: string;
  visible: boolean;
}

export const MAX_BOTTOM_TABS = 5;
export const FIXED_BOTTOM_TAB_IDS = ['home', 'more'] as const;

const DEFAULT_TABS: TabConfig[] = [
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

function sanitizeTabConfig(config: TabConfig[]): TabConfig[] {
  const defaultMap = new Map(DEFAULT_TABS.map((tab) => [tab.id, tab]));
  const ordered: TabConfig[] = [];
  const seen = new Set<string>();

  for (const tab of config) {
    if (!defaultMap.has(tab.id) || seen.has(tab.id)) continue;
    ordered.push({ id: tab.id, visible: Boolean(tab.visible) });
    seen.add(tab.id);
  }

  for (const base of DEFAULT_TABS) {
    if (!seen.has(base.id)) {
      ordered.push({ ...base });
    }
  }

  const fixedSet = new Set<string>(FIXED_BOTTOM_TAB_IDS);
  const maxDynamicVisible = MAX_BOTTOM_TABS - FIXED_BOTTOM_TAB_IDS.length;
  let dynamicVisibleCount = 0;

  return ordered.map((tab) => {
    if (fixedSet.has(tab.id)) {
      return { ...tab, visible: true };
    }

    if (!tab.visible) return tab;
    if (dynamicVisibleCount >= maxDynamicVisible) {
      return { ...tab, visible: false };
    }

    dynamicVisibleCount += 1;
    return tab;
  });
}

function isLegacyDefaultVisibleConfig(config: TabConfig[]): boolean {
  const visibleIds = config.filter((tab) => tab.visible).map((tab) => tab.id);
  const expected = ['home', 'personal', 'shared', 'accounts', 'more'];
  if (visibleIds.length !== expected.length) return false;
  return expected.every((id, index) => visibleIds[index] === id);
}

function migrateLegacyDefaultTabs(config: TabConfig[]): TabConfig[] {
  if (!isLegacyDefaultVisibleConfig(config)) return config;

  return config.map((tab) => {
    if (tab.id === 'shared') return { ...tab, visible: false };
    if (tab.id === 'transactions') return { ...tab, visible: true };
    return tab;
  });
}

function isLegacySplitLinksVisibleConfig(config: TabConfig[]): boolean {
  const visibleIds = config.filter((tab) => tab.visible).map((tab) => tab.id);
  const legacyPresets = [
    ['home', 'personal', 'shared', 'links', 'more'],
    ['home', 'personal', 'shared', 'accounts', 'more'],
  ];

  if (visibleIds.length !== 5) return false;
  return legacyPresets.some((preset) => preset.every((id, index) => visibleIds[index] === id));
}

function migrateLegacySplitLinksTabs(config: TabConfig[]): TabConfig[] {
  if (!isLegacySplitLinksVisibleConfig(config)) return config;

  return config.map((tab) => {
    if (tab.id === 'shared' || tab.id === 'links') return { ...tab, visible: false };
    if (tab.id === 'transactions' || tab.id === 'accounts') return { ...tab, visible: true };
    return tab;
  });
}

function migrateDefaultFiveTabOrder(config: TabConfig[]): TabConfig[] {
  const visibleIds = config.filter((tab) => tab.visible).map((tab) => tab.id);
  const targetVisibleIds = ['home', 'personal', 'transactions', 'accounts', 'more'];

  if (visibleIds.length !== targetVisibleIds.length) return config;
  const hasSameVisibleSet = targetVisibleIds.every((id) => visibleIds.includes(id));
  if (!hasSameVisibleSet) return config;

  const byId = new Map(config.map((tab) => [tab.id, tab]));
  const ordered: TabConfig[] = [];

  // Force the requested bottom-nav sequence.
  targetVisibleIds.forEach((id) => {
    const entry = byId.get(id);
    if (!entry) return;
    ordered.push({ ...entry, visible: true });
    byId.delete(id);
  });

  // Keep all other tabs in their existing relative order after pinned tabs.
  config.forEach((tab) => {
    if (!byId.has(tab.id)) return;
    ordered.push({ ...tab });
    byId.delete(tab.id);
  });

  return ordered;
}

export function getTabConfig(): TabConfig[] {
  try {
    const raw = localStorage.getItem('splitmate_tab_config');
    if (!raw) {
      const sanitizedDefaults = sanitizeTabConfig(DEFAULT_TABS);
      setTabConfig(sanitizedDefaults);
      return sanitizedDefaults;
    }
    const parsed = JSON.parse(raw) as TabConfig[];
    const sanitized = sanitizeTabConfig(parsed);
    const migratedLegacy = migrateLegacyDefaultTabs(sanitized);
    const migratedSplitLinks = migrateLegacySplitLinksTabs(migratedLegacy);
    const migrated = migrateDefaultFiveTabOrder(migratedSplitLinks);
    if (JSON.stringify(migrated) !== JSON.stringify(parsed)) {
      setTabConfig(migrated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('splitmate_tab_config_changed'));
      }
    }

    return migrated;
  } catch {
    const fallback = sanitizeTabConfig(DEFAULT_TABS);
    setTabConfig(fallback);
    return fallback;
  }
}

export function setTabConfig(config: TabConfig[]): void {
  const sanitized = sanitizeTabConfig(config);
  localStorage.setItem('splitmate_tab_config', JSON.stringify(sanitized));
}

export function getLastActiveTab(): string {
  return localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_TAB) || 'home';
}

export function setLastActiveTab(tabId: string): void {
  localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_TAB, tabId);
}

const SWIPE_NAV_KEY = 'splitmate_swipe_nav_enabled';
const LIQUID_GLASS_KEY = 'splitmate_liquid_glass_enabled';
const PAGE_SLIDE_KEY = 'splitmate_page_slide_enabled';

export function getSwipeNavEnabled(): boolean {
  const res = localStorage.getItem(SWIPE_NAV_KEY);
  return res === null ? true : res === 'true';
}

export function setSwipeNavEnabled(enabled: boolean): void {
  localStorage.setItem(SWIPE_NAV_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new Event('splitmate_swipe_nav_changed'));
}

export const getLiquidGlassEnabled = (): boolean => {
  const res = localStorage.getItem(LIQUID_GLASS_KEY);
  return res === null ? true : res === 'true';
};

export const setLiquidGlassEnabled = (enabled: boolean) => {
  localStorage.setItem(LIQUID_GLASS_KEY, enabled.toString());
  window.dispatchEvent(new CustomEvent('splitmate_liquid_glass_changed', { detail: enabled }));
};

export function getPageSlideEnabled(): boolean {
  const res = localStorage.getItem(PAGE_SLIDE_KEY);
  return res === null ? true : res === 'true';
}

export function setPageSlideEnabled(enabled: boolean): void {
  localStorage.setItem(PAGE_SLIDE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new Event('splitmate_page_slide_changed'));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Links Management
export function saveLink(link: LinkItem): boolean {
  const links = getLinks();
  const existingIndex = links.findIndex(l => l.id === link.id);
  if (existingIndex >= 0) {
    links[existingIndex] = link;
  } else {
    if (!isProUserCached() && links.length >= FREE_LIMITS.MAX_LINKS) {
      requestProUpgrade(
        'links',
        'Free users can save up to 4 links. Upgrade to Pro for unlimited links.',
      );
      return false;
    }
    links.push(link);
  }
  localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(links));
  return true;
}

export function getLinks(): LinkItem[] {
  const stored = localStorage.getItem(LINKS_STORAGE_KEYS.LINKS);
  return stored ? JSON.parse(stored) : [];
}

export function deleteLink(id: string): void {
  const links = getLinks().filter(l => l.id !== id);
  localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(links));
}

export function moveLinksToGroup(linkIds: string[], groupId: string): void {
  const links = getLinks();
  const next = links.map(link =>
    linkIds.includes(link.id) ? { ...link, groupId } : link
  );
  localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(next));
}

export function toggleLinkPin(id: string): void {
  const links = getLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.pinned = !link.pinned;
    localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(links));
  }
}

export function toggleLinkLock(id: string): void {
  const links = getLinks();
  const link = links.find(l => l.id === id);
  if (link) {
    link.locked = !link.locked;
    localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(links));
  }
}

// Groups Management
export function saveGroup(group: LinkGroup): boolean {
  const groups = getGroups();
  const existingIndex = groups.findIndex(g => g.id === group.id);
  if (existingIndex >= 0) {
    groups[existingIndex] = group;
  } else {
    if (!isProUserCached() && groups.length >= FREE_LIMITS.MAX_LINK_GROUPS) {
      requestProUpgrade(
        'link-groups',
        'Free users can create only 1 link group. Upgrade to Pro for grouped links without limits.',
      );
      return false;
    }
    groups.push(group);
  }
  localStorage.setItem(LINKS_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
  return true;
}

export function getGroups(): LinkGroup[] {
  const stored = localStorage.getItem(LINKS_STORAGE_KEYS.GROUPS);
  return stored ? JSON.parse(stored) : [];
}

export function deleteGroup(id: string): void {
  // Delete all links in the group first
  const links = getLinks().filter(l => l.groupId !== id);
  localStorage.setItem(LINKS_STORAGE_KEYS.LINKS, JSON.stringify(links));

  // Delete the group
  const groups = getGroups().filter(g => g.id !== id);
  localStorage.setItem(LINKS_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
}

export function toggleGroupPin(id: string): void {
  const groups = getGroups();
  const group = groups.find(g => g.id === id);
  if (group) {
    group.pinned = !group.pinned;
    localStorage.setItem(LINKS_STORAGE_KEYS.GROUPS, JSON.stringify(groups));
  }
}

// Fetch metadata for a URL
export async function fetchLinkMetadata(url: string): Promise<Partial<LinkItem>> {
  try {
    // Simple favicon extraction
    const domain = new URL(url).hostname;
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    // For now, we'll use the domain as title since we can't fetch HTML in browser
    const title = domain.replace('www.', '');

    return {
      favicon,
      title
    };
  } catch (error) {
    console.error('Failed to fetch metadata:', error);
    return {};
  }
}

export function getHomeSettings(): HomeTabSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.HOME_SETTINGS);
    if (!stored) return { ...DEFAULT_HOME_SETTINGS };
    return { ...DEFAULT_HOME_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_HOME_SETTINGS };
  }
}

export function saveHomeSettings(settings: HomeTabSettings): void {
  localStorage.setItem(STORAGE_KEYS.HOME_SETTINGS, JSON.stringify(settings));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('home_settings_changed'));
  }
}

export function generateInviteLink(): string {
  if (typeof window === 'undefined') return '';
  const profile = getAccountProfile();
  if (!profile.email) return '';

  const params = new URLSearchParams();
  params.set('invite_email', profile.email);
  params.set('invite_name', profile.name);

  // Using a proper HTTPS link so it's clickable in all apps (WhatsApp, Search, etc.)
  // We use the project's Firebase domain as a reliable 'proper' host.
  return `https://expensetracker-a2f34.firebaseapp.com/invite?${params.toString()}`;
}

export function triggerForceSync(): void {
  const expenses = getSharedExpenses();
  const myProfile = getAccountProfile();
  if (!myProfile.email) return;

  expenses.forEach(expense => {
    const profile = getPersonProfile(expense.personName);
    if (profile?.email) {
      // Create a pending update for the 'other side'
      const inverseExpense: SharedExpense = {
        ...expense,
        id: expense.id,
        personName: myProfile.name,           // receiver will see this as the person's name
        paidBy: expense.paidBy === 'me' ? myProfile.name : 'me',   // ← FIXED
        forPerson: expense.forPerson === 'me' ? myProfile.name : 'me', // ← FIXED
      };

      addPeerUpdate({
        id: generateId(),
        fromName: myProfile.name,
        fromEmail: myProfile.email,
        expense: inverseExpense,
        type: 'added',
        timestamp: new Date().toISOString()
      }, profile.email);
    }
  });

  toast.success("Force sync triggered for all shared contacts!");
}

export function syncGroupWithEmail(groupId: string): void {
  const group = getFriendGroup(groupId);
  const myProfile = getAccountProfile();

  if (!isProUserCached() && getUniqueCollaboratorEmails().length > FREE_LIMITS.MAX_COLLAB_EMAILS) {
    requestProUpgrade(
      'collaboration',
      'Free users can sync with only 1 collaborator. Upgrade to Pro for multi-person group sync.',
    );
    return;
  }

  if (!group?.syncEmails || group.syncEmails.length === 0 || !myProfile.email) {
    toast.error("Linking required", { description: "You must link at least one collaborator Gmail to this group." });
    return;
  }

  const profiles = getPersonProfiles() as Record<string, any>;
  const allExpenses = getSharedExpenses();
  const targetExpenses = allExpenses.filter(e => e.groupId === groupId);

  // Compute the manager email — we use email as the stable cross-device identity
  const managerEmail = group.managerEmail ||
    (group.managerName === 'me' || !group.managerName
      ? myProfile.email
      : group.memberEmails?.[group.managerName] || myProfile.email);

  // Build payload for each peer email
  group.syncEmails.forEach(peerEmail => {
    // Who is this peer in MY contacts?
    let peerNameInMyList = '';
    const peerProfile = Object.values(profiles).find((p: any) => p.email?.toLowerCase() === peerEmail.toLowerCase());
    if (peerProfile) peerNameInMyList = (peerProfile as any).name;

    // Name-translation function for this specific peer:
    // 'me' → my real name, peerName in my list → 'me' for the peer
    const mapName = (name: string): string => {
      if (!name) return name;
      if (name === 'me') return myProfile.name;
      if (peerNameInMyList && name === peerNameInMyList) return 'me';
      return name;
    };

    // Members list from peer's perspective
    const groupMembersMapped = group.members.map(m => m === 'me' ? myProfile.name : m);

    // MemberEmails dictionary remapped through mapName keys
    const memberEmailsMapped: Record<string, string> = {};
    // Always include my own email
    memberEmailsMapped[myProfile.name] = myProfile.email!;
    if (group.memberEmails) {
      Object.entries(group.memberEmails).forEach(([name, memail]) => {
        const mappedKey = mapName(name);
        if (mappedKey) memberEmailsMapped[mappedKey] = memail;
      });
    }

    // syncEmails sent to peer = everyone ELSE (excluding the peer themselves)
    const syncEmailsForPeer = Array.from(new Set(
      [myProfile.email!, ...(group.syncEmails || [])].filter(e => e.toLowerCase() !== peerEmail.toLowerCase())
    ));

    const basePayload: any = {
      id: generateId(),
      fromName: myProfile.name,
      fromEmail: myProfile.email,
      groupName: group.name,
      groupMembers: groupMembersMapped,
      memberEmails: memberEmailsMapped,
      managerEmail,
      syncEmails: syncEmailsForPeer,
      type: 'added' as const,
      timestamp: new Date().toISOString()
    };

    if (targetExpenses.length === 0) {
      // Metadata-only payload
      addPeerUpdate({
        ...basePayload,
        expense: {
          id: generateId(),
          amount: 0,
          reason: 'Group Created',
          personName: myProfile.name,
          paidBy: myProfile.name,
          forPerson: myProfile.name,
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          settled: true,
          groupId: group.id
        }
      }, peerEmail);
    } else {
      targetExpenses.forEach(expense => {
        const inverseExpense: SharedExpense = {
          ...expense,
          personName: myProfile.name,
          paidBy: mapName(expense.paidBy),
          forPerson: expense.forPerson === 'all' ? 'all' : mapName(expense.forPerson),
          splitParticipants: expense.splitParticipants?.map(mapName)
        };
        addPeerUpdate({ ...basePayload, expense: inverseExpense }, peerEmail);
      });
    }
  });

  toast.success(`Broadcasting Complete!`, { description: `Sent updates to ${group.syncEmails.length} members.` });
}

export function syncExpensesWithPerson(personName: string): void {
  const profile = getPersonProfile(personName);
  const myProfile = getAccountProfile();

  if (profile?.email && !canAddCollaboratorEmail(profile.email)) {
    return;
  }

  if (!profile?.email || !myProfile.email) {
    toast.error("Linking required", { description: "Both users must have linked Gmails to sync." });
    return;
  }

  const allExpenses = getSharedExpenses();
  const targetExpenses = allExpenses.filter(e => e.personName === personName);

  if (targetExpenses.length === 0) {
    toast.info("Nothing to sync", { description: `No shared expenses found for ${personName}.` });
    return;
  }

  targetExpenses.forEach(expense => {
    // Send fresh 'added' update for each item to ensure peer has it
    const inverseExpense: SharedExpense = {
      ...expense,
      id: expense.id,
      personName: myProfile.name,
      paidBy: expense.paidBy === 'me' ? myProfile.name : 'me',
      forPerson: expense.forPerson === 'me' ? myProfile.name : 'me',
    };

    addPeerUpdate({
      id: generateId(),
      fromName: myProfile.name,
      fromEmail: myProfile.email,
      expense: inverseExpense,
      type: 'added',
      timestamp: new Date().toISOString()
    }, profile.email);
  });

  toast.success(`Sync Complete!`, { description: `Pushed ${targetExpenses.length} updates to ${profile.email}.` });
}

export function applySyncUpdate(update: any): void {
  if (!update.expense) return;

  try {
    if (update.type === 'deleted') {
      let expenses = getSharedExpenses();
      const expenseToDelete = expenses.find(e => e.id === update.expense.id);

      if (expenseToDelete && expenseToDelete.category === 'Settlement') {
        expenses.forEach(e => {
          if (e.personName === expenseToDelete.personName && e.settled) {
            e.settled = false;
          }
        });
      }

      expenses = expenses.filter(e => e.id !== update.expense.id);
      localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

      const pExpenses = getPersonalExpenses().filter(pe => pe.mirrorFromId !== update.expense.id);
      localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(pExpenses));

      window.dispatchEvent(new Event('splitmate_data_changed'));
    } else if (update.type === 'updated') {
      const expenses = getSharedExpenses();
      const expense = expenses.find(e => e.id === update.expense.id);
      if (expense) {
        expense.reason = update.reason || update.expense.reason;
        localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));

        const pExpenses = getPersonalExpenses();
        const mirror = pExpenses.find(pe => pe.mirrorFromId === update.expense.id);
        if (mirror) {
          mirror.reason = expense.reason ?? '';
          localStorage.setItem(STORAGE_KEYS.PERSONAL_EXPENSES, JSON.stringify(pExpenses));
        }

        window.dispatchEvent(new Event('splitmate_data_changed'));
      }
    } else {
      // Pass sender and group info through to auto-link profiles
      (update.expense as any).fromEmail = update.fromEmail || (update.expense as any).fromEmail;
      
      if (update.groupName) {
        (update.expense as any).groupName = update.groupName;
      }
      
      if (update.expense.category === 'Settlement') {
        const expenses = getSharedExpenses();
        const senderName = update.expense.personName || update.fromName;
        expenses.forEach(e => {
          if (e.personName === senderName && !e.settled && e.id !== update.expense.id) {
            e.settled = true;
          }
        });
        localStorage.setItem(STORAGE_KEYS.SHARED_EXPENSES, JSON.stringify(expenses));
      }

      update.expense.isIncoming = true;
      update.expense.createdByMe = false;
      saveSharedExpense(update.expense, true);
    }
  } catch (err) {
    console.error("Failed to apply cloud update on demand", err);
  }
}
