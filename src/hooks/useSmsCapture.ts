import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  generateId,
  getPersonalExpenses,
  getSmsTransactions,
  savePersonalExpense,
  upsertSmsTransactions,
  getDefaultAccountId,
  getAccounts,
  syncDemoTransactions,
  type SmsTransactionCandidate,
} from '@/lib/storage';
import { SmsTransactions } from '@/plugins/SmsTransactionPlugin';
import {
  extractAmount,
  inferDirection,
  extractCounterparty,
  getTransactionTitle,
  getPaymentAppLabel,
  getTransactionCategory,
  type TransactionDirection,
} from '@/lib/smsParser';

const SMS_CAPTURE_ENABLED_KEY = 'splitmate_sms_capture_enabled';
const SMS_AUTO_APPROVE_KEY = 'splitmate_sms_auto_approve_enabled';
const SMS_LAST_FETCH_TIME_KEY = 'splitmate_sms_last_fetch_time';
const SMS_INITIAL_HISTORY_IMPORTED_KEY = 'splitmate_sms_initial_history_imported';
const SMS_UPI_REF_NAME_MAP_KEY = 'splitmate_sms_upi_ref_name_map';

type PermissionStatus = 'unknown' | 'granted' | 'denied';

const readStoredBoolean = (key: string, defaultValue: boolean) => {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  return value === 'true';
};

const shouldIgnoreSmsTransaction = (text: string): boolean => {
  const lower = text.toLowerCase();
  return /cooling\s*period\s*limit\s*for\s*upi\s*transactions/.test(lower)
    || /via\s*wa\s*for\s*72\s*hours\s*after\s*new\s*user\s*registration/.test(lower);
};

export const getTransactionInfo = (
  item: SmsTransactionCandidate,
): { title: string; direction: TransactionDirection; name: string; sourceApp: string } => {
  const direction = inferDirection(item.body);
  const counterparty = extractCounterparty(item.body, direction, item.sourceAddress, item.name);
  const title = getTransactionTitle(item.body, direction, counterparty);
  const sourceApp = getPaymentAppLabel(item.body, item.reason, item.name, item.sourceAddress);

  return { title, direction, name: counterparty, sourceApp };
};

const normalizeSmsReason = (body: string): string => {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (!compact) return 'SMS Transaction';
  return compact.length > 60 ? `${compact.slice(0, 60)}...` : compact;
};

const getAutoApprovedPersonalExpense = (item: SmsTransactionCandidate) => {
  const { title, direction, name } = getTransactionInfo(item);
  const category = direction === 'credit'
    ? 'Income'
    : getTransactionCategory(item.body, name, item.reason, item.name, item.sourceAddress);

  return {
    reason: title,
    category,
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

const buildSmsSignature = (item: { amount: number; date: string; body?: string }) => {
  return `${item.amount}_${item.date}_${(item.body || '').trim().toLowerCase()}`;
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
    syncDemoTransactions(smsAutoApproveEnabled);
  }, [smsAutoApproveEnabled]);

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
              .filter((item) => !shouldIgnoreSmsTransaction(item.body || ''))
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
                    accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
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
            if (shouldIgnoreSmsTransaction(item.body || '')) return false;
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
              accountId: getDefaultAccountId() || getAccounts()[0]?.id || undefined,
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