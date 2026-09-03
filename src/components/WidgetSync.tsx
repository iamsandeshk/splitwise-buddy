import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { getPersonalExpenses, getPersonBalances, getCurrency } from '@/lib/storage';
import WidgetBridge from '@/plugins/WidgetBridgePlugin';

/**
 * WidgetSync - Invisible component that pushes summary data to native Android widgets
 * whenever app data changes. Only runs on native Android platform.
 */
export function WidgetSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const syncWidgetData = () => {
      try {
        const expenses = getPersonalExpenses().filter(
          (e) =>
            !e.id.startsWith('demo-sms-') &&
            !(e.smsExternalId && e.smsExternalId.startsWith('demo-sms-'))
        );

        // The main balance is lifetime and must not reset when the month changes (matching HomeTab)
        const lifetimePersonalExpenses = expenses
          .filter((expense) => !expense.isIncome)
          .reduce((sum, expense) => sum + expense.amount, 0);

        const lifetimePersonalIncome = expenses
          .filter((expense) => expense.isIncome)
          .reduce((sum, income) => sum + income.amount, 0);

        const personBalances = getPersonBalances();
        const netSharedBalance = personBalances.reduce(
          (sum, person) => sum + person.netBalance,
          0
        );

        // Lifetime net = unsettled shared balance + all personal income - all personal expenses
        const netTotalBalance =
          netSharedBalance + lifetimePersonalIncome - lifetimePersonalExpenses;

        const sharedOwedToYou = personBalances
          .filter((p) => p.netBalance > 0)
          .reduce((sum, p) => sum + p.netBalance, 0);

        const sharedYouOwe = personBalances
          .filter((p) => p.netBalance < 0)
          .reduce((sum, p) => sum + Math.abs(p.netBalance), 0);

        const totalIncoming = sharedOwedToYou + lifetimePersonalIncome;
        const totalOutgoing = sharedYouOwe + lifetimePersonalExpenses;

        const currencySymbol = getCurrency().symbol;

        // Month label matching HomeTab: e.g. "SEP 26"
        const monthLabel = new Date().toLocaleDateString('en', {
          month: 'short',
          year: '2-digit',
        });

        WidgetBridge.updateWidgetData({
          spent: totalOutgoing,
          income: totalIncoming,
          balance: netTotalBalance,
          currency: currencySymbol,
          month: monthLabel,
        }).catch(() => {
          // Silently fail if plugin isn't available
        });
      } catch {
        // Ignore errors during widget sync
      }
    };

    // Sync on mount
    syncWidgetData();

    // Sync whenever data changes
    window.addEventListener('splitmate_data_changed', syncWidgetData);
    window.addEventListener('splitmate_currency_changed', syncWidgetData);
    window.addEventListener('splitmate_friend_groups_changed', syncWidgetData);
    window.addEventListener('splitmate_accounts_changed', syncWidgetData);
    window.addEventListener('focus', syncWidgetData);

    return () => {
      window.removeEventListener('splitmate_data_changed', syncWidgetData);
      window.removeEventListener('splitmate_currency_changed', syncWidgetData);
      window.removeEventListener('splitmate_friend_groups_changed', syncWidgetData);
      window.removeEventListener('splitmate_accounts_changed', syncWidgetData);
      window.removeEventListener('focus', syncWidgetData);
    };
  }, []);

  return null;
}
