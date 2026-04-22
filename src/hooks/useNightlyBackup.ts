import { useEffect } from 'react';
import { subscribeGoogleAuth } from '@/integrations/firebase/auth';
import { saveBackupForCurrentUser } from '@/integrations/firebase/backup';
import { getAccountProfile, exportAllData } from '@/lib/storage';
import { isProUserCached } from '@/lib/proAccess';

const APP_VERSION = '4.2';

/**
 * Hook to automatically perform a cloud backup once per day (targeting midnight/00:00).
 * Since client-side apps can't run true cron jobs, this triggers the first time 
 * the app is opened on a new day.
 */
export function useNightlyBackup() {
  useEffect(() => {
    let isUserLoggedIn = false;

    const performBackup = async () => {
      const profile = getAccountProfile();
      if (!isUserLoggedIn || !navigator.onLine || !profile.nightlyBackupEnabled) return;
      if (!isProUserCached()) return;

      const lastBackupStr = localStorage.getItem('last_nightly_backup_date');
      const todayStr = new Date().toISOString().split('T')[0];

      // If today is different from the last backup date, we need to backup
      if (lastBackupStr !== todayStr) {
        try {
          const payload = exportAllData();
          await saveBackupForCurrentUser(payload, APP_VERSION, { silentIfFree: true });
          localStorage.setItem('last_nightly_backup_date', todayStr);
          console.log('[NightlyBackup] Automated daily backup successful for:', todayStr);
        } catch (error) {
          console.error('[NightlyBackup] Automated daily backup failed:', error);
        }
      }
    };

    const unsubscribe = subscribeGoogleAuth((user) => {
      const isLoggingIn = !isUserLoggedIn && !!user;
      isUserLoggedIn = !!user;
      
      if (isLoggingIn) {
        // 🛡️ Safety Delay: When user just logged in (e.g. fresh install),
        // give the app 10s to finish any auto-restore before we even think about backing up.
        // This prevents backing up empty data over a valid cloud backup.
        setTimeout(() => {
          if (localStorage.getItem('splitmate_restore_in_progress') === 'true') return;
          void performBackup();
        }, 10000);
      } else if (isUserLoggedIn) {
        void performBackup();
      }
    });

    // Handle offline-to-online recovery
    const handleOnlineStatus = () => {
      if (navigator.onLine) {
        void performBackup();
      }
    };

    window.addEventListener('online', handleOnlineStatus);

    // Also check every hour in case the app stays open across midnight
    const interval = setInterval(() => {
      void performBackup();
    }, 1000 * 60 * 60); // 1 hour

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnlineStatus);
      clearInterval(interval);
    };
  }, []);
}
