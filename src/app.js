// UI layer: renders state into the DOM and wires up events. Every change goes
// through commit(), which saves and re-renders the whole view (the app is small
// enough that diffing isn't worth it).

import { dateKey, WEEKDAYS } from './dates.js';
import { currentStreak, dueToday, isDone, rewards, STREAK_MILESTONES } from './habits.js';
import { dueReminders, notify, requestPermission } from './reminders.js';
import { load, save } from './store.js';

let state = load();
const $ = (sel) => document.querySelector(sel);

function commit() {
  save(state);
  render();
}

function toggle(habit) {
  const today = dateKey();
  const list = state.completions[habit.id] || [];
  const before = currentStreak(habit, state.completions);
  state.completions[habit.id] = list.includes(today) ? list.filter((d) => d !== today) : [...list, today];
  const after = currentStreak(habit, state.completions);
  if (after > before) {
    const milestone = STREAK_MILESTONES.find((m) => m === after);
    toast(milestone ? `🏆 ${milestone}-day streak on ${habit.name}! +50 bonus` : `+10 points · ${after}🔥`);
  }
  commit();
}

function render() {
  const habits = state.habits;
  const r = rewards(habits, state.completions);
  $('#points').textContent = r.points;
  $('#level').textContent = r.level;
  $('#progress').style.width = `${(r.points % 250) / 2.5}%`;

  const today = dueToday(habits);
  const done = today.filter((h) => isDone(state.completions, h.id, new Date())).length;
  $('#today-summary').textContent = today.length ? `${done} of ${today.length} done` : 'Nothing scheduled today';
  $('#today').replaceChildren(
    ...today.map((h) => {
      const li = document.createElement('li');
      const checked = isDone(state.completions, h.id, new Date());
      li.className = checked ? 'habit done' : 'habit';
      li.innerHTML = `
        <button class="check" aria-pressed="${checked}" aria-label="Mark ${esc(h.name)} done">${checked ? '✓' : ''}</button>
        <span class="emoji">${esc(h.emoji)}</span>
        <span class="name">${esc(h.name)}${h.time ? `<small>${h.time}</small>` : ''}</span>
        <span class="streak" title="Current streak">${currentStreak(h, state.completions)}🔥</span>`;
      li.querySelector('.check').onclick = () => toggle(h);
      return li;
    }),
  );

  $('#all').replaceChildren(
    ...habits.map((h) => {
      const li = document.createElement('li');
      li.className = 'habit';
      li.innerHTML = `
        <span class="emoji">${esc(h.emoji)}</span>
        <span class="name">${esc(h.name)}<small>${h.days.map((d) => WEEKDAYS[d]).join(' ')}${h.time ? ` · ${h.time}` : ''}</small></span>
        <button class="delete" aria-label="Delete ${esc(h.name)}">✕</button>`;
      // Two-tap delete instead of confirm(), which some embedded viewers block.
      li.querySelector('.delete').onclick = (e) => {
        const btn = e.currentTarget;
        if (!btn.classList.contains('armed')) {
          btn.classList.add('armed');
          btn.textContent = 'Delete?';
          setTimeout(() => btn.isConnected && render(), 3000);
          return;
        }
        state.habits = state.habits.filter((x) => x.id !== h.id);
        delete state.completions[h.id];
        commit();
      };
      return li;
    }),
  );

  $('#badges').replaceChildren(
    ...(r.badges.length
      ? r.badges.map((b) => Object.assign(document.createElement('li'), { className: 'badge', textContent: b.label }))
      : [Object.assign(document.createElement('li'), { className: 'muted', textContent: 'Hit a 3-day streak to earn your first badge.' })]),
  );

  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#enable-reminders').hidden = perm !== 'default' || embedded;
  $('#reminder-note').hidden = !reminderNote(perm);
  $('#reminder-note').textContent = reminderNote(perm);
}

// Explain why reminders are off instead of silently hiding the button.
const embedded = window.self !== window.top;
function reminderNote(perm) {
  if (embedded || perm === 'unsupported' || !('serviceWorker' in navigator)) {
    return 'Reminders are off in this preview. They need the installed app.';
  }
  if (perm === 'denied') return 'Notifications are blocked. Allow them for this site in your browser settings to get reminders.';
  return '';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2500);
}

$('#add-form').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const days = f.getAll('days').map(Number);
  if (!days.length) return toast('Pick at least one day');
  state.habits.push({
    id: crypto.randomUUID(),
    name: f.get('name').trim(),
    emoji: f.get('emoji').trim() || '✅',
    days,
    time: f.get('time') || '',
    createdAt: dateKey(),
  });
  e.target.reset();
  e.target.querySelectorAll('[name=days]').forEach((c) => (c.checked = true));
  commit();
};

$('#enable-reminders').onclick = async () => {
  await requestPermission();
  render();
};

function checkReminders() {
  for (const h of dueReminders(state)) {
    notify(h);
    state.notified[h.id] = dateKey();
  }
  save(state);
}

// Re-render on focus so "today" rolls over if the app was left open past midnight.
window.addEventListener('focus', render);
setInterval(checkReminders, 30_000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
checkReminders();
