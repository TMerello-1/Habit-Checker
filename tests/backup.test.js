import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupText, decryptBackup, encryptBackup } from '../src/backup.js';

const code = 'ABCDE12345FGHJK67890';
const state = {
  version: 1,
  habits: [{ id: 'a', name: 'Secret run', emoji: '🏃', days: [1, 3, 5], createdAt: '2026-10-01', private: true }],
  completions: { a: ['2026-10-12', '2026-10-14'] },
  notified: { a: '2026-10-14' },
};

test('a backup opens with its recovery code and brings back habits, history and nicknames', async () => {
  const data = await encryptBackup(code, backupText(state, { f1: 'Mum' }));
  assert.match(data, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(!atob(data).includes('Secret run'));
  assert.deepEqual(await decryptBackup(code, data), { version: 1, habits: state.habits, completions: state.completions, sync: {}, nicknames: { f1: 'Mum' } });
});

test('another code cannot open it', async () => {
  const data = await encryptBackup(code, backupText(state));
  await assert.rejects(decryptBackup('ZZZZZ12345FGHJK67890', data));
});

test('each backup is encrypted afresh', async () => {
  const text = backupText(state);
  assert.notEqual(await encryptBackup(code, text), await encryptBackup(code, text));
});

test('a large history fits', async () => {
  const dates = Array.from({ length: 2000 }, (_, i) => `2026-01-${String(i).padStart(4, '0')}`);
  const big = { ...state, completions: { a: dates } };
  const back = await decryptBackup(code, await encryptBackup(code, backupText(big)));
  assert.equal(back.completions.a.length, 2000);
});

test('the sync stamps travel with the backup', async () => {
  const sync = { habits: { a: '2026-10-21T10:00:00.000Z' }, deleted: {}, days: {} };
  const back = await decryptBackup(code, await encryptBackup(code, backupText({ ...state, sync })));
  assert.deepEqual(back.sync, sync);
});
