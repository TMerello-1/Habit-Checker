import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueReminders, reminderTitle } from '../src/reminders.js';

const habit = { id: 'a', name: 'Read', emoji: '📚', days: [1], time: '08:00', createdAt: '2026-10-01' };
const monday9am = new Date(2026, 9, 12, 9, 0);

test('reminder is due once its time has passed', () => {
  const state = { habits: [habit], completions: {}, notified: {} };
  assert.deepEqual(dueReminders(state, monday9am).map((h) => h.id), ['a']);
});

test('no reminder before the time, when done, or when already sent', () => {
  const early = new Date(2026, 9, 12, 7, 59);
  assert.equal(dueReminders({ habits: [habit], completions: {}, notified: {} }, early).length, 0);
  assert.equal(dueReminders({ habits: [habit], completions: { a: ['2026-10-12'] }, notified: {} }, monday9am).length, 0);
  assert.equal(dueReminders({ habits: [habit], completions: {}, notified: { a: '2026-10-12' } }, monday9am).length, 0);
});

test('a private habit\'s reminder does not show its name', () => {
  assert.equal(reminderTitle(habit), '📚 Time for: Read');
  assert.equal(reminderTitle({ ...habit, private: true }), '🔒 Time for a private habit');
});

test('a weekly pile habit is reminded on its last day while it owes rounds', () => {
  const pile = { ...habit, days: [1, 2, 3, 4, 5], pile: 'week' };
  const sunday9am = new Date(2026, 9, 18, 9, 0);
  assert.equal(dueReminders({ habits: [pile], completions: {}, notified: {} }, sunday9am).length, 1);
  const done = { a: Array(5).fill('2026-10-16') };
  assert.equal(dueReminders({ habits: [pile], completions: done, notified: {} }, sunday9am).length, 0);
});
