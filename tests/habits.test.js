import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStreak, editHabit, longestStreak, openToday, rewards, sharedStats } from '../src/habits.js';

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

test('editing keeps id, createdAt and streak', () => {
  const c = { a: ['2026-10-10', '2026-10-11', '2026-10-12'] };
  const edited = editHabit(daily, { name: 'Jog', emoji: '🚶', days: daily.days, time: '07:00', id: 'x' }, day(12));
  assert.equal(edited.id, 'a');
  assert.equal(edited.createdAt, '2026-10-01');
  assert.equal(edited.name, 'Jog');
  assert.equal(edited.pastDays, undefined);
  assert.equal(currentStreak(edited, c, day(12)), 3);
});

test('changing days applies from today and leaves past days alone', () => {
  // MWF habit done Wed 7, Fri 9, Mon 12. Switching to daily on Tue 13 must not
  // count the old Tue/Thu/weekend as misses.
  const c = { b: ['2026-10-07', '2026-10-09', '2026-10-12'] };
  const edited = editHabit(mwf, { days: daily.days }, day(13));
  assert.deepEqual(edited.pastDays, [{ until: '2026-10-13', days: [1, 3, 5] }]);
  assert.equal(currentStreak(edited, c, day(13)), 3);
  assert.equal(longestStreak(edited, c, day(13)), 3);
  // From today on the new days count: missing Tue 13 breaks it on Wed 14.
  assert.equal(currentStreak(edited, c, day(14)), 0);
});

test('editing days twice in one day keeps the original past schedule', () => {
  const once = editHabit(mwf, { days: daily.days }, day(13));
  const twice = editHabit(once, { days: [2, 4] }, day(13));
  assert.deepEqual(twice.days, [2, 4]);
  assert.deepEqual(twice.pastDays, [{ until: '2026-10-13', days: [1, 3, 5] }]);
});

test('openToday lists scheduled habits not yet done', () => {
  // Sun 11: the Mon/Wed/Fri habit isn't scheduled, so only the daily one counts.
  assert.deepEqual(openToday([daily, mwf], {}, day(11)).map((h) => h.id), ['a']);
  // Mon 12: both scheduled, daily already done.
  assert.deepEqual(openToday([daily, mwf], { a: ['2026-10-12'] }, day(12)).map((h) => h.id), ['b']);
});

test('sharedStats gives friends the level and the best streak, leaving private habits out', () => {
  const today = new Date(2026, 9, 14);
  const habits = [
    { id: 'a', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-10-01' },
    { id: 'b', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-10-01', private: true },
  ];
  const completions = {
    a: ['2026-10-13', '2026-10-14'],
    b: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'],
  };
  assert.deepEqual(sharedStats(habits, completions, today), { level: 1, streak: 2 });
  assert.deepEqual(sharedStats([], {}, today), { level: 1, streak: 0 });
});
