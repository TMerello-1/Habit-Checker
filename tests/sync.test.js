import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeStates, sameData, stamp } from '../src/sync.js';

const habit = (id, name = id) => ({ id, name, emoji: '✅', days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-10-01' });
const base = () => ({ version: 1, habits: [habit('a'), habit('b')], completions: { a: ['2026-10-18'] }, notified: {} });
const T1 = '2026-10-21T10:00:00.000Z';
const T2 = '2026-10-21T11:00:00.000Z';
const T3 = '2026-10-21T12:00:00.000Z';

// Applies `change` to a copy of `state` and stamps it, like app.js's commit().
function edit(state, now, change) {
  const next = structuredClone(state);
  change(next);
  return stamp(state, next, now);
}

test('stamps new, edited and deleted habits and changed days', () => {
  const s = base();
  const next = edit(s, T1, (n) => {
    n.habits[0].name = 'Read';
    n.habits = n.habits.filter((h) => h.id !== 'b');
    n.habits.push(habit('c'));
    n.completions.a.push('2026-10-21');
  });
  assert.deepEqual(next.sync, {
    habits: { a: T1, c: T1 },
    deleted: { b: T1 },
    days: { a: { '2026-10-21': T1 } },
  });
});

test('check-ins on two phones on different days both survive', () => {
  const s = base();
  const phone1 = edit(s, T1, (n) => n.completions.a.push('2026-10-20'));
  const phone2 = edit(s, T2, (n) => {
    n.completions.a.push('2026-10-21');
    n.completions.b = ['2026-10-21'];
  });
  const merged = mergeStates(phone1, phone2);
  assert.deepEqual(merged.completions, { a: ['2026-10-18', '2026-10-20', '2026-10-21'], b: ['2026-10-21'] });
  assert.ok(sameData(mergeStates(phone2, phone1), merged));
});

test('unchecking a day wins over an older check-in of that day', () => {
  const s = edit(base(), T1, (n) => n.completions.a.push('2026-10-21'));
  const phone2 = edit(s, T2, (n) => (n.completions.a = n.completions.a.filter((d) => d !== '2026-10-21')));
  assert.deepEqual(mergeStates(s, phone2).completions.a, ['2026-10-18']);
  assert.deepEqual(mergeStates(phone2, s).completions.a, ['2026-10-18']);
});

test('rounds of a pile habit count per day', () => {
  const s = base();
  const phone1 = edit(s, T2, (n) => n.completions.a.push('2026-10-21', '2026-10-21'));
  const phone2 = edit(s, T1, (n) => n.completions.a.push('2026-10-21'));
  assert.deepEqual(mergeStates(phone2, phone1).completions.a, ['2026-10-18', '2026-10-21', '2026-10-21']);
});

test('the newer edit of a habit wins, and a deletion wins over older edits only', () => {
  const s = base();
  const renamed = edit(s, T1, (n) => (n.habits[0].name = 'Old name'));
  const renamedLater = edit(s, T2, (n) => (n.habits[0].name = 'New name'));
  assert.equal(mergeStates(renamed, renamedLater).habits[0].name, 'New name');
  assert.equal(mergeStates(renamedLater, renamed).habits[0].name, 'New name');

  const deleted = edit(s, T2, (n) => (n.habits = n.habits.filter((h) => h.id !== 'a')));
  assert.deepEqual(mergeStates(renamed, deleted).habits.map((h) => h.id), ['b']);
  assert.ok(!('a' in mergeStates(renamed, deleted).completions));
  const editedAfter = edit(s, T3, (n) => (n.habits[0].name = 'Back'));
  assert.deepEqual(mergeStates(deleted, editedAfter).habits.map((h) => h.id), ['b', 'a']);
});

test('a habit added on one phone appears on the other, after its own habits', () => {
  const s = base();
  const phone1 = edit(s, T1, (n) => n.habits.push(habit('c')));
  const phone2 = edit(s, T2, (n) => n.habits.unshift(habit('d')));
  assert.deepEqual(mergeStates(phone2, phone1).habits.map((h) => h.id), ['d', 'a', 'b', 'c']);
});

test('history from before sync (no stamps) is combined, keeping the higher count', () => {
  const mine = { version: 1, habits: [habit('a')], completions: { a: ['2026-10-01', '2026-10-02'] }, notified: { a: '2026-10-02' } };
  const theirs = { version: 1, habits: [habit('a'), habit('b')], completions: { a: ['2026-10-02', '2026-10-03'], b: ['2026-10-03'] }, notified: {} };
  const merged = mergeStates(mine, theirs);
  assert.deepEqual(merged.habits.map((h) => h.id), ['a', 'b']);
  assert.deepEqual(merged.completions, { a: ['2026-10-01', '2026-10-02', '2026-10-03'], b: ['2026-10-03'] });
  assert.deepEqual(merged.notified, { a: '2026-10-02' });
});

test('merging a state with itself changes nothing, whatever the order of check-ins', () => {
  const s = edit(base(), T1, (n) => n.completions.a.unshift('2026-10-21'));
  assert.ok(sameData(mergeStates(s, s), s));
});
