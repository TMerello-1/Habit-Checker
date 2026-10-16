// Reminders fire from the open page (checked every 30s), shown through the service
// worker so they appear as system notifications. Browsers give a static PWA no reliable
// way to wake itself at a set time when closed; that needs a Web Push server.

import { dateKey } from './dates.js';
import { isDone, isScheduled } from './habits.js';

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

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export async function notify(habit) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.ready;
  const title = `${habit.emoji} Time for: ${habit.name}`;
  const options = { body: 'Keep your streak going!', tag: habit.id, icon: 'icons/icon.svg' };
  if (reg) reg.showNotification(title, options);
  else new Notification(title, options);
}
