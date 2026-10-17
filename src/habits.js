// Pure habit logic: scheduling, streaks and rewards. No DOM or storage access here,
// so everything in this file is unit-tested under Node (see tests/).
//
// Habit shape:
//   { id, name, emoji, days: [0-6 weekday numbers, 0 = Sunday], time: "HH:MM" | "", createdAt: "YYYY-MM-DD",
//     pastDays?: [{ until: "YYYY-MM-DD", days }] }
// `days` is the current schedule. `pastDays` (oldest first) records earlier schedules,
// each in effect for days before its `until`, so editing the days never rewrites history.
// Completions shape (kept separately in state):
//   { [habitId]: ["YYYY-MM-DD", ...] }

import { addDays, dateKey, parseKey } from './dates.js';

export function isScheduled(habit, date) {
  const key = dateKey(date);
  return key >= habit.createdAt && daysOn(habit, key).includes(date.getDay());
}

function daysOn(habit, key) {
  const past = (habit.pastDays || []).find((p) => key < p.until);
  return past ? past.days : habit.days;
}

// Returns the habit with `changes` ({ name, emoji, days, time }) applied. Its id and
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
export function currentStreak(habit, completions, today = new Date()) {
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
      if (best >= m) badges.push({ habitId: habit.id, label: `${habit.emoji} ${m}-day streak`, milestone: m });
    }
  }
  const points = checkins * POINTS_PER_CHECKIN + badges.length * POINTS_PER_MILESTONE;
  return { points, level: Math.floor(points / 250) + 1, checkins, badges };
}

export function dueToday(habits, today = new Date()) {
  return habits.filter((h) => isScheduled(h, today));
}

// Habits scheduled for `today` that aren't checked off yet: the count on the app badge.
export function openToday(habits, completions, today = new Date()) {
  return dueToday(habits, today).filter((h) => !isDone(completions, h.id, today));
}
