import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Hash a string to a unique 32-bit positive integer.
 */
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Requests notification permission in a cross-platform manner.
 * Natively, uses Capacitor LocalNotifications plugin.
 * On web, falls back to standard Web Notifications API.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const check = await LocalNotifications.checkPermissions();
      if (check.display === 'granted') {
        return true;
      }
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    } catch (e) {
      console.error('Failed to request native notification permissions:', e);
      return false;
    }
  } else {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    return false;
  }
}

/**
 * Checks whether notification permissions are currently granted.
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const check = await LocalNotifications.checkPermissions();
      return check.display === 'granted';
    } catch {
      return false;
    }
  } else {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return true; // Default to true if not supported or not browser (so banner is hidden)
  }
}

/**
 * Synchronizes the app's notification state with the native OS scheduler.
 * Cancels outdated alarms and registers new daily repeating slots and future custom alerts.
 */
export async function syncScheduledNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // 1. Cancel all existing scheduled notifications
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }

    // 2. Schedule Daily Reminders if enabled
    const settingsStr = localStorage.getItem('splitmate_reminder_settings');
    if (settingsStr) {
      const settings = JSON.parse(settingsStr) as { enabled: boolean; times?: string[]; time?: string };
      if (settings.enabled) {
        const times = settings.times || (settings.time ? [settings.time] : ['20:00']);
        
        const scheduleList = times.map((timeStr, idx) => {
          const [hourStr, minStr] = timeStr.split(':');
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minStr, 10);

          return {
            title: "Reminder 💸",
            body: "Time to add your entries for the day!",
            id: 100 + idx, // Daily reminders get IDs 100, 101, 102
            schedule: {
              on: {
                hour,
                minute
              },
              repeats: true,
              allowWhileIdle: true
            }
          };
        });

        if (scheduleList.length > 0) {
          await LocalNotifications.schedule({ notifications: scheduleList });
        }
      }
    }

    // 3. Schedule Custom Future Reminders
    const customStr = localStorage.getItem('splitmate_custom_reminders');
    if (customStr) {
      const customReminders = JSON.parse(customStr) as Array<{
        id: string;
        date: string;
        time: string;
        message: string;
        notified?: boolean;
      }>;

      const now = new Date();
      const futureCustoms = customReminders.filter(r => {
        if (r.notified) return false;
        const reminderTime = new Date(`${r.date}T${r.time}:00`);
        return reminderTime > now;
      });

      const customScheduleList = futureCustoms.map(r => {
        const reminderTime = new Date(`${r.date}T${r.time}:00`);
        // Generate a numeric ID starting from 200+ to avoid conflict with daily slots
        const numId = (stringToHash(r.id) % 1000000) + 200;

        return {
          title: "Custom Reminder ⏰",
          body: r.message || "Time to add your entries!",
          id: numId,
          schedule: {
            at: reminderTime,
            allowWhileIdle: true
          }
        };
      });

      if (customScheduleList.length > 0) {
        await LocalNotifications.schedule({ notifications: customScheduleList });
      }
    }
  } catch (e) {
    console.error('Failed to sync native notifications schedule:', e);
  }
}
