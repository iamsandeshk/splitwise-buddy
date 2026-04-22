import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  generateId,
  getPersonalExpenses,
  getSmsTransactions,
  savePersonalExpense,
  upsertSmsTransactions,
  type SmsTransactionCandidate,
} from '@/lib/storage';
import { SmsTransactions } from '@/plugins/SmsTransactionPlugin';

const SMS_CAPTURE_ENABLED_KEY = 'splitmate_sms_capture_enabled';
const SMS_AUTO_APPROVE_KEY = 'splitmate_sms_auto_approve_enabled';
const SMS_LAST_FETCH_TIME_KEY = 'splitmate_sms_last_fetch_time';
const SMS_INITIAL_HISTORY_IMPORTED_KEY = 'splitmate_sms_initial_history_imported';

type PermissionStatus = 'unknown' | 'granted' | 'denied';
type TransactionDirection = 'credit' | 'debit';

// ─── Smart labels for known merchants ────────────────────────────────────────

const SMART_LABELS: Record<string, string> = {
  zomato: 'Order',
  swiggy: 'Order',
  uber: 'Ride',
  ola: 'Ride',
  rapido: 'Ride',
  amazon: 'Purchase',
  flipkart: 'Purchase',
  myntra: 'Purchase',
  nykaa: 'Purchase',
  blinkit: 'Order',
  zepto: 'Order',
  dunzo: 'Order',
  makemytrip: 'Booking',
  irctc: 'Booking',
  bookmyshow: 'Booking',
  'bangalore metro': 'Ride',
  bmtc: 'Bus',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const readStoredBoolean = (key: string, defaultValue: boolean) => {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  return value === 'true';
};

const normalizeBodyForSignature = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\s]/g, '').trim();

const buildSmsSignature = (item: {
  amount: number;
  sourceAddress: string;
  date: string;
  body: string;
}) => {
  const source = (item.sourceAddress || '').toLowerCase().replace(/\s+/g, '');
  const body = normalizeBodyForSignature(item.body || '').slice(0, 64);
  return `${Math.round(item.amount)}|${source}|${item.date}|${body}`;
};

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

// ─── Amount extraction ────────────────────────────────────────────────────────
// Handles: Rs. 1,00,000 / Rs.10.00 / INR 250.00 / Rs 850

export const extractAmount = (text: string): number => {
  const m = text.match(/(?:Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return 0;
  return parseFloat(m[1].replace(/,/g, ''));
};

// ─── Direction inference ──────────────────────────────────────────────────────

const inferDirection = (text: string): TransactionDirection => {
  const lower = text.toLowerCase();
  const hasDebit = /\b(sent|debited|debit|paid)\b/.test(lower);
  const hasCredit = /\b(credited|received|credit)\b/.test(lower);

  // "debited for Rs X on DATE to credit a/c" — "credit a/c" is destination, not direction
  if (hasDebit && /to\s+credit\s+a\/c/i.test(text)) return 'debit';
  if (hasDebit && !hasCredit) return 'debit';
  if (hasCredit && !hasDebit) return 'credit';
  if (hasDebit) return 'debit';
  return 'credit';
};

// ─── Bank / app name extraction ───────────────────────────────────────────────
// Most Indian bank SMS end with "- BankName" or "-BankName"

const extractSourceApp = (text: string): string => {
  const m = text.match(/-\s*([A-Za-z][A-Za-z\s]{1,30?})\s*$/);
  return m ? titleCase(m[1].trim()) : '';
};

// ─── Person / merchant name extraction ───────────────────────────────────────
//
// Handles these real patterns from Indian banks:
//
//  DEBIT
//  1. Slice:  "Rs. X sent from a/c xx... on DATE to NAME (UPI Ref:..."
//  2. Kotak:  "Sent Rs.X from ACCT to NAME on DATE. UPI ref..."
//  3. KGB:    "a/c X... is debited for Rs.X on DATE to credit a/c XXXXX (UPI RRN..."  → no name
//  4. Kotak:  "Your transaction for INR X against txn ID ... processed"               → no name
//
//  CREDIT
//  5. Slice:  "Rs. X received in slice A/c xx... from NAME via UPI (Ref ID:..."
//  6. KGB:    "Account XX... credited with Rs.X. UPI ref no..."                       → no name
//  7. Slice:  "Monthly interest on your fixed deposit... credited"                    → Interest
//

// Account placeholder pattern — XXXXX00051, XX3164, etc.
const ACCOUNT_RE = /^X{2,}[\dX]*$/i;

const isAccountPlaceholder = (s: string) => ACCOUNT_RE.test(s.replace(/\s/g, ''));

const cleanName = (raw: string): string => {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length < 2) return '';
  if (isAccountPlaceholder(trimmed)) return '';
  // Reject if it starts with a known non-name phrase
  if (/^(credit\s+a\/c|your\s+a\/c|the\s+)/i.test(trimmed)) return '';
  // Reject if it's only numbers
  if (/^\d+$/.test(trimmed)) return '';
  return titleCase(trimmed);
};

const extractName = (text: string, direction: TransactionDirection): string => {
  // ── Special cases ─────────────────────────────────────────────────────────
  if (/\binterest\b.*\bfixed\s*deposit\b|\bfixed\s*deposit\b.*\binterest\b/i.test(text)) {
    return 'Interest Income';
  }
  if (/\bsalary\b/i.test(text)) return 'Salary';
  if (/\brefund\b/i.test(text)) return 'Refund';
  if (/\bcashback\b/i.test(text)) return 'Cashback';

  // ── UPI VPA handle (name@bank) — reliable when present ───────────────────
  // e.g. tarun@upi, merchant@okaxis, john123@ybl
  const vpaMatch = text.match(/\b([a-z0-9][a-z0-9._\-]{2,})@([a-z][a-z0-9]{1,})\b/i);
  if (vpaMatch) {
    const handle = vpaMatch[1];
    const readable = handle.replace(/\d+$/, '').replace(/[._\-]+/g, ' ').trim();
    if (readable.length >= 2 && !/^(upi|ref|txn|pay|payment|https?)$/i.test(readable)) {
      return titleCase(readable);
    }
  }

  if (direction === 'debit') {
    // ── "to NAME (UPI" — Slice format ────────────────────────────────────────
    // "to TARUN GOWDA D N (UPI Ref:" or "to BANGALORE METRO (UPI Ref:"
    const toUpi = text.match(/\bto\s+([A-Z][A-Z\s\.]{1,50?})\s*\(UPI/);
    if (toUpi) {
      const name = cleanName(toUpi[1]);
      if (name) return name;
    }

    // ── "to NAME on DATE" — Kotak format ─────────────────────────────────────
    // "to Master Aridass on 19/04/2026"
    const toOn = text.match(/\bto\s+([A-Z][A-Za-z\s\.]{1,50?})\s+on\s+[\d\/\-]/);
    if (toOn) {
      const name = cleanName(toOn[1]);
      if (name) return name;
    }

    // ── "to NAME via" ─────────────────────────────────────────────────────────
    const toVia = text.match(/\bto\s+([A-Z][A-Za-z\s\.]{1,50?})\s+via\b/i);
    if (toVia) {
      const name = cleanName(toVia[1]);
      if (name) return name;
    }

    // ── "to credit a/c" — account transfer, no person name ───────────────────
    if (/to\s+credit\s+a\/c/i.test(text)) return 'Account Transfer';
  }

  if (direction === 'credit') {
    // ── "from NAME via UPI" — Slice received format ───────────────────────────
    // "from CHANDRASHEKHAR KULLOLLI via UPI"
    const fromVia = text.match(/\bfrom\s+([A-Z][A-Za-z\s\.]{1,50?})\s+via\b/i);
    if (fromVia) {
      const name = cleanName(fromVia[1]);
      if (name) return name;
    }

    // ── "from NAME on DATE" ───────────────────────────────────────────────────
    const fromOn = text.match(/\bfrom\s+([A-Z][A-Za-z\s\.]{1,50?})\s+on\s+[\d\/\-]/i);
    if (fromOn) {
      const name = cleanName(fromOn[1]);
      if (name) return name;
    }

    // ── "credited with Rs" — self/bank transfer, no person ────────────────────
    // e.g. KGB "Account XX3164 is credited with Rs. 2.00. UPI ref no..."
    return '';
  }

  return '';
};

// ─── Build human-readable transaction title ───────────────────────────────────

export const getTransactionInfo = (
  item: SmsTransactionCandidate,
): { title: string; direction: TransactionDirection; name: string; sourceApp: string } => {
  const text = [item.body, item.reason, item.name, item.sourceAddress]
    .filter(Boolean)
    .join(' ');

  const direction = inferDirection(text);
  const name = extractName(text, direction);
  const sourceApp = extractSourceApp(text);

  if (!name) {
    const label = sourceApp ? `${sourceApp} Transaction` : 'Bank Transaction';
    return { title: label, direction, name: '', sourceApp };
  }

  const nameLower = name.toLowerCase();
  const smartEntry = Object.entries(SMART_LABELS).find(([key]) => nameLower.includes(key));

  const title = smartEntry
    ? direction === 'credit'
      ? `From ${name}`
      : `${name} ${smartEntry[1]}`
    : direction === 'credit'
      ? `From ${name}`
      : `To ${name}`;

  return { title, direction, name, sourceApp };
};

// ─── Auto-approve helpers ─────────────────────────────────────────────────────

const normalizeSmsReason = (body: string): string => {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (!compact) return 'SMS Transaction';
  return compact.length > 60 ? `${compact.slice(0, 60)}...` : compact;
};

const getAutoApprovedPersonalExpense = (item: SmsTransactionCandidate) => {
  const { title, direction } = getTransactionInfo(item);
  const reason = title === 'Bank Transaction' ? normalizeSmsReason(item.body) : title;
  return {
    reason,
    category: direction === 'credit' ? 'Income' : 'Other',
    isIncome: direction === 'credit',
  };
};

const isDuplicateAutoApprovedPersonal = (
  item: SmsTransactionCandidate & { timestamp: number },
  approved: ReturnType<typeof getAutoApprovedPersonalExpense>,
): boolean => {
  return getPersonalExpenses().some((expense) => {
    if (expense.source !== 'sms') return false;
    if (expense.smsExternalId && expense.smsExternalId === item.externalId) return true;

    const expenseTime = new Date(expense.createdAt || expense.date).getTime();
    if (!Number.isFinite(expenseTime)) return false;

    return (
      Math.abs(expenseTime - item.timestamp) <= 60_000
      && Math.abs(expense.amount - item.amount) < 0.01
      && Boolean(expense.isIncome) === approved.isIncome
      && (expense.reason || '').trim().toLowerCase() === approved.reason.trim().toLowerCase()
    );
  });
};

const normalizeSmsName = (address: string): string => {
  const cleaned = address.replace(/[^a-zA-Z0-9]/g, '').trim();
  if (!cleaned) return 'SMS';
  return cleaned.length > 24 ? cleaned.slice(0, 24) : cleaned;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSmsCapture(enabled = true) {
  const [smsCaptureEnabled, setSmsCaptureEnabled] = useState(() =>
    readStoredBoolean(SMS_CAPTURE_ENABLED_KEY, true),
  );
  const [smsAutoApproveEnabled, setSmsAutoApproveEnabled] = useState(() =>
    readStoredBoolean(SMS_AUTO_APPROVE_KEY, true),
  );
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');

  useEffect(() => {
    const syncCapture = () => setSmsCaptureEnabled(readStoredBoolean(SMS_CAPTURE_ENABLED_KEY, true));
    const syncAutoApprove = () => setSmsAutoApproveEnabled(readStoredBoolean(SMS_AUTO_APPROVE_KEY, true));
    syncCapture();
    syncAutoApprove();
    window.addEventListener('splitmate_sms_capture_changed', syncCapture);
    window.addEventListener('splitmate_sms_auto_approve_changed', syncAutoApprove);
    return () => {
      window.removeEventListener('splitmate_sms_capture_changed', syncCapture);
      window.removeEventListener('splitmate_sms_auto_approve_changed', syncAutoApprove);
    };
  }, []);

  useEffect(() => {
    if (!smsCaptureEnabled) { setPermissionStatus('unknown'); return; }
    setPermissionStatus((current) => (current === 'granted' ? current : 'unknown'));
  }, [smsCaptureEnabled]);

  useEffect(() => {
    if (!enabled || !smsCaptureEnabled || !Capacitor.isNativePlatform()) return;
    if (permissionStatus !== 'unknown') return;
    let cancelled = false;
    const requestPermission = async () => {
      try {
        const granted = await SmsTransactions.requestSmsPermissions();
        if (!cancelled) setPermissionStatus(granted.granted ? 'granted' : 'denied');
      } catch {
        if (!cancelled) setPermissionStatus('denied');
      }
    };
    void requestPermission();
    return () => { cancelled = true; };
  }, [enabled, permissionStatus, smsCaptureEnabled]);

  useEffect(() => {
    if (!enabled || !smsCaptureEnabled || !Capacitor.isNativePlatform() || permissionStatus !== 'granted') return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const pullSmsTransactions = async () => {
      try {
        await SmsTransactions.initializeCapture();

        if (localStorage.getItem(SMS_INITIAL_HISTORY_IMPORTED_KEY) !== 'true') {
          const historyResult = await SmsTransactions.fetchNewTransactions({ limit: 10, includeHistory: true });
          if ((historyResult.messages || []).length > 0) {
            const existingHistorySignatures = new Set(
              getSmsTransactions().map((item) => buildSmsSignature(item)),
            );

            const initialHistory = (historyResult.messages || [])
              .map((msg) => {
                const body = msg.body || '';
                const parsedAmount = extractAmount(body);
                const amount = parsedAmount > 0 ? parsedAmount : Number(msg.amount || 0);
                return {
                  id: `sms-${msg.id}`,
                  externalId: `sms-${msg.id}`,
                  sourceAddress: msg.address || 'Unknown',
                  body,
                  amount,
                  date: new Date(msg.dateMillis || Date.now()).toISOString().split('T')[0],
                  reason: normalizeSmsReason(body),
                  name: normalizeSmsName(msg.address || ''),
                  createdAt: new Date().toISOString(),
                  timestamp: msg.dateMillis || Date.now(),
                };
              })
              .filter((item) => item.amount > 0)
              .filter((item) => !existingHistorySignatures.has(buildSmsSignature(item)));

            if (initialHistory.length > 0) {
              if (smsAutoApproveEnabled) {
                initialHistory.forEach((item) => {
                  const approved = getAutoApprovedPersonalExpense(item);
                  if (isDuplicateAutoApprovedPersonal(item, approved)) return;
                  savePersonalExpense({
                    id: generateId(),
                    amount: item.amount,
                    reason: approved.reason,
                    category: approved.category,
                    date: item.date,
                    createdAt: new Date().toISOString(),
                    isIncome: approved.isIncome,
                    source: 'sms',
                    smsExternalId: item.externalId,
                  });
                });
              } else {
                upsertSmsTransactions(initialHistory.map(({ timestamp: _, ...item }) => item));
              }
            }
          }

          localStorage.setItem(SMS_INITIAL_HISTORY_IMPORTED_KEY, 'true');
        }

        const lastFetchTime = Number(localStorage.getItem(SMS_LAST_FETCH_TIME_KEY) || 0);
        const result = await SmsTransactions.fetchNewTransactions({ limit: 100 });

        const existingSmsSignatures = new Set(
          getSmsTransactions().map((item) => buildSmsSignature(item)),
        );
        const batchSignatures = new Set<string>();

        const mappedWithTimestamp = (result.messages || [])
          .map((msg) => {
            const body = msg.body || '';
            // extractAmount is more reliable than the plugin's parsed value
            const parsedAmount = extractAmount(body);
            const amount = parsedAmount > 0 ? parsedAmount : Number(msg.amount || 0);
            return {
              id: `sms-${msg.id}`,
              externalId: `sms-${msg.id}`,
              sourceAddress: msg.address || 'Unknown',
              body,
              amount,
              date: new Date(msg.dateMillis || Date.now()).toISOString().split('T')[0],
              reason: normalizeSmsReason(body),
              name: normalizeSmsName(msg.address || ''),
              createdAt: new Date().toISOString(),
              timestamp: msg.dateMillis || Date.now(),
            };
          })
          .filter((item) => {
            if (!(item.amount > 0 && item.timestamp > lastFetchTime)) return false;
            const signature = buildSmsSignature(item);
            if (existingSmsSignatures.has(signature) || batchSignatures.has(signature)) return false;
            batchSignatures.add(signature);
            return true;
          });

        const mapped: SmsTransactionCandidate[] = mappedWithTimestamp.map(
          ({ timestamp: _, ...item }) => item,
        );
        if (mapped.length === 0) return;

        const latestTime = Math.max(...mappedWithTimestamp.map((item) => item.timestamp));
        localStorage.setItem(SMS_LAST_FETCH_TIME_KEY, String(latestTime));

        if (smsAutoApproveEnabled) {
          mappedWithTimestamp.forEach((item) => {
            const approved = getAutoApprovedPersonalExpense(item);
            if (isDuplicateAutoApprovedPersonal(item, approved)) return;
            savePersonalExpense({
              id: generateId(),
              amount: item.amount,
              reason: approved.reason,
              category: approved.category,
              date: item.date,
              createdAt: new Date().toISOString(),
              isIncome: approved.isIncome,
              source: 'sms',
              smsExternalId: item.externalId,
            });
          });
        } else {
          upsertSmsTransactions(mapped);
        }
      } catch (error) {
        console.warn('[SMS Capture] Failed', error);
      }
    };

    void pullSmsTransactions();
    interval = setInterval(() => { void pullSmsTransactions(); }, 25000);
    return () => { if (interval) clearInterval(interval); };
  }, [enabled, permissionStatus, smsAutoApproveEnabled, smsCaptureEnabled]);

  useEffect(() => {
    const handlePermissionGranted = () => {
      setPermissionStatus('granted');
    };

    const handleCaptureDisabled = () => {
      setPermissionStatus('unknown');
    };

    window.addEventListener('splitmate_sms_permission_granted', handlePermissionGranted);
    window.addEventListener('splitmate_sms_capture_disabled', handleCaptureDisabled);
    return () => {
      window.removeEventListener('splitmate_sms_permission_granted', handlePermissionGranted);
      window.removeEventListener('splitmate_sms_capture_disabled', handleCaptureDisabled);
    };
  }, []);
}