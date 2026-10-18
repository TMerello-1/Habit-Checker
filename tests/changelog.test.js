import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerChange, CHANGELOG, changesByDate, LATEST } from '../src/changelog.js';

test('the changelog is newest first, with unique versions and both languages', () => {
  const versions = CHANGELOG.map((c) => c.v);
  assert.deepEqual(versions, [...versions].sort((a, b) => b - a));
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(LATEST, versions[0]);
  for (const c of CHANGELOG) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(c.en && c.de, `missing text for ${c.v}`);
  }
});

test('the banner shows the newest notable change this device has not seen', () => {
  const notable = CHANGELOG.find((c) => c.notable);
  assert.equal(bannerChange(LATEST, true), null);
  assert.equal(bannerChange(notable.v - 1, true), notable);
  assert.equal(bannerChange(notable.v - 1, false), notable);
});

test('new users get no banner; existing users without a record see the latest notable change', () => {
  assert.equal(bannerChange(null, false), null);
  assert.equal(bannerChange(null, true), CHANGELOG.find((c) => c.notable));
});

test('changesByDate groups entries by day in the requested language', () => {
  const groups = changesByDate('de');
  assert.equal(groups[0].date, CHANGELOG[0].date);
  assert.equal(groups[0].items[0], CHANGELOG[0].de);
  assert.equal(groups.flatMap((g) => g.items).length, CHANGELOG.length);
  assert.equal(new Set(groups.map((g) => g.date)).size, groups.length);
  assert.equal(changesByDate('fr')[0].items[0], CHANGELOG[0].en);
});
