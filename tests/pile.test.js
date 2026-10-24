import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStreak, daysThrough, editHabit, isOpen, longestStreak, missedYesterday, onToday, openToday, pileCount, remindOn, rewards, sharedStats, suggestedStack } from '../src/habits.js';

// 2026-10-12 is a Monday; 2026-10-18 the Sunday after.
const day = (d) => new Date(2026, 9, d);
const pushups = { id: 'p', name: '10 push-ups', emoji: '💪', days: [0, 1, 2, 3, 4, 5, 6], time: '', createdAt: '2026-10-01', pile: 'day' };
const weekly = { ...pushups, pile: 'week', stack: 7 };
const repeat = (key, n) => Array(n).fill(key);

test('a period starts with its stack and every round takes one off', () => {
  assert.equal(pileCount(weekly, {}, day(12)), 7);
  assert.equal(pileCount(weekly, { p: ['2026-10-12'] }, day(14)), 6);
  assert.equal(pileCount(weekly, { p: repeat('2026-10-12', 9) }, day(13)), -2);
});

test('the stack starts over with each period', () => {
  assert.equal(pileCount(weekly, {}, day(18)), 7);
  assert.equal(pileCount(weekly, { p: repeat('2026-10-12', 7) }, day(19)), 7);
  const monthly = { ...pushups, pile: 'month', stack: 40 };
  assert.equal(pileCount(monthly, { p: repeat('2026-10-12', 5) }, day(31)), 35);
  assert.equal(pileCount(monthly, { p: repeat('2026-10-12', 5) }, new Date(2026, 10, 1)), 40);
});

test('weekly and monthly piles ignore the planned days', () => {
  const twice = { ...weekly, days: [1, 3], stack: 10 };
  assert.equal(pileCount(twice, {}, day(12)), 10);
  assert.ok(isOpen(twice, {}, day(13)));
  assert.deepEqual(onToday([twice], {}, day(13)).map((h) => h.id), ['p']);
});

test('a daily pile asks for its stack on each planned day', () => {
  const threes = { ...pushups, days: [1, 2, 3, 4, 5], stack: 3 };
  assert.equal(pileCount(threes, { p: ['2026-10-12'] }, day(12)), 2);
  assert.equal(pileCount(threes, {}, day(17)), 0);
  assert.ok(!isOpen(threes, {}, day(17)));
});

test('Tom\'s Saturday case: the first stack covers only the days left', () => {
  // 30 a week, created on Saturday the 17th: 2 of 7 days left, so 30 × 2/7 rounded up.
  const sat = { ...weekly, stack: 30, createdAt: '2026-10-17' };
  assert.equal(pileCount(sat, {}, day(17)), 9);
  assert.equal(currentStreak(sat, { p: repeat('2026-10-18', 9) }, day(19)), 1);
  assert.equal(pileCount(sat, {}, day(19)), 30);
  assert.equal(pileCount(sat, {}, new Date(2026, 9, 17, 18, 30)), 9);
  assert.equal(daysThrough(new Date(2026, 9, 17, 18, 30), day(18)), 2);
  // Monthly: 60 a month from the 24th, 8 of 31 days left.
  assert.equal(pileCount({ ...sat, pile: 'month', stack: 60, createdAt: '2026-10-24' }, {}, day(24)), 16);
});

test('piles from before stacks ask for one round per planned day of the period', () => {
  const old = { ...weekly, stack: undefined, days: [1, 3, 5] };
  assert.equal(pileCount(old, {}, day(12)), 3);
  assert.equal(pileCount({ ...old, createdAt: '2026-10-15' }, {}, day(15)), 1);
});

test('a weekly streak survives catching up on Sunday', () => {
  const c = { p: [...repeat('2026-10-05', 7), '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', ...repeat('2026-10-18', 3)] };
  assert.equal(pileCount(weekly, c, day(18)), 0);
  assert.equal(currentStreak(weekly, c, day(18)), 2);
  // Before Sunday's rounds the week isn't over, so the streak still stands at 1.
  const before = { p: c.p.slice(0, -3) };
  assert.equal(currentStreak(weekly, before, day(17)), 1);
  // A week that ended with rounds left breaks it.
  assert.equal(currentStreak(weekly, before, day(19)), 0);
});

test('beating the stack earns 5 bonus points a round, up to one extra stack a period', () => {
  assert.equal(rewards([weekly], { p: repeat('2026-10-12', 7) }, day(12)).beaten, 0);
  assert.equal(rewards([weekly], { p: repeat('2026-10-12', 10) }, day(12)).beaten, 3);
  const farmed = rewards([weekly], { p: repeat('2026-10-12', 30) }, day(12));
  assert.equal(farmed.beaten, 7);
  assert.equal(farmed.points, 30 * 10 + 7 * 5);
  // Each week counts on its own.
  assert.equal(rewards([weekly], { p: [...repeat('2026-10-05', 8), ...repeat('2026-10-12', 9)] }, day(12)).beaten, 3);
});

test('a new stack size counts from the current period, earlier ones keep theirs', () => {
  const c = { p: repeat('2026-10-05', 7) };
  const bigger = editHabit(weekly, { stack: 20 }, day(14));
  assert.deepEqual(bigger.pastStacks, [{ until: '2026-10-12', stack: 7 }]);
  assert.equal(pileCount(bigger, c, day(14)), 20);
  assert.equal(currentStreak(bigger, c, day(14)), 1);
  // Changed again the same week: the original size stays on record.
  assert.deepEqual(editHabit(bigger, { stack: 15 }, day(15)).pastStacks, [{ until: '2026-10-12', stack: 7 }]);
  // Changed in the first period: nothing earlier to keep.
  assert.equal(editHabit({ ...weekly, createdAt: '2026-10-13' }, { stack: 20 }, day(14)).pastStacks, undefined);
});

test('the stack suggested when switching the pile on adds up the planned days', () => {
  assert.equal(suggestedStack([1, 3, 5], 'week'), 3);
  assert.equal(suggestedStack([1, 3, 5], 'month', day(12)), 13);
  assert.equal(suggestedStack([1, 3, 5], 'day'), 1);
});

test('the week the habit started in counts from its creation day', () => {
  const created = { ...weekly, createdAt: '2026-10-17' };
  const c = { p: ['2026-10-17', '2026-10-18', '2026-10-19'] };
  assert.equal(currentStreak(created, c, day(19)), 1);
});

test('longest pile streak counts whole periods', () => {
  const week = (start) => Array.from({ length: 7 }, (_, i) => `2026-10-${String(start + i).padStart(2, '0')}`);
  const c = { p: [...week(5), ...week(12)] };
  assert.equal(longestStreak(weekly, c, day(28)), 2);
});

test('a daily pile streak works like a normal one', () => {
  const c = { p: ['2026-10-10', ...repeat('2026-10-12', 2)] };
  // Sunday the 11th was missed: the streak broke even though Monday made it up.
  assert.equal(currentStreak(pushups, c, day(12)), 1);
});

test('every round earns points', () => {
  assert.equal(rewards([weekly], { p: repeat('2026-10-12', 3) }, day(12)).checkins, 3);
});

test('badges and friends count a pile habit\'s periods', () => {
  const c = { p: Array.from({ length: 21 }, (_, i) => `2026-10-${String(5 + i).padStart(2, '0')}`) };
  const r = rewards([weekly], c, day(25));
  assert.deepEqual(r.badges.map((b) => [b.milestone, b.unit]), [[3, 'week']]);
  assert.equal(sharedStats([weekly], c, day(25)).streak, 21);
});

test('reminders: weekly piles every day while rounds are left, daily piles on planned days', () => {
  assert.ok(remindOn(weekly, {}, day(14)));
  assert.ok(!remindOn(weekly, { p: repeat('2026-10-12', 7) }, day(16)));
  const weekdays = { ...pushups, days: [1, 2, 3, 4, 5] };
  assert.ok(remindOn(weekdays, {}, day(12)));
  assert.ok(!remindOn(weekdays, {}, day(17)));
});

test('only daily piles offer yesterday\'s check-off', () => {
  const morning = new Date(2026, 9, 13, 9);
  assert.deepEqual(missedYesterday([pushups, weekly], {}, morning).map((h) => h.pile), ['day']);
});

test('switching the pile on starts it that day', () => {
  // Done every day but Tuesday the 13th; the pile goes on on Thursday the 15th.
  const plain = { ...pushups, pile: undefined };
  const on = editHabit(plain, { pile: 'week', stack: 7 }, day(15));
  assert.equal(on.pileSince, '2026-10-15');
  // Thursday to Sunday: 4 of 7 days, so a stack of 4. Rounds from before don't count.
  const c = { p: ['2026-10-12', '2026-10-14', '2026-10-15'] };
  assert.equal(pileCount(on, c, day(15)), 3);
  // The new week streak starts fresh: this week isn't over yet.
  assert.equal(currentStreak(on, c, day(15)), 0);
});

test('day badges from before the pile stay', () => {
  const plain = { ...pushups, pile: undefined };
  const c = { p: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'] };
  const on = editHabit(plain, { pile: 'week' }, day(5));
  assert.deepEqual(rewards([on], c, day(5)).badges.map((b) => [b.milestone, b.unit]), [[3, 'day']]);
});

test('switching the pile off or changing its period', () => {
  const on = editHabit({ ...pushups, pile: undefined }, { pile: 'week' }, day(15));
  assert.equal(editHabit(on, { pile: undefined }, day(16)).pileSince, undefined);
  assert.equal(editHabit(on, { pile: 'month' }, day(20)).pileSince, '2026-10-20');
  assert.equal(editHabit(on, { name: 'Push-ups' }, day(20)).pileSince, '2026-10-15');
  // Switched on the day it was created: nothing to keep apart.
  assert.equal(editHabit({ ...pushups, pile: undefined }, { pile: 'day' }, day(1)).pileSince, undefined);
});
