import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportData, parseImport } from '../src/transfer.js';

const state = {
  version: 1,
  habits: [{ id: 'a', name: 'Run', emoji: '🏃', days: [1, 3, 5], time: '07:00', createdAt: '2026-10-01' }],
  completions: { a: ['2026-10-12', '2026-10-14'] },
  notified: { a: '2026-10-14' },
};

test('round-trips habits and completions, leaving reminder bookkeeping behind', () => {
  assert.deepEqual(parseImport(exportData(state)), { habits: state.habits, completions: state.completions });
  assert.ok(!exportData(state).includes('notified'));
});

test('tolerates whitespace around pasted text', () => {
  assert.equal(parseImport(`\n  ${exportData(state)}  \n`).habits.length, 1);
});

test('rejects text that is not exported data', () => {
  for (const bad of ['', 'hello', '{}', '[]', '{"habits":[],"completions":{}}', 'null']) {
    assert.throws(() => parseImport(bad), /doesn't look like/);
  }
});

test('rejects damaged habits and newer versions', () => {
  const damaged = JSON.stringify({ format: 'habit-checker', version: 1, habits: [{ id: 'a' }], completions: {} });
  assert.throws(() => parseImport(damaged), /damaged/);
  const newer = JSON.stringify({ format: 'habit-checker', version: 2, habits: [], completions: {} });
  assert.throws(() => parseImport(newer), /newer version/);
});
