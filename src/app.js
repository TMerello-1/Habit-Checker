// UI layer: renders state into the DOM and wires up events. Every change goes
// through commit(), which saves and re-renders the whole view (the app is small
// enough that diffing isn't worth it).

import { dateKey } from './dates.js';
import { currentStreak, dueToday, editHabit, isDone, openToday, rewards, STREAK_MILESTONES } from './habits.js';
import { getLang, pickLang, setLang, t } from './i18n.js';
import { installPlatform, installSteps } from './install.js';
import { dismissReminder, dueReminders, notify, requestPermission, setBadge } from './reminders.js';
import { load, loadOpenSections, save, saveOpenSections } from './store.js';
import { exportData, parseImport } from './transfer.js';

let state = load();
const $ = (sel) => document.querySelector(sel);

// Text follows the browser or phone language (German or English). index.html holds the
// English text; elements marked data-i18n* get theirs swapped in once at startup.
setLang(pickLang(navigator.languages || [navigator.language]));
document.documentElement.lang = getLang();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
for (const el of document.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
for (const el of document.querySelectorAll('[data-i18n-day]')) el.textContent = t('weekdays')[el.dataset.i18nDay];

function commit() {
  save(state);
  render();
}

// Checking a habit off asks first, so a stray tap or wishful thinking doesn't
// earn points. Unchecking needs no prompt. An in-page <dialog> rather than
// confirm(), which the hosted preview blocks.
function toggle(habit) {
  if (isDone(state.completions, habit.id, new Date())) return applyToggle(habit);
  const dlg = $('#confirm-done');
  $('#confirm-emoji').textContent = habit.emoji;
  $('#confirm-text').textContent = t('confirmHabit', { name: habit.name });
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'ok') applyToggle(habit);
  };
  dlg.showModal();
}

function applyToggle(habit) {
  const today = dateKey();
  const list = state.completions[habit.id] || [];
  const before = currentStreak(habit, state.completions);
  state.completions[habit.id] = list.includes(today) ? list.filter((d) => d !== today) : [...list, today];
  if (!list.includes(today)) dismissReminder(habit.id).catch(() => {});
  const after = currentStreak(habit, state.completions);
  if (after > before) {
    const milestone = STREAK_MILESTONES.find((m) => m === after);
    toast(milestone ? t('milestoneToast', { m: milestone, name: habit.name }) : t('pointsToast', { streak: after }));
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
  setBadge(openToday(habits, state.completions).length);
  $('#today-summary').textContent = today.length ? t('todaySummary', { done, total: today.length }) : t('nothingToday');
  $('#today').replaceChildren(
    ...withPrivateGroup(today, 'today', (h) => {
      const li = document.createElement('li');
      const checked = isDone(state.completions, h.id, new Date());
      li.className = checked ? 'habit done' : 'habit';
      li.innerHTML = `
        <button class="check" aria-pressed="${checked}" aria-label="${esc(t('markDone', { name: h.name }))}">${checked ? '✓' : ''}</button>
        <span class="emoji">${esc(h.emoji)}</span>
        <span class="name">${esc(h.name)}${h.time ? `<small>${h.time}</small>` : ''}</span>
        <span class="streak" title="${esc(t('currentStreak'))}">${currentStreak(h, state.completions)}🔥</span>`;
      li.querySelector('.check').onclick = () => toggle(h);
      return li;
    }),
  );

  $('#all-count').textContent = habits.length ? `${habits.length}` : t('noneYet');
  $('#all').replaceChildren(
    ...withPrivateGroup(habits, 'all', (h) => {
      const li = document.createElement('li');
      li.className = h.id === editing ? 'habit editing' : 'habit';
      li.innerHTML = `
        <span class="emoji">${esc(h.emoji)}</span>
        <span class="name">${esc(h.name)}<small>${h.days.map((d) => t('weekdays')[d]).join(' ')}${h.time ? ` · ${h.time}` : ''}</small></span>
        <button class="edit" aria-label="${esc(t('edit', { name: h.name }))}">✎</button>
        <button class="delete" aria-label="${esc(t('delete', { name: h.name }))}">✕</button>`;
      li.querySelector('.edit').onclick = () => startEdit(h);
      // Two-tap delete instead of confirm(), which some embedded viewers block.
      li.querySelector('.delete').onclick = (e) => {
        const btn = e.currentTarget;
        if (!btn.classList.contains('armed')) {
          btn.classList.add('armed');
          btn.textContent = t('deleteConfirm');
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
      ? r.badges.map((b) => {
          const habit = habits.find((h) => h.id === b.habitId);
          const emoji = habit.private ? '🔒' : habit.emoji;
          return Object.assign(document.createElement('li'), { className: 'badge', textContent: t('badge', { emoji, m: b.milestone }) });
        })
      : [Object.assign(document.createElement('li'), { className: 'muted', textContent: t('firstBadge') })]),
  );

  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#enable-reminders').hidden = perm !== 'default' || embedded || androidApp;
  $('#reminder-note').hidden = !reminderNote(perm);
  $('#reminder-note').textContent = reminderNote(perm);

  // Offer installing until the app runs from the home screen.
  $('#install').hidden = installed() || embedded || androidApp;
  if ($('#install').hidden) $('#install-help').hidden = true;
}

// Explain why reminders are off instead of silently hiding the button.
const embedded = window.self !== window.top;
// The Android app (android/) loads this site in a WebView, tags its user agent, and
// shows reminders and the home screen widget natively from the saved state.
const androidApp = navigator.userAgent.includes('HabitCheckerAndroid');
function reminderNote(perm) {
  if (androidApp) return '';
  if (embedded || perm === 'unsupported' || !('serviceWorker' in navigator)) {
    return t('remindersPreview');
  }
  if (perm === 'denied') return t('remindersBlocked');
  return '';
}

// Private habits sit in a collapsed "🔒 Private" group at the end of a list, so their
// names only show after a tap. The group starts closed again each time the app opens.
const privateOpen = { today: false, all: false };
function withPrivateGroup(habits, list, item) {
  const hidden = habits.filter((h) => h.private);
  const items = habits.filter((h) => !h.private).map(item);
  if (!hidden.length) return items;
  const done = hidden.filter((h) => isDone(state.completions, h.id, new Date())).length;
  const li = document.createElement('li');
  li.className = 'private-group';
  li.innerHTML = `
    <details${privateOpen[list] ? ' open' : ''}>
      <summary>${esc(list === 'today' ? t('privateToday', { done, total: hidden.length }) : t('privateAll', { n: hidden.length }))}</summary>
      <ul class="list"></ul>
    </details>`;
  const details = li.querySelector('details');
  details.ontoggle = () => (privateOpen[list] = details.open);
  li.querySelector('ul').replaceChildren(...hidden.map(item));
  return [...items, li];
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

// "New habit" and "All habits" are <details> sections that start collapsed and
// remember whether they were left open on this device.
const openSections = loadOpenSections();
for (const el of document.querySelectorAll('details.fold')) {
  el.open = Boolean(openSections[el.id]);
  el.addEventListener('toggle', () => {
    openSections[el.id] = el.open;
    saveOpenSections(openSections);
  });
}

// The same form adds new habits and edits existing ones. `editing` is the id of
// the habit being edited, or null when adding.
let editing = null;
const form = $('#add-form');

function startEdit(habit) {
  editing = habit.id;
  form.elements.name.value = habit.name;
  form.querySelectorAll('[name=days]').forEach((c) => (c.checked = habit.days.includes(Number(c.value))));
  form.elements.time.value = habit.time;
  form.elements.private.checked = Boolean(habit.private);
  pickEmoji(habit.emoji);
  $('#emoji-custom').value = EMOJI.includes(habit.emoji) ? '' : habit.emoji;
  showPicker(false);
  setFormMode();
  $('#form-section').open = true;
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
  $('#form-title').textContent = t(editing ? 'editHabit' : 'newHabit');
  form.querySelector('[type=submit]').textContent = t(editing ? 'saveChanges' : 'addHabit');
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
  if (!days.length) return toast(t('pickDay'));
  const fields = {
    name: f.get('name').trim(),
    emoji: f.get('emoji').trim() || '✅',
    days,
    time: f.get('time') || '',
    private: f.has('private'),
  };
  const i = state.habits.findIndex((h) => h.id === editing);
  if (i >= 0) {
    const old = state.habits[i];
    if (fields.private) privateOpen.all = true; // keep the edited habit in view
    state.habits[i] = editHabit(old, fields);
    // A new reminder time may still be ahead today, so let it fire again.
    if (fields.time !== old.time) delete state.notified[old.id];
    toast(t('saved', { name: fields.name }));
  } else {
    state.habits.push({ id: crypto.randomUUID(), ...fields, createdAt: dateKey() });
  }
  resetForm();
  commit();
};

// Tapping the dimmed backdrop counts as "Not yet".
$('#confirm-done').onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
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
  toast(t('installed'));
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

// "Move your data": copy the state out as text, or replace it with pasted text.
// Replacing asks for a second tap, like delete, since it overwrites everything here.
$('#copy-data').onclick = async () => {
  const text = exportData(state);
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    // No clipboard access: put the text in the box to copy by hand.
    $('#import-data').value = text;
    $('#import-data').select();
    toast(t('copyByHand'));
  }
};

$('#import-btn').onclick = (e) => {
  const btn = e.currentTarget;
  let data;
  try {
    data = parseImport($('#import-data').value);
  } catch (err) {
    return toast(err.message);
  }
  if (!btn.classList.contains('armed') && state.habits.length) {
    btn.classList.add('armed');
    btn.textContent = t('replaceConfirm', { n: state.habits.length });
    setTimeout(() => {
      btn.classList.remove('armed');
      btn.textContent = t('replaceData');
    }, 3000);
    return;
  }
  btn.classList.remove('armed');
  btn.textContent = t('replaceData');
  state = { ...state, ...data, notified: {} };
  $('#import-data').value = '';
  resetForm();
  commit();
  toast(t('imported', { n: data.habits.length }));
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
