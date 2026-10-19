// Pure habit logic: scheduling, streaks and rewards. No DOM or storage access here,
// so everything in this file is unit-tested under Node (see tests/).
//
// Habit shape:
//   { id, name, emoji, days: [0-6 weekday numbers, 0 = Sunday], time: "HH:MM" | "", createdAt: "YYYY-MM-DD",
//     private?: true, pastDays?: [{ until: "YYYY-MM-DD", days }], pile?: "day" | "week" | "month" }
// `days` is the current schedule. `pastDays` (oldest first) records earlier schedules,
// each in effect for days before its `until`, so editing the days never rewrites history.
// Completions shape (kept separately in state):
//   { [habitId]: ["YYYY-MM-DD", ...] }
// A pile habit can list a day more than once: each entry is one round done that day.

import { addDays, dateKey, parseKey } from './dates.js';

export function isScheduled(habit, date) {
  const key = dateKey(date);
  return key >= habit.createdAt && daysOn(habit, key).includes(date.getDay());
}

function daysOn(habit, key) {
  const past = (habit.pastDays || []).find((p) => key < p.until);
  return past ? past.days : habit.days;
}

// Returns the habit with `changes` ({ name, emoji, days, time, private }) applied. Its id and
// createdAt stay, so completions, streaks and badges carry over. A new set of days
// takes effect today; the old one is kept in pastDays for the days before.
export function editHabit(habit, changes, today = new Date()) {
  const next = { ...habit, ...changes, id: habit.id, createdAt: habit.createdAt };
  const key = dateKey(today);
  const sameDays = [...habit.days].sort().join() === [...next.days].sort().join();
  if (sameDays) return { ...next, days: habit.days };
  if (key <= habit.createdAt) return next;
  // Edited again today: today already uses the new days, so just replace them.
  const past = (habit.pastDays || []).filter((p) => p.until < key);
  const prev = habit.pastDays?.find((p) => p.until === key);
  return { ...next, pastDays: [...past, prev || { until: key, days: habit.days }] };
}

export function isDone(completions, habitId, date) {
  return (completions[habitId] || []).includes(dateKey(date));
}

// Consecutive scheduled days completed, counting back from `today`.
// Unscheduled days are skipped, so a Mon/Wed/Fri habit keeps its streak over the weekend.
// If today is scheduled but not done yet, the streak is still alive (the user has until midnight).
// Pile habits count periods instead (see pileStreak).
export function currentStreak(habit, completions, today = new Date()) {
  if (habit.pile) return pileStreak(habit, completions, today);
  let streak = 0;
  let day = today;
  const start = parseKey(habit.createdAt);
  if (isScheduled(habit, day) && !isDone(completions, habit.id, day)) day = addDays(day, -1);
  while (day >= start) {
    if (isScheduled(habit, day)) {
      if (!isDone(completions, habit.id, day)) break;
      streak++;
    }
    day = addDays(day, -1);
  }
  return streak;
}

export function longestStreak(habit, completions, today = new Date()) {
  if (habit.pile) return longestPileStreak(habit, completions, today);
  let best = 0;
  let run = 0;
  for (let day = parseKey(habit.createdAt); day <= today; day = addDays(day, 1)) {
    if (!isScheduled(habit, day)) continue;
    if (isDone(completions, habit.id, day)) {
      run++;
      best = Math.max(best, run);
    } else if (dateKey(day) !== dateKey(today)) {
      run = 0;
    }
  }
  return best;
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];
export const POINTS_PER_CHECKIN = 10;
export const POINTS_PER_MILESTONE = 50;

// Rewards are derived from history every time rather than stored, so un-checking a
// mistaken tap takes the points back and nothing can drift out of sync.
export function rewards(habits, completions, today = new Date()) {
  const badges = [];
  let checkins = 0;
  for (const habit of habits) {
    checkins += (completions[habit.id] || []).length;
    const best = longestStreak(habit, completions, today);
    for (const m of STREAK_MILESTONES) {
      if (best >= m) badges.push({ habitId: habit.id, milestone: m, unit: streakUnit(habit) });
    }
  }
  const points = checkins * POINTS_PER_CHECKIN + badges.length * POINTS_PER_MILESTONE;
  return { points, level: Math.floor(points / 250) + 1, checkins, badges };
}

export function dueToday(habits, today = new Date()) {
  return habits.filter((h) => isScheduled(h, today));
}

// Today's list: the scheduled habits, plus pile habits that still owe rounds this period
// even on a day they aren't planned for.
export function onToday(habits, completions, today = new Date()) {
  return habits.filter((h) => isScheduled(h, today) || (h.pile && pileCount(h, completions, today) > 0));
}

// Whether a habit still needs doing on `date`: a pile habit while its pile is above 0,
// any other habit while it's scheduled and not checked off.
export function isOpen(habit, completions, date = new Date()) {
  if (habit.pile) return pileCount(habit, completions, date) > 0;
  return isScheduled(habit, date) && !isDone(completions, habit.id, date);
}

// Habits still open today: the count on the app badge.
export function openToday(habits, completions, today = new Date()) {
  return habits.filter((h) => isOpen(h, completions, today));
}

// Whether a habit's reminder should go out on `date`: an open habit on a day it's planned
// for, and a pile habit also on the last day of its period while it still owes rounds.
export function remindOn(habit, completions, date = new Date()) {
  if (!isOpen(habit, completions, date)) return false;
  return isScheduled(habit, date) || (habit.pile && dateKey(date) === dateKey(periodEnd(habit.pile, date)));
}

// What friends see of you: the level from your own screen and your best current streak.
// Private habits don't count toward the streak, so friends learn nothing about them.
// A pile habit's streak counts weeks or months, so it's turned into days to compare.
export function sharedStats(habits, completions, today = new Date()) {
  const streaks = habits.filter((h) => !h.private).map((h) => currentStreak(h, completions, today) * DAYS_PER[streakUnit(h)]);
  return { level: rewards(habits, completions, today).level, streak: Math.max(0, ...streaks) };
}

export const POINTS_PER_LEVEL = 250;

// Where `points` sit within the current level, for the bar and "N pts to level X" in the header.
export function levelProgress(points) {
  const into = points % POINTS_PER_LEVEL;
  return { level: Math.floor(points / POINTS_PER_LEVEL) + 1, into, toNext: POINTS_PER_LEVEL - into };
}

// One entry per habit with a badge: its highest milestone and the next one to aim for
// (null once all are earned). Keeps the Progress sheet short as badges pile up.
export function bestBadges(badges) {
  const best = new Map();
  const units = new Map();
  for (const b of badges) {
    if (b.milestone > (best.get(b.habitId) ?? 0)) best.set(b.habitId, b.milestone);
    units.set(b.habitId, b.unit);
  }
  return [...best].map(([habitId, milestone]) => ({
    habitId,
    milestone,
    unit: units.get(habitId),
    next: STREAK_MILESTONES.find((m) => m > milestone) ?? null,
  }));
}

// Today's list order: open habits first, by reminder time (habits without one after
// those with), then the ones already done, in the same order. Stable otherwise.
export function sortToday(habits, completions, today = new Date()) {
  const rank = (h) => [isOpen(h, completions, today) ? 0 : 1, h.time || '99:99'];
  return [...habits].sort((a, b) => {
    const [da, ta] = rank(a);
    const [db, tb] = rank(b);
    return da - db || (ta < tb ? -1 : ta > tb ? 1 : 0);
  });
}

// Until noon, yesterday's scheduled habits that weren't checked off can still be, for
// the "I did it but forgot to tick it" case. Afterwards the day is closed. Pile habits
// with a week or month target don't need it: their rounds count on any day.
export const GRACE_UNTIL_HOUR = 12;

export function missedYesterday(habits, completions, now = new Date()) {
  if (now.getHours() >= GRACE_UNTIL_HOUR) return [];
  const yesterday = addDays(now, -1);
  return habits.filter(
    (h) => (!h.pile || h.pile === 'day') && isScheduled(h, yesterday) && !isDone(completions, h.id, yesterday),
  );
}

// A short name for common schedules, or null to list the days: "daily", "weekdays", "weekends".
export function scheduleKind(days) {
  const key = [...days].sort().join();
  return { '0,1,2,3,4,5,6': 'daily', '1,2,3,4,5': 'weekdays', '0,6': 'weekends' }[key] ?? null;
}

// Pile habits: every planned day adds one round to the pile, every round done takes one
// off. 0 is up to date, above 0 is rounds still to do, below 0 is rounds ahead. The pile
// starts at 0 again with each period (day, week from Monday, or month), and the streak
// counts periods that ended with nothing left on the pile.
export const PILE_PERIODS = ['day', 'week', 'month'];
const DAYS_PER = { day: 1, week: 7, month: 30 };

export function streakUnit(habit) {
  return habit.pile || 'day';
}

export function periodStart(period, date) {
  if (period === 'week') return addDays(date, -((date.getDay() + 6) % 7));
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth(), 1);
  return addDays(date, 0);
}

export function periodEnd(period, date) {
  if (period === 'week') return addDays(periodStart(period, date), 6);
  if (period === 'month') return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return addDays(date, 0);
}

// Rounds done on days from `from` to `to`, both "YYYY-MM-DD" and included.
function roundsBetween(completions, habitId, from, to) {
  return (completions[habitId] || []).filter((k) => k >= from && k <= to).length;
}

function plannedBetween(habit, from, to) {
  let n = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) if (isScheduled(habit, day)) n++;
  return n;
}

// Rounds still to do this period, counting `date` itself as planned (so on the last
// planned day a pile of 3 means 3 more rounds).
export function pileCount(habit, completions, date = new Date()) {
  const start = periodStart(habit.pile, date);
  return plannedBetween(habit, start, date) - roundsBetween(completions, habit.id, dateKey(start), dateKey(date));
}

// What a whole period asked for and what was done in it.
function tally(habit, completions, date) {
  const start = periodStart(habit.pile, date);
  const end = periodEnd(habit.pile, date);
  return { start, planned: plannedBetween(habit, start, end), done: roundsBetween(completions, habit.id, dateKey(start), dateKey(end)) };
}

// Periods in a row with the pile cleared. The current period counts once all of its
// rounds are done, and doesn't break the streak before it's over. Periods with nothing
// planned are skipped.
function pileStreak(habit, completions, today) {
  const created = parseKey(habit.createdAt);
  let streak = 0;
  const now = tally(habit, completions, today);
  if (now.planned && now.done >= now.planned) streak++;
  for (let day = addDays(now.start, -1); day >= created; ) {
    const p = tally(habit, completions, day);
    if (p.planned) {
      if (p.done < p.planned) break;
      streak++;
    }
    day = addDays(p.start, -1);
  }
  return streak;
}

function longestPileStreak(habit, completions, today) {
  const current = dateKey(periodStart(habit.pile, today));
  let best = 0;
  let run = 0;
  for (let day = parseKey(habit.createdAt); day <= today; ) {
    const p = tally(habit, completions, day);
    if (p.planned && p.done >= p.planned) best = Math.max(best, ++run);
    else if (p.planned && dateKey(p.start) !== current) run = 0;
    day = addDays(periodEnd(habit.pile, day), 1);
  }
  return best;
}
