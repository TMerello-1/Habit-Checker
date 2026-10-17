import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { installSteps } from '../src/install.js';
import { pickLang, setLang, STRINGS, t } from '../src/i18n.js';
import { parseImport } from '../src/transfer.js';

afterEach(() => setLang('en'));

test('pickLang takes the first preferred language the app has, else English', () => {
  assert.equal(pickLang(['de-DE', 'en-US']), 'de');
  assert.equal(pickLang(['de-AT']), 'de');
  assert.equal(pickLang(['fr-FR', 'de-CH', 'en']), 'de');
  assert.equal(pickLang(['en-GB', 'de']), 'en');
  assert.equal(pickLang(['fr', 'es']), 'en');
  assert.equal(pickLang([]), 'en');
});

test('German has every English string, with the same placeholders', () => {
  const vars = (s) => JSON.stringify(s).match(/\{\w+\}/g)?.sort() ?? [];
  for (const [key, en] of Object.entries(STRINGS.en)) {
    assert.ok(key in STRINGS.de, `missing German for ${key}`);
    assert.deepEqual(vars(STRINGS.de[key]), vars(en), key);
  }
  assert.equal(STRINGS.de.weekdays.length, 7);
});

test('t fills placeholders, picks plurals and falls back to the key', () => {
  assert.equal(t('todaySummary', { done: 1, total: 3 }), '1 of 3 done');
  assert.equal(t('imported', { n: 1 }), 'Imported 1 habit');
  assert.equal(t('imported', { n: 2 }), 'Imported 2 habits');
  assert.equal(t('no-such-key'), 'no-such-key');
  setLang('de');
  assert.equal(t('todaySummary', { done: 1, total: 3 }), '1 von 3 erledigt');
  assert.equal(t('replaceConfirm', { n: 1 }), 'Deine 1 Gewohnheit ersetzen?');
  assert.equal(t('weekdays')[1], 'Mo');
});

test('install steps and import errors follow the language', () => {
  setLang('de');
  assert.match(installSteps('ios'), /Zum Home-Bildschirm/);
  assert.equal(installSteps('unknown'), installSteps('other'));
  assert.throws(() => parseImport('nope'), /kopierten Habit-Checker-Daten/);
});
