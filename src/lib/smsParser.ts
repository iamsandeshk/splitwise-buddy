export type TransactionDirection = 'credit' | 'debit';
export type SmsCategory = 'Food' | 'Transport' | 'Shopping' | 'Utilities' | 'Entertainment' | 'Income' | 'Cash' | 'Transfer' | 'Other';

const CREDIT_KEYWORDS = ['credited', 'received', 'credit', 'deposited', 'deposit', 'added', 'refund', 'refunded', 'cashback', 'salary'];
const DEBIT_KEYWORDS = ['debited', 'sent', 'debit', 'paid', 'payment', 'spent', 'withdrawn', 'withdrew', 'deducted', 'purchase', 'bought', 'txn', 'transaction'];

const SMART_LABELS: Record<string, string> = {
  zomato: 'Order 🍔',
  swiggy: 'Order 🍔',
  uber: 'Ride 🚗',
  ola: 'Ride 🚗',
  rapido: 'Ride 🛵',
  amazon: 'Purchase 📦',
  flipkart: 'Purchase 📦',
  myntra: 'Shopping 🛍️',
  nykaa: 'Shopping 🛍️',
  blinkit: 'Order 📦',
  zepto: 'Order 📦',
  netflix: 'Subscription 🎬',
  spotify: 'Subscription 🎵',
  starbucks: 'Coffee ☕',
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
  nykaa: '🛍️',
  blinkit: '📦',
  zepto: '📦',
  netflix: '🎬',
  spotify: '🎵',
  paytm: '💳',
  phonepe: '💳',
  gpay: '💳',
  bhim: '💳',
  cred: '💳',
  starbucks: '☕',
};

export const extractAmount = (text: string): number => {
  // Regex to match Rs., INR, ₹, USD, EUR, $, etc. followed by numbers with optional commas and decimals
  const m = text.match(/(?:Rs\.?\s*|INR\s*|₹\s*|USD\s*|EUR\s*|\$\s*|£\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) {
    // Fallback: match number followed by Rs / INR / ₹
    const mFallback = text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?\s*|INR\s*|₹\s*)/i);
    if (!mFallback) return 0;
    return parseFloat(mFallback[1].replace(/,/g, ''));
  }
  return parseFloat(m[1].replace(/,/g, ''));
};

export const inferDirection = (text: string): TransactionDirection => {
  const lower = text.toLowerCase();
  const hasDebit = DEBIT_KEYWORDS.some((kw) => lower.includes(kw));
  const hasCredit = CREDIT_KEYWORDS.some((kw) => lower.includes(kw));

  // "debited to credit a/c" is debit
  if (hasDebit && /to\s+credit\s+a\/c/i.test(text)) return 'debit';
  if (hasDebit && !hasCredit) return 'debit';
  if (hasCredit && !hasDebit) return 'credit';
  if (hasDebit) return 'debit';
  return 'credit';
};

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

const stripNameTrailingJunk = (raw: string): string =>
  raw
    .replace(/\s*\(\s*UPI.*$/i, '')
    .replace(/\s*\(\s*Ref.*$/i, '')
    .replace(/\bUPI\b.*$/i, '')
    .replace(/\s+on\s+[\d/-].*$/i, '')
    .replace(/\s+via\b.*$/i, '')
    .trim();

const isAccountPlaceholder = (s: string) => /^X{2,}[\dX]*$/i.test(s.replace(/\s/g, ''));

const cleanCounterparty = (value: string): string => {
  const compact = value.replace(/[^a-zA-Z0-9@._&\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!compact || compact.length < 2) return '';

  const token = compact.replace(/^(from|to|at|via|for|with)\s+/i, '').trim();
  if (!token) return '';

  const upiMatch = token.match(/^([a-z0-9._&-]+)@([a-z0-9._-]+)$/i);
  if (upiMatch) {
    const name = upiMatch[1]
      .replace(/[0-9]+$/, '')
      .replace(/[._-]+/g, ' ')
      .trim();

    if (!name || /^(upi|ref|txn|pay|payment)$/i.test(name)) return '';
    return titleCase(name);
  }

  if (isAccountPlaceholder(token)) return '';
  if (/^\d+$/.test(token)) return '';
  if (/^(credit\s+a\/c|your\s+a\/c|the\s+|account\s+|card\s+)/i.test(token)) return '';
  if (/^(upi|ref|txn|pay|payment|bank|cash|atm)$/i.test(token.toLowerCase())) return '';

  return titleCase(token);
};

export const extractCounterparty = (
  body: string,
  direction: TransactionDirection,
  sourceAddress?: string,
  name?: string
): string => {
  const text = [body, sourceAddress, name].filter(Boolean).join(' ');

  // ── Special-case labels ──────────────────────────────────────────────────
  if (/\binterest\b.*\bfixed\s*deposit\b|\bfixed\s*deposit\b.*\binterest\b/i.test(text)) return 'Monthly Interest';
  if (/\bsalary\b/i.test(text)) return 'Salary';
  if (/\brefund\b/i.test(text)) return 'Refund';
  if (/\bcashback\b/i.test(text)) return 'Cashback';
  if (/\b(atm|cash\s*withdrawal|withdrawn\s*cash)\b/i.test(text)) return 'ATM Cash Withdrawal';

  // ── VPA handle (name@bank) ───────────────────────────────────────────────
  const upiHandle = text.match(/\b([a-z0-9._&-]{3,})@([a-z0-9._-]{2,})\b/i);
  if (upiHandle?.[1]) {
    const merchant = cleanCounterparty(upiHandle[0]);
    if (merchant) return merchant;
  }

  if (direction === 'debit') {
    // ── "to NAME (UPI Ref" — Slice format ───────────────────────────────────
    const toUpiRef = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s*\(\s*UPI\s*Ref/i);
    if (toUpiRef?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(toUpiRef[1]));
      if (parsed) return parsed;
    }

    // ── "to NAME on DATE" — Kotak / generic format ───────────────────────────
    const toOn = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d/-]/i);
    if (toOn?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(toOn[1]));
      if (parsed) return parsed;
    }

    // ── "sent/paid/debited to NAME via/ref/on/at" — generic ────────────────────
    const sentTo = text.match(/(?:sent|paid|debited?|transferred|transfer)\s+(?:to|at|for)\s+([^,.(\n]+?)(?=\s+(?:on|via|using|through|ref|utr|txn|transaction|avl|bal|with|\()|$)/i);
    if (sentTo?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(sentTo[1]));
      if (parsed) return parsed;
    }

    // ── "to NAME via" ────────────────────────────────────────────────────────
    const toVia = text.match(/\bto\s+([A-Za-z][A-Za-z\s.]{1,60})\s+via\b/i);
    if (toVia?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(toVia[1]));
      if (parsed) return parsed;
    }

    // ── "at NAME" / "spent at NAME" / "purchase at NAME" ──────────────────────
    const atMerchant = text.match(/(?:spent\s+at|purchase\s+at|txn\s+at|at)\s+([^,.(\n]+?)(?=\s+(?:on|via|using|through|ref|utr|txn|transaction|avl|bal|with|\()|$)/i);
    if (atMerchant?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(atMerchant[1]));
      if (parsed) return parsed;
    }

    if (/to\s+credit\s+a\/c/i.test(text)) return 'Account Transfer';
  }

  if (direction === 'credit') {
    // ── "from NAME via UPI" — Slice received format ──────────────────────────
    const fromVia = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]{1,60})\s+via\b/i);
    if (fromVia?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(fromVia[1]));
      if (parsed) return parsed;
    }

    // ── "from NAME on DATE" ──────────────────────────────────────────────────
    const fromOn = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d/-]/i);
    if (fromOn?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(fromOn[1]));
      if (parsed) return parsed;
    }

    // ── "credited by NAME on DATE" ────────────────────────────────────────────
    const creditedBy = text.match(/\bcredited\s+by\s+([A-Za-z][A-Za-z\s.]{1,60})\s+on\s+[\d/-]/i);
    if (creditedBy?.[1]) {
      const parsed = cleanCounterparty(stripNameTrailingJunk(creditedBy[1]));
      if (parsed) return parsed;
    }
  }

  // ── Fallback 1: use clean name if provided ───────────────────
  if (name) {
    const parsed = cleanCounterparty(name);
    if (parsed) return parsed;
  }

  // ── Fallback 2: parse sender address if it looks like a person/merchant ───
  if (sourceAddress) {
    const cleanedAddr = sourceAddress.replace(/[^A-Za-z]/g, '');
    if (cleanedAddr.length > 3 && !/^(sms|alert|bank|txn|msg)$/i.test(cleanedAddr)) {
      const parsed = cleanCounterparty(sourceAddress);
      if (parsed) return parsed;
    }
  }

  if (/\b(neft|imps|rtgs)\b/i.test(text)) return 'Bank Transfer';

  return 'Unknown Merchant';
};

export const getTransactionTitle = (
  body: string,
  direction: TransactionDirection,
  counterparty: string
): string => {
  if (counterparty === 'Unknown Merchant') return 'Bank Transaction';
  if (counterparty === 'Bank Transfer') return 'Bank Transfer';
  if (counterparty === 'Account Transfer') return 'Account Transfer';
  if (['Monthly Interest', 'Salary', 'Refund', 'Cashback', 'ATM Cash Withdrawal'].includes(counterparty)) return counterparty;

  const counterpartyKey = counterparty.toLowerCase();
  const smartEntry = Object.entries(SMART_LABELS).find(([key]) => counterpartyKey.includes(key));
  if (smartEntry) {
    return direction === 'credit'
      ? `From ${counterparty}`
      : `${counterparty} ${smartEntry[1]}`;
  }

  return direction === 'credit' ? `From ${counterparty}` : `To ${counterparty}`;
};

export const PAYMENT_APP_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
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

export const getPaymentAppLabel = (
  body: string,
  reason?: string,
  name?: string,
  sourceAddress?: string
): string => {
  const text = [body, reason, name, sourceAddress].filter(Boolean).join(' ');
  for (const entry of PAYMENT_APP_PATTERNS) {
    if (entry.pattern.test(text)) return entry.label;
  }
  return 'SMS';
};

export const getMerchantIcon = (counterparty: string, paymentApp: string): string => {
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

const CATEGORY_ORDER: Array<{ category: SmsCategory; keywords: RegExp }> = [
  { category: 'Food', keywords: /\b(zomato|swiggy|food|restaurant|cafe|dining|pizza|burger|chai|coffee|starbucks)\b/i },
  { category: 'Transport', keywords: /\b(uber|ola|rapido|petrol|metro|bmtc|fuel|railway|irctc|cab|taxi|auto)\b/i },
  { category: 'Shopping', keywords: /\b(amazon|flipkart|myntra|nykaa|shopping|purchase|store|groceries|mart|blinkit|zepto)\b/i },
  { category: 'Utilities', keywords: /\b(electricity|gas|water|bill|recharge|wifi|broadband|mobile|dth)\b/i },
  { category: 'Entertainment', keywords: /\b(netflix|spotify|prime|bookmyshow|movie|cinema|show|theatre)\b/i },
  { category: 'Income', keywords: /\b(salary|payroll|interest|dividend|cashback|refund)\b/i },
  { category: 'Cash', keywords: /\b(atm|cash|withdrawal)\b/i },
];

export const getTransactionCategory = (
  body: string,
  counterparty: string,
  reason?: string,
  name?: string,
  sourceAddress?: string
): SmsCategory => {
  const text = [body, counterparty, reason, name, sourceAddress].filter(Boolean).join(' ');
  for (const entry of CATEGORY_ORDER) {
    if (entry.keywords.test(text)) return entry.category;
  }

  if (counterparty !== 'Unknown Merchant' && counterparty !== 'Bank Transfer') {
    return 'Transfer';
  }

  return 'Other';
};
