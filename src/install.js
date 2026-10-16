// "Install app" help. Chromium browsers hand app.js a beforeinstallprompt event and
// show their own dialog; everywhere else (iPhone, Samsung Internet, Firefox, or a
// Chromium browser that hasn't offered the prompt) we show the menu steps instead.
// Pure so it can be tested under Node; app.js owns the button.

import { t } from './i18n.js';

export function installPlatform(userAgent, maxTouchPoints = 0) {
  // iPadOS reports a Mac user agent, so a touch-screen "Mac" is an iPad.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(userAgent)) {
    if (/EdgA\//.test(userAgent)) return 'edge-android';
    if (/SamsungBrowser\//.test(userAgent)) return 'samsung';
    if (/Firefox\//.test(userAgent)) return 'firefox-android';
  }
  return 'other';
}

const PLATFORMS = ['ios', 'edge-android', 'samsung', 'firefox-android', 'other'];

export function installSteps(platform) {
  return t(`install.${PLATFORMS.includes(platform) ? platform : 'other'}`);
}
