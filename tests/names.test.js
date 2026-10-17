import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCode, INVITE_LENGTH, isCode, normalizeCode, randomCode, RECOVERY_LENGTH } from '../src/codes.js';
import { ADJECTIVES, ANIMALS, initials, profileName, randomName } from '../src/names.js';

test('names read naturally in English and German, with a number when there is one', () => {
  assert.equal(profileName({ adj: 0, animal: 0, num: 0 }), 'Sleepy Otter');
  assert.equal(profileName({ adj: 0, animal: 0, num: 42 }), 'Sleepy Otter 42');
  assert.equal(profileName({ adj: 0, animal: 0, num: 0 }, 'de'), 'Schläfriger Otter');
  assert.equal(profileName({ adj: 0, animal: 9, num: 0 }, 'de'), 'Schläfrige Eule');
  assert.equal(profileName({ adj: 0, animal: 16, num: 7 }, 'de'), 'Schläfriges Lamm 7');
  assert.equal(initials({ adj: 0, animal: 0, num: 42 }), 'SO');
  assert.equal(initials({ adj: 1, animal: 9, num: 0 }, 'de'), 'FE');
});

test('every list entry is complete and unique', () => {
  for (const list of [ADJECTIVES, ANIMALS]) {
    assert.equal(new Set(list.map((x) => x[0])).size, list.length);
    for (const entry of list) assert.ok(entry.every((w) => typeof w === 'string' && w.length > 0));
  }
  for (const a of ANIMALS) assert.ok(['m', 'f', 'n'].includes(a[2]), a[0]);
});

test('randomName picks positions inside both lists', () => {
  assert.deepEqual(randomName(() => 0), { adj: 0, animal: 0, num: 0 });
  const last = randomName(() => 0.9999);
  assert.equal(last.adj, ADJECTIVES.length - 1);
  assert.equal(last.animal, ANIMALS.length - 1);
});

test('codes are readable, and typing mistakes in them are forgiven', () => {
  const code = randomCode(RECOVERY_LENGTH);
  assert.ok(isCode(code, RECOVERY_LENGTH));
  assert.match(formatCode(code), /^\w{5}-\w{5}-\w{5}-\w{5}$/);
  assert.equal(formatCode('ABCD1234'), 'ABCD-1234');
  assert.equal(normalizeCode(' abcd-o1il '), 'ABCD0111');
  assert.ok(isCode(normalizeCode('abcd-1234'), INVITE_LENGTH));
  assert.ok(!isCode('ABCD123U', INVITE_LENGTH));
  assert.ok(!isCode('ABCD123', INVITE_LENGTH));
});
