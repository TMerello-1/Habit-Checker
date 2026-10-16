// "Install app" help. Chromium browsers hand app.js a beforeinstallprompt event and
// show their own dialog; everywhere else (iPhone, Samsung Internet, Firefox, or a
// Chromium browser that hasn't offered the prompt) we show the menu steps instead.
// Pure so it can be tested under Node; app.js owns the button.

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

const STEPS = {
  ios: 'Tap the Share button (the square with an arrow, at the bottom of Safari), then "Add to Home Screen".',
  'edge-android': 'Tap the ≡ menu at the bottom right, swipe the panel up, then tap "Add to phone".',
  samsung: 'Tap the ≡ menu at the bottom right, then "Add page to" → "Home screen".',
  'firefox-android': 'Tap the ⋮ menu, then "Add to Home screen".',
  other: 'Open your browser menu and choose "Install app" or "Add to Home screen".',
};

export function installSteps(platform) {
  return STEPS[platform] || STEPS.other;
}
