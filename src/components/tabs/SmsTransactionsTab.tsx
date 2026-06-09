import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, MessageSquare, Pencil, Send, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AccountQuickButton } from '@/components/AccountQuickButton';
import { NativeAdCard } from '@/components/NativeAdCard';
import { useToast } from '@/hooks/use-toast';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAdFree } from '@/hooks/useAdFree';
import { cn } from '@/lib/utils';
import {
  generateId,
  getAccountProfile,
  getFriendGroups,
  getPersonalExpenses,
  getSmsTransactions,
  getUniquePersonNames,
  removeSmsTransaction,
  savePersonalExpense,
  saveSharedExpense,
  getDefaultAccountId,
  getAccounts,
  type SmsTargetTab,
  type SmsTransactionCandidate,
} from '@/lib/storage';
import { useBannerAd } from '@/hooks/useBannerAd';
import { SmsTransactions } from '@/plugins/SmsTransactionPlugin';

interface SmsTransactionsTabProps {
  onOpenAccount: () => void;
  onBack?: () => void;
  bannerAdActive?: boolean;
}

const SMS_CAPTURE_ENABLED_KEY = 'splitmate_sms_capture_enabled';
const SMS_AUTO_APPROVE_KEY = 'splitmate_sms_auto_approve_enabled';
const SMS_DEMO_EMAIL = 'sandeshkullolli4@gmail.com';

type PermissionStatus = 'unknown' | 'granted' | 'denied';

type TransactionDirection = 'credit' | 'debit';
type SmsCategory = 'Food' | 'Transport' | 'Shopping' | 'Utilities' | 'Entertainment' | 'Income' | 'Cash' | 'Transfer' | 'Other';

const CREDIT_KEYWORDS = ['credited', 'received', 'credit'];
const DEBIT_KEYWORDS = ['debited', 'sent', 'debit', 'paid'];

const CATEGORY_STYLES: Record<SmsCategory, string> = {
  Food: 'bg-orange-500/10 text-orange-600 border-orange-500/15',
  Transport: 'bg-sky-500/10 text-sky-600 border-sky-500/15',
  Shopping: 'bg-pink-500/10 text-pink-600 border-pink-500/15',
  Utilities: 'bg-amber-500/10 text-amber-700 border-amber-500/15',
  Entertainment: 'bg-violet-500/10 text-violet-600 border-violet-500/15',
  Income: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/15',
  Cash: 'bg-lime-500/10 text-lime-700 border-lime-500/15',
  Transfer: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/15',
  Other: 'bg-secondary/60 text-muted-foreground border-border/20',
};

const CATEGORY_BADGE_LABELS: Record<SmsCategory, string> = {
  Food: 'Food 🍕',
  Transport: 'Transport 🚗',
  Shopping: 'Shopping 🛍️',
  Utilities: 'Utilities ⚡',
  Entertainment: 'Entertainment 🎬',
  Income: 'Income 💼',
  Cash: 'Cash 💵',
  Transfer: 'Transfer 💸',
  Other: 'Other 📋',
};

const CATEGORY_ORDER: Array<{ category: SmsCategory; keywords: RegExp }> = [
  { category: 'Food', keywords: /\b(zomato|swiggy|food)\b/i },
  { category: 'Transport', keywords: /\b(uber|ola|rapido|petrol)\b/i },
  { category: 'Shopping', keywords: /\b(amazon|flipkart|myntra)\b/i },
  { category: 'Utilities', keywords: /\b(electricity|gas|water|bill)\b/i },
  { category: 'Entertainment', keywords: /\b(netflix|spotify|prime)\b/i },
  { category: 'Income', keywords: /\b(salary|payroll)\b/i },
  { category: 'Cash', keywords: /\b(atm|cash)\b/i },
];

const SMART_LABELS: Record<string, string> = {
  zomato: 'Order 🍔',
  swiggy: 'Order 🍔',
  uber: 'Ride 🚗',
  ola: 'Ride 🚗',
  amazon: 'Purchase 📦',
  flipkart: 'Purchase 📦',
};

const MERCHANT_ICONS: Record<string, string> = {
  zomato: '🍔',
  swiggy: '🍔',
  uber: '🚗',
  ola: '🚗',
  rapido: '🛵',
  amazon: '📦',
  flipkart: '📦',
  myntra: '🛍️',
  netflix: '🎬',
  spotify: '🎵',
  paytm: '💳',
  phonepe: '💳',
  gpay: '💳',
  'google pay': '💳',
  bhim: '💳',
  cred: '💳',
};

const formatCurrencyAmount = (amount: number) => new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
}).format(amount);

const normalizeBodyForSignature = (value: string) => value
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[^a-z0-9\s]/g, '')
  .trim();

const buildSmsSignature = (item: { amount: number; sourceAddress: string; date: string; body: string }) => {
  const source = (item.sourceAddress || '').toLowerCase().replace(/\s+/g, '');
  const body = normalizeBodyForSignature(item.body || '').slice(0, 64);
  return `${Math.round(item.amount)}|${source}|${item.date}|${body}`;
};

const DEMO_SMS_TRANSACTIONS: SmsTransactionCandidate[] = [
  {
    id: 'demo-sms-1',
    externalId: 'demo-sms-1',
    sourceAddress: 'VK-HDFCBK',
    body: 'Rs.420 paid to zomato@oksbi via UPI Ref 123456',
    amount: 420,
    date: new Date().toISOString().split('T')[0],
    reason: 'Zomato order via UPI',
    name: 'HDFCBK',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-sms-2',
    externalId: 'demo-sms-2',
    sourceAddress: 'AX-ICICIB',
    body: 'Rs.850 credited from rahul@ybl via UPI Ref 888100',
    amount: 850,
    date: new Date().toISOString().split('T')[0],
    reason: 'UPI credit from Rahul',
    name: 'ICICIB',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-sms-3',
    externalId: 'demo-sms-3',
    sourceAddress: 'AD-SBIUPI',
    body: 'Paid Rs.299 to uber@paytm using UPI txn 998812',
    amount: 299,
    date: new Date().toISOString().split('T')[0],
    reason: 'Uber ride payment',
    name: 'SBIUPI',
    createdAt: new Date().toISOString(),
  },
];

const titleCase = (value: string) => value
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

const cleanCounterparty = (value: string): string => {
  const compact = value.replace(/[^a-zA-Z0-9@._&\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const token = compact.replace(/^(from|to|at|via)\s+/i, '').trim();
  if (!token) return '';

  const upiMatch = token.match(/^([a-z0-9._&-]+)@([a-z0-9._-]+)$/i);
  if (upiMatch) {
    const name = upiMatch[1]
      .replace(/[0-9]+$/, '')
      .replace(/[._-]+/g, ' ')
      .trim();

    if (!name) return '';
    return titleCase(name);
  }

  const identifier = token.replace(/\s+/g, '');
  if (/^[A-Z0-9]{6,}$/.test(identifier) && !/[a-z]/.test(identifier)) {
    return '';
  }

  const merchantLike = token.replace(/@.*$/, '').trim();
  if (merchantLike && merchantLike.length <= 2) {
    return '';
  }

  return titleCase(merchantLike.replace(/[._-]+/g, ' '));
};

const PAYMENT_APP_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Google Pay', pattern: /\b(gpay|google\s*pay|tez)\b/i },
  { label: 'PhonePe', pattern: /\b(phonepe)\b/i },
  { label: 'Paytm', pattern: /\b(paytm)\b/i },
  { label: 'BHIM UPI', pattern: /\b(bhim)\b/i },
  { label: 'Amazon Pay', pattern: /\b(amazon\s*pay|amznpay)\b/i },
  { label: 'WhatsApp Pay', pattern: /\b(whatsapp\s*pay)\b/i },
  { label: 'CRED', pattern: /\b(cred)\b/i },
  { label: 'MobiKwik', pattern: /\b(mobikwik|mobi\s*kwik)\b/i },
  { label: 'YONO', pattern: /\b(yono)\b/i },
  { label: 'Freecharge', pattern: /\b(freecharge)\b/i },
  { label: 'UPI', pattern: /\b(upi)\b/i },
  { label: 'Bank', pattern: /\b(imps|neft|rtgs|bank)\b/i },
];

const getPaymentAppLabel = (item: SmsTransactionCandidate): string => {
  const text = [item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ');
  for (const entry of PAYMENT_APP_PATTERNS) {
    if (entry.pattern.test(text)) return entry.label;
  }

  return 'SMS';
};

const getMerchantIcon = (counterparty: string, paymentApp: string): string => {
  const normalizedCounterparty = counterparty.toLowerCase();
  const matchedMerchant = Object.entries(MERCHANT_ICONS).find(([key]) => normalizedCounterparty.includes(key));
  if (matchedMerchant) return matchedMerchant[1];

  const normalizedApp = paymentApp.toLowerCase();
  const matchedApp = Object.entries(MERCHANT_ICONS).find(([key]) => normalizedApp.includes(key));
  if (matchedApp) return matchedApp[1];

  if (normalizedApp.includes('upi')) return '💸';
  if (normalizedApp.includes('bank')) return '🏦';
  return '🧾';
};

const inferDirection = (text: string): TransactionDirection => {
  const lowered = text.toLowerCase();
  const hasCredit = CREDIT_KEYWORDS.some((keyword) => lowered.includes(keyword));
  const hasDebit = DEBIT_KEYWORDS.some((keyword) => lowered.includes(keyword));

  if (hasCredit && !hasDebit) return 'credit';
  if (hasDebit && !hasCredit) return 'debit';
  if (hasCredit) return 'credit';
  return 'debit';
};

// UPI ref → name cache helpers (mirrors useSmsCapture.ts)
const SMS_UPI_REF_NAME_MAP_KEY = 'splitmate_sms_upi_ref_name_map';

const getUpiRefNameCache = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(SMS_UPI_REF_NAME_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const setUpiRefNameCache = (cache: Record<string, string>) => {
  localStorage.setItem(SMS_UPI_REF_NAME_MAP_KEY, JSON.stringify(cache));
};

const extractUpiRefFromText = (text: string): string => {
  const match = text.match(/\b(?:upi\s*ref(?:\s*no)?|upi\s*rrn|rrn|utr|ref\s*id|txn\s*id|txn\s*ref)\s*[:.#-]?\s*(\d{8,20})\b/i);
  return match?.[1] || '';
};

const rememberNameForRef = (text: string, name: string) => {
  const ref = extractUpiRefFromText(text);
  if (!ref || !name) return;
  const cache = getUpiRefNameCache();
  cache[ref] = name;
  setUpiRefNameCache(cache);
};

const lookupNameFromRef = (text: string): string => {
  const ref = extractUpiRefFromText(text);
  if (!ref) return '';
  return getUpiRefNameCache()[ref] || '';
};

// Strip common trailing junk from a captured name (e.g. "(UPI", "Ref", account placeholders)
const stripNameTrailingJunk = (raw: string): string =>
  raw
    .replace(/\s*\(\s*UPI.*$/i, '')      // remove "(UPI Ref..."
    .replace(/\s*\(\s*Ref.*$/i, '')       // remove "(Ref..."
    .replace(/\bUPI\b.*$/i, '')           // remove stray "UPI ..."
    .replace(/\s+on\s+[\d\/\-].*$/i, '') // remove " on 20/04..."
    .replace(/\s+via\b.*$/i, '')          // remove " via ..."
    .trim();

const isAccountPlaceholderStr = (s: string) => /^X{2,}[\dX]*$/i.test(s.replace(/\s/g, ''));

const extractCounterparty = (item: SmsTransactionCandidate, direction: TransactionDirection): string => {
  const text = [item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ');

  // ── Special-case labels ──────────────────────────────────────────────────
  if (/\binterest\b.*\bfixed\s*deposit\b|\bfixed\s*deposit\b.*\binterest\b/i.test(text)) return 'Monthly Interest';
  if (/\bsalary\b/i.test(text)) return 'Salary';
  if (/\brefund\b/i.test(text)) return 'Refund';
  if (/\bcashback\b/i.test(text)) return 'Cashback';

  // ── VPA handle (name@bank) ───────────────────────────────────────────────
  const upiHandle = text.match(/\b([a-z0-9._&-]{3,})@([a-z0-9._-]{2,})\b/i);
  if (upiHandle?.[1]) {
    const merchant = cleanCounterparty(upiHandle[1]);
    if (merchant && !/^(upi|ref|txn|pay|payment|https?)$/i.test(merchant)) return merchant;
  }

  if (direction === 'debit') {
    // ── "to NAME (UPI Ref" — Slice format ───────────────────────────────────
    const toUpiRef = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s*\(\s*UPI\s*Ref/i);
    if (toUpiRef?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(toUpiRef[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "to NAME on DATE" — Kotak / generic format ───────────────────────────
    const toOn = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d\/\-]/i);
    if (toOn?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(toOn[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "sent/paid/debited to NAME via/ref/on" — generic ────────────────────
    const sentTo = text.match(/(?:sent|paid|debited?|transferred)\s+(?:to|at)\s+([^,.(\n]+?)(?=\s+(?:on|via|using|through|ref|utr|txn|transaction|avl|bal|\())/i);
    if (sentTo?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(sentTo[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "to NAME via" ────────────────────────────────────────────────────────
    const toVia = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s+via\b/i);
    if (toVia?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(toVia[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "to credit a/c" — KGB style, no person name ─────────────────────────
    if (/to\s+credit\s+a\/c/i.test(text)) return 'Account Transfer';
  }

  if (direction === 'credit') {
    // ── "from NAME via UPI" — Slice received format ──────────────────────────
    const fromVia = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]{1,60})\s+via\b/i);
    if (fromVia?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(fromVia[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "from NAME on DATE" ──────────────────────────────────────────────────
    const fromOn = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d\/\-]/i);
    if (fromOn?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(fromOn[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── "credited by NAME on DATE" ────────────────────────────────────────────
    const creditedBy = text.match(/\bcredited\s+by\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d\/\-]/i);
    if (creditedBy?.[1]) {
      const name = cleanCounterparty(stripNameTrailingJunk(creditedBy[1]));
      if (name && !isAccountPlaceholderStr(name)) return name;
    }

    // ── UPI ref cache lookup (e.g. KGB credit with no sender name) ───────────
    const cachedName = lookupNameFromRef(text);
    if (cachedName) return cachedName;
  }

  // ── Fallback: use source address if it looks like a person/merchant ───────
  const senderLike = cleanCounterparty(item.name || '');
  const senderCodeLike = (item.name || '').replace(/[^A-Za-z]/g, '');
  if (
    senderLike
    && !/^(sms|alert|bank|transaction)$/i.test(senderLike)
    && !(senderCodeLike && /^[A-Z]{5,}$/.test(senderCodeLike))
  ) {
    return senderLike;
  }

  if (/\b(neft|imps|rtgs)\b/i.test(text)) return 'Bank Transfer';

  return 'Unknown';
};

const getTransactionCategory = (item: SmsTransactionCandidate, counterparty: string): SmsCategory => {
  const text = [item.body, item.reason, item.name, item.sourceAddress, counterparty].filter(Boolean).join(' ');
  for (const entry of CATEGORY_ORDER) {
    if (entry.keywords.test(text)) return entry.category;
  }

  if (counterparty !== 'Unknown' && counterparty !== 'Bank Transfer') {
    return 'Transfer';
  }

  return 'Other';
};

const getTransactionTitle = (item: SmsTransactionCandidate) => {
  const text = [item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ');
  const direction = inferDirection(text);
  const counterparty = extractCounterparty(item, direction);

  // Remember the resolved name for UPI ref-based lookup across SMS
  // Don't cache generic fallback labels
  const SKIP_CACHE = ['Unknown', 'Bank Transfer', 'Account Transfer', 'Bank Transaction', 'Monthly Interest', 'Salary', 'Refund', 'Cashback'];
  if (!SKIP_CACHE.includes(counterparty)) {
    rememberNameForRef(text, counterparty);
  }

  if (counterparty === 'Unknown') return 'Bank Transaction';
  if (counterparty === 'Bank Transfer') return 'Bank Transfer';
  if (counterparty === 'Account Transfer') return 'Account Transfer';
  // Special labels that stand alone
  if (['Monthly Interest', 'Salary', 'Refund', 'Cashback'].includes(counterparty)) return counterparty;

  const counterpartyKey = counterparty.toLowerCase();
  const smartEntry = Object.entries(SMART_LABELS).find(([key]) => counterpartyKey.includes(key));
  if (smartEntry) {
    return direction === 'credit'
      ? `From ${counterparty}`
      : `${counterparty} ${smartEntry[1]}`;
  }

  return direction === 'credit' ? `From ${counterparty}` : `To ${counterparty}`;
};

const getEditableTransactionName = (item: SmsTransactionCandidate) => {
  const title = getTransactionTitle(item);
  return title.replace(/^(From|To)\s+/i, '');
};

const getTransactionDisplayMeta = (item: SmsTransactionCandidate) => {
  const text = [item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ');
  const direction = inferDirection(text);
  const counterparty = extractCounterparty(item, direction);
  const category = getTransactionCategory(item, counterparty);
  const paymentApp = getPaymentAppLabel(item);
  const merchantIcon = getMerchantIcon(counterparty, paymentApp);
  const amountPrefix = direction === 'credit' ? '+' : '-';
  const amountClassName = direction === 'credit' ? 'text-green-500' : 'text-red-500';

  return {
    title: getTransactionTitle(item),
    category,
    categoryLabel: CATEGORY_BADGE_LABELS[category],
    categoryClassName: CATEGORY_STYLES[category],
    paymentApp,
    merchantIcon,
    amountLabel: `${amountPrefix}₹${formatCurrencyAmount(Math.abs(item.amount))}`,
    amountClassName,
    direction,
    counterparty,
  };
};

const getAutoApprovedPersonalExpense = (item: SmsTransactionCandidate) => {
  const text = [item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ');
  const direction = inferDirection(text);
  const counterparty = extractCounterparty(item, direction);
  const category = direction === 'credit' ? 'Income' : getTransactionCategory(item, counterparty);

  return {
    reason: getTransactionTitle(item),
    category,
    isIncome: direction === 'credit',
  };
};

const isDuplicateAutoApprovedPersonal = (
  item: SmsTransactionCandidate & { timestamp: number },
  approved: ReturnType<typeof getAutoApprovedPersonalExpense>,
): boolean => {
  const existingPersonal = getPersonalExpenses();

  return existingPersonal.some((expense) => {
    if (expense.source !== 'sms') return false;

    if (expense.smsExternalId && expense.smsExternalId === item.externalId) {
      return true;
    }

    const expenseTime = new Date(expense.createdAt || expense.date).getTime();
    if (!Number.isFinite(expenseTime)) return false;

    const closeInTime = Math.abs(expenseTime - item.timestamp) <= 60_000;
    const sameAmount = Math.abs(expense.amount - item.amount) < 0.01;
    const sameDirection = Boolean(expense.isIncome) === approved.isIncome;
    const sameReason = (expense.reason || '').trim().toLowerCase() === approved.reason.trim().toLowerCase();

    return closeInTime && sameAmount && sameDirection && sameReason;
  });
};

const parseLocalDate = (dateValue: string) => {
  const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatTransactionDate = (dateValue: string) => {
  const date = parseLocalDate(dateValue);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfTransaction = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfTransaction.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfTransaction.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export function SmsTransactionsTab({ onOpenAccount, onBack, bannerAdActive = true }: SmsTransactionsTabProps) {
  useBannerAd(bannerAdActive);
  const { isAdFree } = useAdFree();
  const { toast } = useToast();

  const [items, setItems] = useState<SmsTransactionCandidate[]>(getSmsTransactions());
  const [editing, setEditing] = useState<SmsTransactionCandidate | null>(null);
  const [smsCaptureEnabled, setSmsCaptureEnabled] = useState(() => {
    const storedValue = localStorage.getItem(SMS_CAPTURE_ENABLED_KEY);
    return storedValue === null ? true : storedValue === 'true';
  });
  const [smsAutoApproveEnabled, setSmsAutoApproveEnabled] = useState(() => {
    const storedValue = localStorage.getItem(SMS_AUTO_APPROVE_KEY);
    return storedValue === null ? true : storedValue === 'true';
  });
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [targetTab, setTargetTab] = useState<SmsTargetTab>('personal');
  const [targetPersonName, setTargetPersonName] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftDirection, setDraftDirection] = useState<TransactionDirection>('debit');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [dismissedDemoIds, setDismissedDemoIds] = useState<string[]>([]);

  const accountEmail = (getAccountProfile().email || '').trim().toLowerCase();
  const showDemoTransactions = accountEmail === SMS_DEMO_EMAIL;

  const visibleItems = useMemo(() => {
    if (!showDemoTransactions) return items;

    const demo = DEMO_SMS_TRANSACTIONS.filter((item) => !dismissedDemoIds.includes(item.id));
    return [...demo, ...items];
  }, [dismissedDemoIds, items, showDemoTransactions]);

  const groups = useMemo(() => getFriendGroups(), [items.length]);
  const persons = useMemo(() => getUniquePersonNames().filter((name) => name !== 'me'), [items.length]);
  useBackHandler(!!editing, () => setEditing(null));
  useBackHandler(showDisclosure, () => setShowDisclosure(false));

  const refresh = () => setItems(getSmsTransactions());

  const normalizeSmsReason = (body: string): string => {
    const compact = body.replace(/\s+/g, ' ').trim();
    if (!compact) return 'SMS Transaction';
    return compact.length > 60 ? `${compact.slice(0, 60)}...` : compact;
  };

  const normalizeSmsName = (address: string): string => {
    const cleaned = address.replace(/[^a-zA-Z0-9]/g, '').trim();
    if (!cleaned) return 'SMS';
    return cleaned.length > 24 ? cleaned.slice(0, 24) : cleaned;
  };

  useEffect(() => {
    const sync = () => refresh();
    const handleOpenTransaction = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string; transactionId?: string }>).detail;
      if (!detail || detail.tabId !== 'sms-transactions' || !detail.transactionId) return;
      const target = getSmsTransactions().find((item) => item.id === detail.transactionId);
      if (!target) return;
      openEditor(target);
    };

    const syncPermissionState = async () => {
      if (!Capacitor.isNativePlatform()) {
        setPermissionStatus('denied');
        return;
      }

      try {
        const status = await SmsTransactions.checkSmsPermissions();
        setPermissionStatus(status.granted ? 'granted' : 'denied');
      } catch {
        setPermissionStatus('denied');
      }
    };

    window.addEventListener('splitmate_sms_transactions_changed', sync);
    window.addEventListener('splitmate_open_transaction', handleOpenTransaction);
    void syncPermissionState();

    return () => {
      window.removeEventListener('splitmate_sms_transactions_changed', sync);
      window.removeEventListener('splitmate_open_transaction', handleOpenTransaction);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SMS_CAPTURE_ENABLED_KEY, String(smsCaptureEnabled));
    window.dispatchEvent(new Event('splitmate_sms_capture_changed'));

    if (!smsCaptureEnabled) {
      window.dispatchEvent(new Event('splitmate_sms_capture_disabled'));
    }
  }, [smsCaptureEnabled]);

  useEffect(() => {
    localStorage.setItem(SMS_AUTO_APPROVE_KEY, String(smsAutoApproveEnabled));
    window.dispatchEvent(new Event('splitmate_sms_auto_approve_changed'));
  }, [smsAutoApproveEnabled]);

  const requestPermissionAndEnable = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: 'SMS capture unavailable',
        description: 'SMS permissions are only available on Android native builds.',
        variant: 'destructive',
      });
      setShowDisclosure(false);
      return;
    }

    try {
      const result = await SmsTransactions.requestSmsPermissions();
      if (!result.granted) {
        setPermissionStatus('denied');
        toast({
          title: 'Permission not granted',
          description: 'Enable SMS permission in system settings to use auto capture.',
          variant: 'destructive',
        });
        return;
      }

      setPermissionStatus('granted');
      setSmsCaptureEnabled(true);
      window.dispatchEvent(new Event('splitmate_sms_permission_granted'));
      toast({
        title: 'SMS capture enabled',
        description: 'Only financial transaction SMS are processed and stored as minimal records on this device.',
      });
    } catch {
      setPermissionStatus('denied');
      toast({
        title: 'SMS permission failed',
        description: 'Could not enable SMS permission right now.',
        variant: 'destructive',
      });
    } finally {
      setShowDisclosure(false);
    }
  };

  const handleSmsCaptureToggle = () => {
    if (smsCaptureEnabled) {
      setSmsCaptureEnabled(false);
      return;
    }

    if (permissionStatus === 'granted') {
      setSmsCaptureEnabled(true);
      window.dispatchEvent(new Event('splitmate_sms_permission_granted'));
      return;
    }

    setShowDisclosure(true);
  };

  const openEditor = (item: SmsTransactionCandidate) => {
    setEditing(item);
    setDraftReason(item.reason);
    setDraftName(getEditableTransactionName(item));
    setDraftDirection(inferDirection([item.body, item.reason, item.name, item.sourceAddress].filter(Boolean).join(' ')));
    setDraftAmount(String(item.amount));
    setDraftDate(item.date);
    setTargetTab(item.targetTab || 'personal');
    setTargetPersonName(item.targetPersonName || persons[0] || '');
    setTargetGroupId(item.targetGroupId || groups[0]?.id || '');
  };

  const discardItem = () => {
    if (!editing) return;

    if (editing.id.startsWith('demo-sms-')) {
      setDismissedDemoIds((prev) => (prev.includes(editing.id) ? prev : [...prev, editing.id]));
      setEditing(null);
      return;
    }

    removeSmsTransaction(editing.id);
    setEditing(null);
    refresh();
  };

  const approveItem = () => {
    if (!editing) return;

    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter a valid amount before approving.',
        variant: 'destructive',
      });
      return;
    }

    const finalReason = draftReason.trim() || draftName.trim() || 'SMS Transaction';
    const finalDate = draftDate || new Date().toISOString().split('T')[0];

    if (targetTab === 'personal') {
      savePersonalExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        date: finalDate,
        createdAt: new Date().toISOString(),
        isIncome: draftDirection === 'credit',
        source: 'sms',
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (targetTab === 'split') {
      if (!targetPersonName) {
        toast({
          title: 'Choose person',
          description: 'Select an existing person to move this transaction.',
          variant: 'destructive',
        });
        return;
      }

      saveSharedExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        paidBy: 'me',
        forPerson: targetPersonName,
        personName: targetPersonName,
        date: finalDate,
        createdAt: new Date().toISOString(),
        settled: false,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (targetTab === 'group') {
      const group = groups.find((item) => item.id === targetGroupId);
      if (!group) {
        toast({
          title: 'Choose group',
          description: 'Select an existing group to move this transaction.',
          variant: 'destructive',
        });
        return;
      }

      saveSharedExpense({
        id: generateId(),
        amount,
        reason: finalReason,
        paidBy: 'me',
        forPerson: 'all',
        personName: group.members.find((member) => member !== 'me') || group.name,
        date: finalDate,
        createdAt: new Date().toISOString(),
        settled: false,
        category: draftDirection === 'credit' ? 'Income' : 'Other',
        groupId: group.id,
        splitParticipants: group.members,
        accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
      });
    }

    if (editing.id.startsWith('demo-sms-')) {
      setDismissedDemoIds((prev) => (prev.includes(editing.id) ? prev : [...prev, editing.id]));
    } else {
      removeSmsTransaction(editing.id);
    }

    setEditing(null);
    refresh();
    toast({ title: 'Moved', description: 'SMS transaction was moved successfully.' });
  };

  return (
    <div className="p-4 pb-40 space-y-5 font-sans">
      <div className="pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl flex items-center justify-center mt-1 bg-secondary/80 border border-border/10 active:scale-95 transition-all shadow-sm"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight leading-none">SMS Transactions</h1>
            <p className="text-[13px] text-muted-foreground font-medium opacity-80 max-w-[300px] leading-tight">
              Auto-added SMS debits appear here. Review and move each one manually.
            </p>
          </div>
        </div>
        {!onBack && <AccountQuickButton onClick={onOpenAccount} />}
      </div>

      <div className="ios-card-modern p-3.5 space-y-4">
        {/* SMS Capture Row */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-3.5">
            <MessageSquare size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                SMS capture
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-medium leading-tight">
                {smsCaptureEnabled
                  ? 'On now. Only financial SMS are parsed on-device and queued in SMS Transactions.'
                  : 'Off now. Turn on to explicitly grant permission and capture financial SMS.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={smsCaptureEnabled}
            onClick={handleSmsCaptureToggle}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition-all duration-200',
              smsCaptureEnabled
                ? 'border-white/25 bg-white/20'
                : 'border-border/15 bg-background/70',
            )}
          >
            <span
              className={cn(
                'relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform duration-200',
                smsCaptureEnabled
                  ? 'translate-x-5 bg-white'
                  : 'translate-x-0 bg-muted-foreground/70',
              )}
            />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border/5 my-1" />

        {/* Auto Approve Row */}
        <div className={cn(
          'flex items-center justify-between gap-2.5 transition-all duration-200',
          !smsCaptureEnabled && 'opacity-50'
        )}>
          <div className="flex min-w-0 items-center gap-3.5">
            <Check size={20} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                Auto approve transactions
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-medium leading-tight">
                {smsCaptureEnabled
                  ? 'Send captured SMS entries straight to Personal. Credits are counted as income.'
                  : 'Enable SMS capture first to use auto approval.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={smsAutoApproveEnabled}
            disabled={!smsCaptureEnabled}
            onClick={() => {
              if (!smsCaptureEnabled) return;
              setSmsAutoApproveEnabled((value) => !value);
            }}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition-all duration-200',
              !smsCaptureEnabled
                ? 'cursor-not-allowed border-border/10 bg-background/40'
                : smsAutoApproveEnabled
                  ? 'border-white/25 bg-white/20'
                  : 'border-border/15 bg-background/70',
            )}
          >
            <span
              className={cn(
                'relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform duration-200',
                smsAutoApproveEnabled
                  ? 'translate-x-5 bg-white'
                  : 'translate-x-0 bg-muted-foreground/70',
              )}
            />
          </button>
        </div>
      </div>

      {!smsCaptureEnabled && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Prominent Disclosure</p>
          <p className="text-xs text-foreground font-medium leading-relaxed">
            SplitMate requests READ_SMS only to detect financial transaction SMS (for example bank debit/credit and UPI alerts) and queue them in SMS Transactions for your manual review.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We process messages on-device, keep minimal derived details (amount, date, sender, short masked snippet), and do not use non-financial SMS.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-primary" />
            Pending Transactions
          </h3>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            {visibleItems.length} pending
          </span>
        </div>

        {visibleItems.length === 0 ? (
          <div className="space-y-1 py-2">
            <p className="text-sm font-medium text-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground">We&apos;ll automatically detect your SMS payments here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item, idx) => {
              const meta = getTransactionDisplayMeta(item);

              return (
                <div key={item.id} className="flex flex-col gap-2">
                  <div className="relative overflow-hidden rounded-2xl bg-card px-3 py-2.5 shadow-sm transition-all duration-200">
                    <div className="relative flex items-start gap-2.5">
                      <div className={cn(
                        'self-center flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                        meta.direction === 'credit'
                          ? 'border-emerald-500/10 bg-emerald-500/5 text-emerald-500'
                          : 'border-rose-500/10 bg-rose-500/5 text-rose-500',
                      )}>
                        {meta.direction === 'credit' ? <Send size={14} strokeWidth={2.2} className="rotate-180" /> : <Send size={14} strokeWidth={2.2} />}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-1.5">
                            <span className="text-sm leading-none" aria-hidden="true">{meta.merchantIcon}</span>
                            <p className="text-[15px] font-medium text-foreground truncate">
                              {meta.title}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="inline-flex items-center rounded-full border border-border/10 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                            {meta.paymentApp}
                          </span>
                        </div>
                      </div>

                      <div className="relative flex shrink-0 flex-col items-end gap-1 pt-0.5">
                        <span className={cn('text-[15px] font-semibold tracking-tight tabular-nums', meta.amountClassName)}>
                          {meta.amountLabel}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {formatTransactionDate(item.date)}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditor(item)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-border/20 bg-transparent text-foreground/70 opacity-70 transition-opacity hover:opacity-100"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {!isAdFree && idx % 5 === 0 && (
                    <div className="pt-1">
                      <NativeAdCard />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && createPortal(
        <div className="fixed inset-0 z-[10003] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 pb-8 space-y-4 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight">Edit SMS Transaction</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Name</label>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Amount</label>
                <input type="number" value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Date</label>
                <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Reason</label>
              <input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'debit', label: 'Debit', tone: 'rose' },
                  { id: 'credit', label: 'Credit', tone: 'emerald' },
                ] as Array<{ id: TransactionDirection; label: string; tone: 'rose' | 'emerald' }>).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraftDirection(option.id)}
                    className={cn(
                      'h-11 rounded-2xl border text-[10px] font-black uppercase tracking-wider transition-all',
                      draftDirection === option.id
                        ? option.tone === 'emerald'
                          ? 'bg-emerald-500/12 text-emerald-600 border-emerald-500/25 shadow-sm'
                          : 'bg-rose-500/12 text-rose-500 border-rose-500/25 shadow-sm'
                        : 'bg-secondary/20 border-border/10 text-muted-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Move To</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'personal', label: 'Personal' },
                  { id: 'split', label: 'Split' },
                  { id: 'group', label: 'Group' },
                ] as Array<{ id: SmsTargetTab; label: string }>).map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setTargetTab(target.id)}
                    className={cn(
                      'h-10 rounded-xl border text-[10px] font-black uppercase tracking-wider',
                      targetTab === target.id ? 'bg-primary/15 text-primary border-primary/30' : 'bg-secondary/20 border-border/10 text-muted-foreground',
                    )}
                  >
                    {target.label}
                  </button>
                ))}
              </div>
            </div>

            {targetTab === 'split' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">For Person</label>
                <div className="max-h-48 overflow-y-auto rounded-3xl border border-border/15 bg-secondary/20 p-2 space-y-2">
                  {persons.length === 0 ? (
                    <div className="px-4 py-5 text-sm text-muted-foreground text-center">
                      No people available
                    </div>
                  ) : (
                    persons.map((name) => {
                      const selected = targetPersonName === name;
                      const initial = name.trim().charAt(0).toUpperCase() || '?';

                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setTargetPersonName(name)}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.99]',
                            selected
                              ? 'border-primary/30 bg-primary/10 shadow-sm'
                              : 'border-transparent bg-background/40 hover:bg-background/60',
                          )}
                        >
                          <span className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black',
                            selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                          )}>
                            {initial}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                            <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              {selected ? 'Selected' : 'Tap to choose'}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {targetTab === 'group' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">For Group</label>
                <select
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-secondary/30 border border-border/15 px-4 text-sm font-semibold"
                >
                  <option value="">Select group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={discardItem}
                className="h-11 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-[10px] font-black uppercase tracking-wider"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={approveItem}
                className="h-11 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider inline-flex items-center justify-center gap-2"
              >
                <Check size={14} />
                Approve
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showDisclosure && createPortal(
        <div className="fixed inset-0 z-[10004] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDisclosure(false)}>
          <div
            className="w-full max-w-md bg-card rounded-2xl p-6 pb-8 space-y-4 animate-in slide-in-from-bottom-10 border border-border/10 duration-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold tracking-tight">Enable SMS Capture</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                SplitMate needs SMS permission to detect financial transaction alerts and place them in SMS Transactions for review.
              </p>
              <p>
                Stored location: local app storage on this device. Stored fields: amount, date, sender, and a short masked message snippet.
              </p>
              <p>
                We only process bank/payment transaction SMS and ignore unrelated messages.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowDisclosure(false)}
                className="h-11 rounded-2xl bg-secondary/60 border border-border/20 text-[10px] font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={requestPermissionAndEnable}
                className="h-11 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-wider"
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
