// localStorage persistence. The whole app state is one JSON blob under STORAGE_KEY;
// bump `version` and migrate in load() if the shape ever changes.

const STORAGE_KEY = 'habit-checker:v1';

const empty = () => ({ version: 1, habits: [], completions: {}, notified: {} });

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

// Which collapsible sections are open. Kept apart from the app state because it is
// a per-device view preference, not data.
const UI_KEY = 'habit-checker:ui';

export function loadOpenSections() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY))?.open || {};
  } catch {
    return {};
  }
}

export function saveOpenSections(open) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ open }));
  } catch {
    // Blocked storage: sections just start collapsed next time.
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
