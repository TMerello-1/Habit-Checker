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
