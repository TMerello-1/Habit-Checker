// Which reminders are due, from the server's side. The server runs in UTC, so it works out
// the user's own calendar date and clock time from the IANA timezone the app reported,
// then reuses the app's scheduling rules unchanged.

import { dateKey } from '../../src/dates.js';
import { isScheduled, remindOn } from '../../src/habits.js';

// A cron tick can be skipped or late, so a reminder still goes out if its time
// passed within this many minutes and it hasn't been sent today.
export const CATCH_UP_MINUTES = 10;

// The user's local date as a Date whose getDay()/dateKey() read correctly in this runtime,
// plus minutes since their local midnight.
export function localClock(timeZone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const day = new Date(parts.year, parts.month - 1, parts.day);
  return { day, today: dateKey(day), minutes: parts.hour * 60 + parts.minute };
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0;
  } catch {
    return false;
  }
}

// record: { timeZone, habits, done: { [habitId]: "YYYY-MM-DD" of latest check-in },
//   rounds: { [habitId]: ["YYYY-MM-DD", ...] } for pile habits, notified: { [habitId]: "YYYY-MM-DD" } }
export function dueHabits(record, now = new Date()) {
  const { day, today, minutes } = localClock(record.timeZone, now);
  return record.habits.filter((h) => {
    if (!h.time || record.notified?.[h.id] === today) return false;
    if (h.pile) {
      if (!remindOn(h, record.rounds || {}, day)) return false;
    } else if (!isScheduled(h, day) || record.done?.[h.id] === today) return false;
    const [hh, mm] = h.time.split(':').map(Number);
    const late = minutes - (hh * 60 + mm);
    return late >= 0 && late < CATCH_UP_MINUTES;
  });
}
