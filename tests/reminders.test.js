import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueReminders } from '../src/reminders.js';

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
