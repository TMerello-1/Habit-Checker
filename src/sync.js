// Keeping devices on the same profile in step. Each device stamps what it changes
// (`stamp()`, run by app.js on every commit) and syncs through the encrypted backup
// (backup.js): it fetches the stored copy, merges it with its own (`mergeStates()`) and
// stores the result. Pure, so it is tested under Node.
//
// The stamps live in `state.sync`, all ISO times:
//   habits:  { [habitId]: when the habit was added or last edited }
//   deleted: { [habitId]: when it was deleted }
//   days:    { [habitId]: { [dateKey]: when that day's check-ins last changed } }
// The newer stamp wins for each habit and for each habit's day, so checking off on one
// phone and unchecking another day on the other both survive. A day neither side has
// stamped (history from before sync) keeps the higher count of the two.

const noStamps = () => ({ habits: {}, deleted: {}, days: {} });

const stampsOf = (state) => ({ ...noStamps(), ...state?.sync });

function counts(list = []) {
  const map = new Map();
  for (const day of list) map.set(day, (map.get(day) || 0) + 1);
  return map;
}

function listFrom(map) {
  const list = [];
  for (const day of [...map.keys()].sort()) for (let i = 0; i < map.get(day); i++) list.push(day);
  return list;
}

const newer = (a = '', b = '') => (a >= b ? a : b);

// Returns `next` with stamps for everything that differs from `prev`, at time `now`.
export function stamp(prev, next, now) {
  const sync = stampsOf(next);
  const habits = { ...sync.habits };
  const deleted = { ...sync.deleted };
  const days = { ...sync.days };
  const before = new Map((prev?.habits || []).map((h) => [h.id, JSON.stringify(h)]));
  const after = new Set();
  for (const h of next.habits) {
    after.add(h.id);
    if (before.get(h.id) !== JSON.stringify(h)) {
      habits[h.id] = now;
      delete deleted[h.id];
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) {
      deleted[id] = now;
      delete habits[id];
    }
  }
  const ids = new Set([...Object.keys(prev?.completions || {}), ...Object.keys(next.completions)]);
  for (const id of ids) {
    const was = counts(prev?.completions?.[id]);
    const is = counts(next.completions[id]);
    for (const day of new Set([...was.keys(), ...is.keys()])) {
      if ((was.get(day) || 0) !== (is.get(day) || 0)) days[id] = { ...days[id], [day]: now };
    }
  }
  return { ...next, sync: { habits, deleted, days } };
}

// Merges a device's state (`mine`) with the stored copy (`theirs`). Habits keep this
// device's order, with ones only the other side has after them. Reminder bookkeeping
// (`notified`) stays this device's own.
export function mergeStates(mine, theirs) {
  const a = stampsOf(mine);
  const b = stampsOf(theirs);
  const deleted = {};
  for (const [id, t] of [...Object.entries(a.deleted), ...Object.entries(b.deleted)]) deleted[id] = newer(deleted[id], t);

  const mineById = new Map(mine.habits.map((h) => [h.id, h]));
  const theirsById = new Map(theirs.habits.map((h) => [h.id, h]));
  const order = [...mine.habits.map((h) => h.id), ...theirs.habits.map((h) => h.id).filter((id) => !mineById.has(id))];

  const habits = [];
  const edited = {};
  for (const id of order) {
    const ta = mineById.has(id) ? a.habits[id] || '' : null;
    const tb = theirsById.has(id) ? b.habits[id] || '' : null;
    const useMine = tb === null || (ta !== null && ta >= tb);
    const when = useMine ? ta : tb;
    // Deleted after its last edit (an edit without a stamp predates sync): gone.
    if (deleted[id] && deleted[id] >= when) continue;
    delete deleted[id];
    habits.push(useMine ? mineById.get(id) : theirsById.get(id));
    if (when) edited[id] = when;
  }

  const completions = {};
  const days = {};
  for (const h of habits) {
    const ca = counts(mine.completions[h.id]);
    const cb = counts(theirs.completions[h.id]);
    const sa = a.days[h.id] || {};
    const sb = b.days[h.id] || {};
    const merged = new Map();
    const stamps = {};
    for (const day of new Set([...ca.keys(), ...cb.keys(), ...Object.keys(sa), ...Object.keys(sb)])) {
      const n = !sa[day] && !sb[day]
        ? Math.max(ca.get(day) || 0, cb.get(day) || 0)
        : (sa[day] || '') >= (sb[day] || '') ? ca.get(day) || 0 : cb.get(day) || 0;
      if (n) merged.set(day, n);
      const when = newer(sa[day], sb[day]);
      if (when) stamps[day] = when;
    }
    if (merged.size) completions[h.id] = listFrom(merged);
    if (Object.keys(stamps).length) days[h.id] = stamps;
  }

  return { ...mine, habits, completions, sync: { habits: edited, deleted, days } };
}

// JSON with object keys sorted, so the order things were added in doesn't count.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Whether two states hold the same habits, check-ins and stamps.
export function sameData(a, b) {
  const sorted = (c) => Object.fromEntries(Object.keys(c).map((id) => [id, [...c[id]].sort()]));
  const pick = (s) => stable([s.habits, sorted(s.completions), stampsOf(s)]);
  return pick(a) === pick(b);
}
