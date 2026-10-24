// Pure habit logic: scheduling, streaks and rewards. No DOM or storage access here,
// so everything in this file is unit-tested under Node (see tests/).
//
// Habit shape:
//   { id, name, emoji, days: [0-6 weekday numbers, 0 = Sunday], time: "HH:MM" | "", createdAt: "YYYY-MM-DD",
//     private?: true, pastDays?: [{ until: "YYYY-MM-DD", days }], pile?: "day" | "week" | "month",
//     pileSince?: "YYYY-MM-DD", stack?: n, pastStacks?: [{ until: "YYYY-MM-DD", stack }] }
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
// takes effect today; the old one is kept in pastDays for the days before. Switching the
// pile on (or to another period) starts it today: earlier days keep the old rules. A new
// stack size counts from the current period on; earlier periods keep theirs in pastStacks.
export function editHabit(habit, changes, today = new Date()) {
  const next = { ...habit, ...changes, id: habit.id, createdAt: habit.createdAt };
  const key = dateKey(today);
  if ((habit.pile || '') !== (next.pile || '')) {
    if (next.pile && key > habit.createdAt) next.pileSince = key;
    else delete next.pileSince;
    delete next.pastStacks;
  } else if (next.pile && next.stack !== habit.stack) {
    const until = dateKey(periodStart(next.pile, today));
    if (until > (habit.pileSince || habit.createdAt)) {
      // Changed again this period: this period already uses the new size, so just replace it.
      const past = (habit.pastStacks || []).filter((p) => p.until < until);
      const prev = habit.pastStacks?.find((p) => p.until === until);
      next.pastStacks = [...past, prev || { until, stack: habit.stack }];
    }
  }
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

// Streak awards. The habit's streak unit picks the kind: medals for days, trophies for
// weeks, laurels for months, each with milestones in that unit. An award pays about what a
// medal for the same stretch of time pays, so keeping a weekly or monthly streak is worth
// as much as a daily one.
export const AWARDS = {
  day: { emoji: '🏅', steps: [[3, 25], [7, 50], [14, 100], [30, 200], [60, 350], [100, 500], [200, 750], [365, 1000]] },
  week: { emoji: '🏆', steps: [[1, 50], [2, 100], [4, 200], [8, 350], [12, 500], [26, 750], [52, 1000]] },
  month: { emoji: '🏵️', steps: [[1, 200], [2, 350], [3, 500], [6, 750], [9, 875], [12, 1000], [24, 1500]] },
};
export const POINTS_PER_CHECKIN = 10;
export const POINTS_PER_BEATEN = 5;
// Clearing a whole weekly or monthly stack earns this on top of its rounds.
export const CLEAR_BONUS = { week: 30, month: 120 };

export function milestones(unit) {
  return AWARDS[unit].steps.map(([m]) => m);
}

export function awardPoints(unit, milestone) {
  return AWARDS[unit].steps.find(([m]) => m === milestone)?.[1] ?? 0;
}

// The colour ring around an award, from how many days its streak took.
const TIERS = [[360, 'diamond'], [180, 'platinum'], [60, 'gold'], [14, 'silver'], [0, 'bronze']];

export function awardTier(unit, milestone) {
  const days = milestone * DAYS_PER[unit];
  return TIERS.find(([d]) => days >= d)[1];
}

// Points grow with the streak a check-in builds on, counted in days (weeks ×7, months ×30).
export function streakMultiplier(days) {
  return days >= 100 ? 3 : days >= 30 ? 2 : days >= 7 ? 1.5 : 1;
}

// The multiplier the habit's current streak gives, for the Progress sheet.
export function streakBonus(habit, completions, today = new Date()) {
  return streakMultiplier(currentStreak(habit, completions, today) * DAYS_PER[streakUnit(habit)]);
}

// Rewards are derived from history every time rather than stored, so un-checking a
// mistaken tap takes the points back and nothing can drift out of sync.
export function rewards(habits, completions, today = new Date()) {
  const badges = [];
  let checkins = 0;
  let beaten = 0;
  let points = 0;
  for (const habit of habits) {
    checkins += (completions[habit.id] || []).length;
    const earned = checkinPoints(habit, completions, today);
    points += earned.points;
    beaten += earned.beaten;
    const unit = streakUnit(habit);
    const best = longestStreak(habit, completions, today);
    for (const m of milestones(unit)) if (best >= m) badges.push({ habitId: habit.id, milestone: m, unit });
    // Day medals earned before the pile was switched on are kept.
    if (habit.pile && habit.pileSince) {
      const before = longestStreak({ ...habit, pile: undefined }, completions, addDays(parseKey(habit.pileSince), -1));
      const has = (m) => badges.some((b) => b.habitId === habit.id && b.unit === 'day' && b.milestone === m);
      for (const m of milestones('day')) if (before >= m && !has(m)) badges.push({ habitId: habit.id, milestone: m, unit: 'day' });
    }
  }
  for (const b of badges) points += awardPoints(b.unit, b.milestone);
  return { points, level: levelProgress(points).level, checkins, beaten, badges };
}

// A habit's check-in points: each check-in earns 10 times the multiplier of the streak
// built before it. Stack rounds use the periods cleared in a row before theirs, and so do
// rounds beyond the stack (5 each, up to one extra stack per period, so tapping on and on
// doesn't farm points) and the bonus for clearing a weekly or monthly stack.
function checkinPoints(habit, completions, today) {
  const list = completions[habit.id] || [];
  let points = 0;
  let counted = 0;
  let beaten = 0;
  // Before a pile was switched on, the habit was a plain one.
  const plainUntil = !habit.pile ? today : habit.pileSince ? addDays(parseKey(habit.pileSince), -1) : null;
  if (plainUntil) {
    const per = new Map();
    for (const k of list) per.set(k, (per.get(k) || 0) + 1);
    const todayKey = dateKey(today);
    let run = 0;
    for (let day = parseKey(habit.createdAt); day <= plainUntil; day = addDays(day, 1)) {
      const key = dateKey(day);
      const n = per.get(key) || 0;
      points += n * POINTS_PER_CHECKIN * streakMultiplier(run);
      counted += n;
      if (!isScheduled(habit, day)) continue;
      if (n) run++;
      else if (key !== todayKey) run = 0;
    }
  }
  if (habit.pile) {
    const current = dateKey(periodStart(habit.pile, today));
    let run = 0;
    for (let day = parseKey(habit.pileSince || habit.createdAt); day <= today; ) {
      const p = tally(habit, completions, day);
      const x = streakMultiplier(run * DAYS_PER[habit.pile]);
      const extra = Math.min(Math.max(0, p.done - p.planned), p.planned);
      const cleared = p.planned && p.done >= p.planned;
      points += x * (p.done * POINTS_PER_CHECKIN + extra * POINTS_PER_BEATEN + (cleared ? CLEAR_BONUS[habit.pile] || 0 : 0));
      counted += p.done;
      beaten += extra;
      if (cleared) run++;
      else if (p.planned && dateKey(p.start) !== current) run = 0;
      day = addDays(periodEnd(habit.pile, day), 1);
    }
  }
  // Check-ins outside the habit's days (none in normal use) count without a multiplier.
  points += Math.max(0, list.length - counted) * POINTS_PER_CHECKIN;
  return { points: Math.round(points), beaten };
}

export function dueToday(habits, today = new Date()) {
  return habits.filter((h) => isScheduled(h, today));
}

// Today's list: the scheduled habits, weekly and monthly piles every day, plus daily piles
// that still owe rounds on a day they aren't planned for.
export function onToday(habits, completions, today = new Date()) {
  return habits.filter((h) => plannedOn(h, today) || (h.pile && pileCount(h, completions, today) > 0));
}

// Weekly and monthly piles have no planned days: their stack can be cleared on any day.
function plannedOn(habit, date) {
  if (habit.pile === 'week' || habit.pile === 'month') return dateKey(date) >= habit.createdAt;
  return isScheduled(habit, date);
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
// for (any day for weekly and monthly piles), and a daily pile also on an unplanned day
// while it still owes rounds.
export function remindOn(habit, completions, date = new Date()) {
  if (!isOpen(habit, completions, date)) return false;
  return plannedOn(habit, date) || Boolean(habit.pile);
}

// What friends see of you: the level from your own screen and your best current streak.
// Private habits don't count toward the streak, so friends learn nothing about them.
// A pile habit's streak counts weeks or months, so it's turned into days to compare.
export function sharedStats(habits, completions, today = new Date()) {
  const streaks = habits.filter((h) => !h.private).map((h) => currentStreak(h, completions, today) * DAYS_PER[streakUnit(h)]);
  return { level: rewards(habits, completions, today).level, streak: Math.max(0, ...streaks) };
}

export const POINTS_PER_LEVEL = 250;
export const LEVEL_STEP = 50;

// Each level costs 50 points more than the one before (250, 300, 350, ...), so the
// bigger rewards of long streaks don't race through the levels. `size` is what the
// current level costs, for the bar and "N pts to level X" in the header.
export function levelProgress(points) {
  let level = 1;
  let into = points;
  let size = POINTS_PER_LEVEL;
  while (into >= size) {
    into -= size;
    level++;
    size += LEVEL_STEP;
  }
  return { level, into, size, toNext: size - into };
}

// One entry per habit and kind of award: its highest milestone and the next one to aim
// for (null once all are earned). Keeps the Progress sheet short as awards pile up.
export function bestBadges(badges) {
  const best = new Map();
  for (const b of badges) {
    const key = `${b.habitId} ${b.unit}`;
    if (b.milestone > (best.get(key)?.milestone ?? 0)) best.set(key, b);
  }
  return [...best.values()].map(({ habitId, milestone, unit }) => ({
    habitId,
    milestone,
    unit,
    next: milestones(unit).find((m) => m > milestone) ?? null,
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

// Pile habits: each period (day, week from Monday, or month) starts with a stack of
// rounds (`habit.stack`), and every round done takes one off. Above 0 is rounds still to
// do, below 0 is rounds beaten. A daily pile's stack is due on each planned day; weekly
// and monthly piles ignore the days. The streak counts periods that ended at 0 or below.
// Days before `pileSince` (the day the pile was switched on) don't count toward it, and
// the period it starts in gets a stack cut down to the days left (30 a week, started on
// Saturday: 9). Habits from before stacks existed have no `stack`: their periods ask for
// one round per planned day.
export const PILE_PERIODS = ['day', 'week', 'month'];
export const MAX_STACK = 999;
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

// Calendar days from `from` to `to`, both included, whatever their time of day.
export function daysThrough(from, to) {
  const utc = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(to) - utc(from)) / 86400000) + 1;
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

// The pile's first day in the period around `date`.
function pileFrom(habit, date) {
  const start = periodStart(habit.pile, date);
  const since = parseKey(habit.pileSince || habit.createdAt);
  return since > start ? since : start;
}

// The stack size for the period starting on `startKey`.
function stackOn(habit, startKey) {
  const past = (habit.pastStacks || []).find((p) => startKey < p.until);
  return past ? past.stack : habit.stack;
}

// The stack the period around `date` starts with.
export function periodStack(habit, date) {
  const start = periodStart(habit.pile, date);
  const end = periodEnd(habit.pile, date);
  const from = pileFrom(habit, date);
  const n = stackOn(habit, dateKey(start));
  if (!n) return plannedBetween(habit, from, end);
  if (habit.pile === 'day') return isScheduled(habit, date) ? n : 0;
  if (from > end) return 0;
  return Math.ceil((n * daysThrough(from, end)) / daysThrough(start, end));
}

// A starting stack to suggest when the pile is switched on: what the planned days add up to.
export function suggestedStack(days, period, today = new Date()) {
  if (period === 'week') return days.length || 7;
  if (period === 'month') return plannedBetween({ days, createdAt: '' }, periodStart('month', today), periodEnd('month', today)) || 30;
  return 1;
}

// Rounds still to do this period: its stack minus rounds done so far.
export function pileCount(habit, completions, date = new Date()) {
  const start = pileFrom(habit, date);
  return periodStack(habit, date) - roundsBetween(completions, habit.id, dateKey(start), dateKey(date));
}

// What a whole period asked for and what was done in it.
function tally(habit, completions, date) {
  const start = pileFrom(habit, date);
  const end = periodEnd(habit.pile, date);
  return { start: periodStart(habit.pile, date), planned: periodStack(habit, date), done: roundsBetween(completions, habit.id, dateKey(start), dateKey(end)) };
}

// Periods in a row with the pile cleared. The current period counts once all of its
// rounds are done, and doesn't break the streak before it's over. Periods with nothing
// planned are skipped.
function pileStreak(habit, completions, today) {
  const created = parseKey(habit.pileSince || habit.createdAt);
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
  for (let day = parseKey(habit.pileSince || habit.createdAt); day <= today; ) {
    const p = tally(habit, completions, day);
    if (p.planned && p.done >= p.planned) best = Math.max(best, ++run);
    else if (p.planned && dateKey(p.start) !== current) run = 0;
    day = addDays(periodEnd(habit.pile, day), 1);
  }
  return best;
}
