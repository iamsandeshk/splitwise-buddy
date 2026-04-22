import { getFriendGroups, getPersonalExpenses, getSharedExpenses, getSmsTransactions } from '@/lib/storage';

export type AppTransactionType = 'personal' | 'split-person' | 'group' | 'sms';
export type AppTransactionDirection = 'incoming' | 'outgoing';
export type AppTransactionSourceTab = 'personal' | 'shared' | 'sms-transactions';

export interface AppTransactionItem {
  id: string;
  type: AppTransactionType;
  direction: AppTransactionDirection;
  amount: number;
  reason: string;
  date: string;
  createdAt: string;
  sourceTab: AppTransactionSourceTab;
  sourceId: string;
  sourceLabel: string;
  subtitle: string;
  status?: string;
}

const CREDIT_WORDS = /\b(credited|received|credit)\b/i;

const inferSmsDirection = (text: string): AppTransactionDirection => {
  if (CREDIT_WORDS.test(text)) return 'incoming';
  return 'outgoing';
};

export function getAllAppTransactions(): AppTransactionItem[] {
  const groupsById = new Map(getFriendGroups().map((group) => [group.id, group.name]));

  const personal = getPersonalExpenses().map<AppTransactionItem>((item) => ({
    id: `personal:${item.id}`,
    type: 'personal',
    direction: item.isIncome ? 'incoming' : 'outgoing',
    amount: Math.abs(Number(item.amount || 0)),
    reason: item.reason || 'Personal Transaction',
    date: item.date,
    createdAt: item.createdAt || item.date,
    sourceTab: 'personal',
    sourceId: item.id,
    sourceLabel: 'Personal',
    subtitle: item.category || 'General',
    status: item.isIncome ? 'Income' : 'Expense',
  }));

  const shared = getSharedExpenses().map<AppTransactionItem>((item) => {
    const isGroup = Boolean(item.groupId);
    const direction: AppTransactionDirection = item.paidBy === 'me' ? 'outgoing' : 'incoming';
    const groupName = item.groupId ? groupsById.get(item.groupId) || 'Group' : '';
    return {
      id: `shared:${item.id}`,
      type: isGroup ? 'group' : 'split-person',
      direction,
      amount: Math.abs(Number(item.amount || 0)),
      reason: item.reason || 'Shared Transaction',
      date: item.date,
      createdAt: item.createdAt || item.date,
      sourceTab: 'shared',
      sourceId: item.id,
      sourceLabel: isGroup ? 'Group Card' : 'Person Card',
      subtitle: isGroup
        ? `${groupName} • ${item.personName || 'Member'}`
        : item.personName || 'Shared',
      status: item.settled ? 'Settled' : 'Pending',
    };
  });

  const sms = getSmsTransactions().map<AppTransactionItem>((item) => {
    const text = [item.reason, item.body, item.name, item.sourceAddress].filter(Boolean).join(' ');
    const direction = inferSmsDirection(text);
    return {
      id: `sms:${item.id}`,
      type: 'sms',
      direction,
      amount: Math.abs(Number(item.amount || 0)),
      reason: item.reason || 'SMS Transaction',
      date: item.date,
      createdAt: item.createdAt || item.date,
      sourceTab: 'sms-transactions',
      sourceId: item.id,
      sourceLabel: 'SMS Transactions',
      subtitle: item.name || item.sourceAddress || 'Bank SMS',
      status: 'Pending',
    };
  });

  return [...personal, ...shared, ...sms].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.date).getTime();
    const bTime = new Date(b.createdAt || b.date).getTime();
    return bTime - aTime;
  });
}
