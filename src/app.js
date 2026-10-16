// UI layer: renders state into the DOM and wires up events. Every change goes
// through commit(), which saves and re-renders the whole view (the app is small
// enough that diffing isn't worth it).

import { dateKey, WEEKDAYS } from './dates.js';
import { currentStreak, dueToday, editHabit, isDone, rewards, STREAK_MILESTONES } from './habits.js';
import { installPlatform, installSteps } from './install.js';
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
      li.className = h.id === editing ? 'habit editing' : 'habit';
      li.innerHTML = `
        <span class="emoji">${esc(h.emoji)}</span>
        <span class="name">${esc(h.name)}<small>${h.days.map((d) => WEEKDAYS[d]).join(' ')}${h.time ? ` · ${h.time}` : ''}</small></span>
        <button class="edit" aria-label="Edit ${esc(h.name)}">✎</button>
        <button class="delete" aria-label="Delete ${esc(h.name)}">✕</button>`;
      li.querySelector('.edit').onclick = () => startEdit(h);
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
        if (editing === h.id) resetForm();
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

  // Offer installing until the app runs from the home screen.
  $('#install').hidden = installed() || embedded;
  if ($('#install').hidden) $('#install-help').hidden = true;
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

// Tap-to-choose emoji for new habits. The choice lives in the hidden "emoji"
// input so the submit handler reads it like any other field.
const EMOJI = [
  '✅', '🏃', '🚶', '🚴', '🏊', '🧘', '🏋️', '🤸', '⚽', '🎾',
  '💧', '🥗', '🍎', '🥦', '☕', '🚭', '💊', '🦷', '😴', '🛏️',
  '📚', '✍️', '📝', '🧠', '🎓', '💻', '🎨', '🎸', '🎹', '📷',
  '🧹', '🧺', '🍳', '🌱', '🐶', '💰', '📵', '🙏', '❤️', '📞', '🎯', '🌞',
];
const emojiField = $('#add-form').elements.emoji;

function pickEmoji(emoji) {
  emojiField.value = emoji;
  $('#emoji-btn').textContent = emoji;
  for (const b of $('#emoji-grid').children) b.setAttribute('aria-pressed', b.textContent === emoji);
}

function showPicker(open) {
  $('#emoji-picker').hidden = !open;
  $('#emoji-btn').setAttribute('aria-expanded', open);
}

$('#emoji-grid').replaceChildren(
  ...EMOJI.map((emoji) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: emoji });
    b.onclick = () => {
      pickEmoji(emoji);
      $('#emoji-custom').value = '';
      showPicker(false);
    };
    return b;
  }),
);
$('#emoji-btn').onclick = () => showPicker($('#emoji-picker').hidden);
$('#emoji-custom').oninput = (e) => pickEmoji(e.target.value.trim() || '✅');
pickEmoji('✅');

// The same form adds new habits and edits existing ones. `editing` is the id of
// the habit being edited, or null when adding.
let editing = null;
const form = $('#add-form');

function startEdit(habit) {
  editing = habit.id;
  form.elements.name.value = habit.name;
  form.querySelectorAll('[name=days]').forEach((c) => (c.checked = habit.days.includes(Number(c.value))));
  form.elements.time.value = habit.time;
  pickEmoji(habit.emoji);
  $('#emoji-custom').value = EMOJI.includes(habit.emoji) ? '' : habit.emoji;
  showPicker(false);
  setFormMode();
  render();
  $('#form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.name.focus({ preventScroll: true });
}

function resetForm() {
  editing = null;
  form.reset();
  form.querySelectorAll('[name=days]').forEach((c) => (c.checked = true));
  pickEmoji('✅');
  showPicker(false);
  setFormMode();
}

function setFormMode() {
  $('#form-title').textContent = editing ? 'Edit habit' : 'New habit';
  form.querySelector('[type=submit]').textContent = editing ? 'Save changes' : 'Add habit';
  $('#cancel-edit').hidden = !editing;
}

$('#cancel-edit').onclick = () => {
  resetForm();
  render();
};

form.onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const days = f.getAll('days').map(Number);
  if (!days.length) return toast('Pick at least one day');
  const fields = {
    name: f.get('name').trim(),
    emoji: f.get('emoji').trim() || '✅',
    days,
    time: f.get('time') || '',
  };
  const i = state.habits.findIndex((h) => h.id === editing);
  if (i >= 0) {
    const old = state.habits[i];
    state.habits[i] = editHabit(old, fields);
    // A new reminder time may still be ahead today, so let it fire again.
    if (fields.time !== old.time) delete state.notified[old.id];
    toast(`Saved ${fields.name}`);
  } else {
    state.habits.push({ id: crypto.randomUUID(), ...fields, createdAt: dateKey() });
  }
  resetForm();
  commit();
};

$('#enable-reminders').onclick = async () => {
  await requestPermission();
  render();
};

// Chromium browsers fire beforeinstallprompt once the app is installable; keep it
// so the button can open the browser's own install dialog. Without it (iPhone,
// Edge's "Add to phone", Samsung, Firefox) the button shows the menu steps instead.
let installPrompt = null;
let justInstalled = false;
const installed = () =>
  justInstalled || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  justInstalled = true;
  installPrompt = null;
  toast('Installed! Open Habit Checker from your home screen.');
  render();
});

$('#install').onclick = async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null; // each event can only prompt once
    prompt.prompt();
    await prompt.userChoice;
    return render();
  }
  const help = $('#install-help');
  help.textContent = installSteps(installPlatform(navigator.userAgent, navigator.maxTouchPoints));
  help.hidden = !help.hidden;
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
