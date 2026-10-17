// Reminders fire from the open page (checked every 30s), shown through the service
// worker so they appear as system notifications. Browsers give a static PWA no reliable
// way to wake itself at a set time when closed; that needs a Web Push server.

import { dateKey } from './dates.js';
import { isDone, isScheduled } from './habits.js';
import { t } from './i18n.js';

// Habits whose reminder time has passed today, that aren't done and weren't already notified.
export function dueReminders(state, now = new Date()) {
  const today = dateKey(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return state.habits.filter(
    (h) =>
      h.time &&
      h.time <= hhmm &&
      isScheduled(h, now) &&
      !isDone(state.completions, h.id, now) &&
      state.notified[h.id] !== today,
  );
}

// A private habit's reminder doesn't name it, since notifications show on the lock screen.
export function reminderTitle(habit) {
  return habit.private ? t('reminderTitlePrivate') : t('reminderTitle', { emoji: habit.emoji, name: habit.name });
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export async function notify(habit) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.ready;
  const title = reminderTitle(habit);
  const options = { body: t('reminderBody'), tag: habit.id, icon: 'icons/icon.svg' };
  if (reg) reg.showNotification(title, options);
  else new Notification(title, options);
}

// Shows the number of open habits on the installed app's icon. The Badging API works
// for installed apps on Windows and macOS (Chrome, Edge). Android has no Badging API:
// its launchers mark the icon only while the app has a notification showing.
export function setBadge(count) {
  if (!('setAppBadge' in navigator)) return;
  (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

// Removes a habit's reminder once it's done, so the Android icon dot goes away with it.
export async function dismissReminder(habitId) {
  const reg = await navigator.serviceWorker?.getRegistration();
  for (const n of (await reg?.getNotifications({ tag: habitId })) || []) n.close();
}
