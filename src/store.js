// localStorage persistence. The whole app state is one JSON blob under STORAGE_KEY;
// bump `version` and migrate in load() if the shape ever changes.

const STORAGE_KEY = 'habit-checker:v1';

export const empty = () => ({ version: 1, habits: [], completions: {}, notified: {} });

export function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode): the app keeps working for this session.
  }
}

// Per-device view preferences, kept apart from the app state because they aren't data:
// { open: { [sectionId]: bool }, dismissed: { install?, blocked? }, confirm: bool }.
// `confirm` is "Ask before checking off" (on unless turned off in the ⋮ menu).
const UI_KEY = 'habit-checker:ui';

export function loadPrefs() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(UI_KEY)) || {};
  } catch {
    // Blocked or damaged storage: defaults.
  }
  return { open: {}, dismissed: {}, confirm: true, ...saved };
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch {
    // Blocked storage: preferences last for this session only.
  }
}

// The newest changelog version this device has caught up to (see changelog.js), so the
// "New: …" banner shows once per update. Per device, like the open sections.
const SEEN_KEY = 'habit-checker:seen';

export function loadSeenVersion() {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return localStorage.getItem(SEEN_KEY) == null || Number.isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

export function saveSeenVersion(v) {
  try {
    localStorage.setItem(SEEN_KEY, String(v));
  } catch {
    // Blocked storage: the banner may show again next time.
  }
}
