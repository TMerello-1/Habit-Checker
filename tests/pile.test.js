import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStreak, isOpen, longestStreak, missedYesterday, onToday, openToday, pileCount, remindOn, rewards, sharedStats } from '../src/habits.js';

// 2026-10-12 is a Monday; 2026-10-18 the Sunday after.
const day = (d) => new Date(2026, 9, d);
const pushups = { id: 'p', name: '10 push-ups', emoji: '💪', days: [0, 1, 2, 3, 4, 5, 6], time: '', createdAt: '2026-10-01', pile: 'day' };
const weekly = { ...pushups, pile: 'week' };
const repeat = (key, n) => Array(n).fill(key);

test('the pile counts planned days minus rounds done, today included', () => {
  assert.equal(pileCount(weekly, {}, day(12)), 1);
  assert.equal(pileCount(weekly, { p: ['2026-10-12'] }, day(12)), 0);
  assert.equal(pileCount(weekly, { p: ['2026-10-12'] }, day(14)), 2);
  assert.equal(pileCount(weekly, { p: repeat('2026-10-12', 3) }, day(13)), -1);
});

test('the pile starts at 0 again with each period', () => {
  // Nothing done all week, but Monday the 19th starts a new week.
  assert.equal(pileCount(weekly, {}, day(18)), 7);
  assert.equal(pileCount(weekly, {}, day(19)), 1);
  const monthly = { ...pushups, pile: 'month' };
  assert.equal(pileCount(monthly, {}, day(12)), 12);
  assert.equal(pileCount(monthly, {}, new Date(2026, 10, 1)), 1);
});

test('the pile only counts days from the habit\'s creation and planned days', () => {
  const created = { ...weekly, createdAt: '2026-10-15', days: [1, 3, 5] };
  // Fri 16 is the only planned day since Thursday.
  assert.equal(pileCount(created, {}, day(18)), 1);
});

test('Tom\'s example: skip Monday, two rounds on Tuesday clear the daily pile', () => {
  const c = { p: repeat('2026-10-13', 2) };
  assert.equal(pileCount({ ...pushups, pile: 'week' }, c, day(13)), 0);
});

test('a weekly streak survives catching up on Sunday', () => {
  // Week of the 5th done; week of the 12th: Mon-Thu done, then 3 rounds on Sunday.
  const c = { p: [...['05', '06', '07', '08', '09', '10', '11'].map((d) => `2026-10-${d}`), '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', ...repeat('2026-10-18', 3)] };
  assert.equal(pileCount(weekly, c, day(18)), 0);
  assert.equal(currentStreak(weekly, c, day(18)), 2);
  // Before Sunday's rounds the week isn't over, so the streak still stands at 1.
  const before = { p: c.p.slice(0, -3) };
  assert.equal(currentStreak(weekly, before, day(17)), 1);
  // A week that ended with rounds left breaks it.
  assert.equal(currentStreak(weekly, before, day(19)), 0);
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

test('a pile habit with rounds owed stays open on unplanned days', () => {
  const weekdays = { ...weekly, days: [1, 2, 3, 4, 5] };
  assert.ok(isOpen(weekdays, {}, day(17)));
  assert.deepEqual(onToday([weekdays], {}, day(17)).map((h) => h.id), ['p']);
  assert.deepEqual(openToday([weekdays], { p: repeat('2026-10-12', 5) }, day(17)), []);
});

test('reminders: on planned days while owed, and on the period\'s last day', () => {
  const weekdays = { ...weekly, days: [1, 2, 3, 4, 5] };
  assert.ok(remindOn(weekdays, {}, day(12)));
  assert.ok(!remindOn(weekdays, {}, day(17)));
  assert.ok(remindOn(weekdays, {}, day(18)));
  assert.ok(!remindOn(weekdays, { p: repeat('2026-10-12', 5) }, day(16)));
});

test('only daily piles offer yesterday\'s check-off', () => {
  const morning = new Date(2026, 9, 13, 9);
  assert.deepEqual(missedYesterday([pushups, weekly], {}, morning).map((h) => h.pile), ['day']);
});
