import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installPlatform, installSteps } from '../src/install.js';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  edge: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  chrome: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
};

test('detects the platforms that need manual install steps', () => {
  assert.equal(installPlatform(UA.iphone), 'ios');
  assert.equal(installPlatform(UA.ipad, 5), 'ios');
  assert.equal(installPlatform(UA.edge), 'edge-android');
  assert.equal(installPlatform(UA.samsung), 'samsung');
  assert.equal(installPlatform(UA.firefox), 'firefox-android');
});

test('a desktop Mac and plain Chrome fall back to generic steps', () => {
  assert.equal(installPlatform(UA.ipad, 0), 'other');
  assert.equal(installPlatform(UA.chrome), 'other');
});

test('every platform has steps', () => {
  assert.match(installSteps('ios'), /Add to Home Screen/);
  assert.match(installSteps('edge-android'), /Add to phone/);
  assert.equal(installSteps('unknown'), installSteps('other'));
});
