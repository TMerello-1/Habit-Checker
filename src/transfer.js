// Moving habits between installs: the PWA in a browser and the Android app each keep
// their own localStorage, so data is carried across as copied text.

const FORMAT = 'habit-checker';

export function exportData(state) {
  return JSON.stringify({ format: FORMAT, version: state.version, habits: state.habits, completions: state.completions });
}

// Returns { habits, completions } from pasted text, or throws an Error with a message
// fit to show the user.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(String(text).trim());
  } catch {
    throw new Error("That doesn't look like copied Habit Checker data.");
  }
  if (data?.format !== FORMAT || !Array.isArray(data.habits) || !isObject(data.completions)) {
    throw new Error("That doesn't look like copied Habit Checker data.");
  }
  if (data.version > 1) throw new Error('That data is from a newer version. Update this app first.');
  const valid = data.habits.every(
    (h) => isObject(h) && typeof h.id === 'string' && typeof h.name === 'string' && Array.isArray(h.days) && typeof h.createdAt === 'string',
  );
  if (!valid) throw new Error('Some habits in that data are damaged, so nothing was imported.');
  return { habits: data.habits, completions: data.completions };
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
