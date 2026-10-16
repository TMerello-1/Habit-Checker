import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStreak, longestStreak, rewards } from '../src/habits.js';

// 2026-10-12 is a Monday.
const day = (d) => new Date(2026, 9, d);
const daily = { id: 'a', name: 'Run', emoji: '🏃', days: [0, 1, 2, 3, 4, 5, 6], time: '', createdAt: '2026-10-01' };
const mwf = { ...daily, id: 'b', days: [1, 3, 5] };

test('streak counts consecutive completed days', () => {
  const c = { a: ['2026-10-10', '2026-10-11', '2026-10-12'] };
  assert.equal(currentStreak(daily, c, day(12)), 3);
});

test('unfinished today does not break the streak', () => {
  const c = { a: ['2026-10-10', '2026-10-11'] };
  assert.equal(currentStreak(daily, c, day(12)), 2);
});

test('a missed day resets the streak', () => {
  const c = { a: ['2026-10-09', '2026-10-11'] };
  assert.equal(currentStreak(daily, c, day(12)), 1);
});

test('unscheduled days are skipped', () => {
  // Fri 9, Mon 12 done; the weekend in between is not scheduled.
  const c = { b: ['2026-10-07', '2026-10-09', '2026-10-12'] };
  assert.equal(currentStreak(mwf, c, day(12)), 3);
});

test('longest streak survives a later break', () => {
  const c = { a: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06'] };
  assert.equal(longestStreak(daily, c, day(12)), 4);
});

test('rewards give points per check-in plus milestone badges', () => {
  const c = { a: ['2026-10-10', '2026-10-11', '2026-10-12'] };
  const r = rewards([daily], c, day(12));
  assert.equal(r.checkins, 3);
  assert.equal(r.badges.length, 1);
  assert.equal(r.points, 3 * 10 + 50);
});
