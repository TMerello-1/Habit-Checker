// UI layer: renders state into the DOM and wires up events. Every change goes
// through commit(), which saves and re-renders the whole view (the app is small
// enough that diffing isn't worth it).

import { backupText, decryptBackup, encryptBackup } from './backup.js';
import { bannerChange, changesByDate, LATEST } from './changelog.js';
import { formatCode, INVITE_LENGTH, isCode, normalizeCode, RECOVERY_LENGTH } from './codes.js';
import { FRIENDS_SERVER } from './config.js';
import { acceptInvite, answerThread, createInvite, createProfile, deleteFeedback, deleteProfile, fetchBackup, fetchFeedback, fetchMe, fetchThread, friendsEnabled, loadFriends, previewInvite, reactToFeedback, registerAdminDevice, removeFriend, replyToFeedback, saveFriends, sendFeedback, sendStats, ServerError, threadDevice, uploadBackup } from './friends.js';
import { addThread, FEEDBACK_KEY, feedbackStatus, filterFeedback, markSeen, parseThreads, REACTIONS, statusCounts, unreadTotal, updateThread } from './feedback.js';
import { addDays, dateKey } from './dates.js';
import { bestBadges, currentStreak, editHabit, isDone, isOpen, levelProgress, missedYesterday, onToday, openToday, pileCount, rewards, scheduleKind, sharedStats, sortToday, STREAK_MILESTONES, streakUnit } from './habits.js';
import { getLang, pickLang, setLang, t } from './i18n.js';
import { installPlatform, installSteps } from './install.js';
import { initials, profileName, randomName } from './names.js';
import { enablePush, pushActive, pushEndpoint, syncPush } from './push.js';
import { dismissReminder, dueReminders, notify, requestPermission, setBadge } from './reminders.js';
import { empty, load, loadPrefs, loadSeenVersion, save, savePrefs, saveSeenVersion } from './store.js';
import { mergeStates, sameData, stamp } from './sync.js';
import { exportData, parseImport } from './transfer.js';

let state = load();
const prefs = loadPrefs();
const $ = (sel) => document.querySelector(sel);

// Text follows the browser or phone language (German or English). index.html holds the
// English text; elements marked data-i18n* get theirs swapped in once at startup.
setLang(pickLang(navigator.languages || [navigator.language]));
document.documentElement.lang = getLang();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
for (const el of document.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
for (const el of document.querySelectorAll('[data-i18n-day]')) el.textContent = t('weekdays')[el.dataset.i18nDay];

// The state as last committed, so commit() can stamp what changed (sync.js).
let committed = structuredClone(state);

function commit() {
  state = stamp(committed, state, new Date().toISOString());
  committed = structuredClone(state);
  save(state);
  syncPush(state);
  render();
  sendStatsSoon();
  backupSoon();
}

// Checking a habit off asks first, so a stray tap or wishful thinking doesn't
// earn points. Unchecking needs no prompt. An in-page <dialog> rather than
// confirm(), which the hosted preview blocks. With "Ask before checking off" turned
// off in the ⋮ menu, it checks straight away and the toast offers Undo instead.
// `date` is today, or yesterday for a habit checked off late (see missedYesterday).
// A tap on a pile habit always adds a round; its − button or Undo takes one back.
function toggle(habit, date = new Date()) {
  if (!habit.pile && isDone(state.completions, habit.id, date)) return applyToggle(habit, date);
  if (!prefs.confirm) return applyToggle(habit, date, true);
  const dlg = $('#confirm-done');
  const late = dateKey(date) !== dateKey();
  $('#confirm-emoji').textContent = habit.emoji;
  $('#confirm-text').textContent = t(late ? 'confirmYesterday' : 'confirmHabit', { name: habit.name });
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'ok') applyToggle(habit, date);
  };
  dlg.showModal();
}

function applyToggle(habit, date = new Date(), undoable = false) {
  const key = dateKey(date);
  const list = state.completions[habit.id] || [];
  const checking = habit.pile || !list.includes(key);
  const before = currentStreak(habit, state.completions);
  const levelBefore = rewards(state.habits, state.completions).level;
  state.completions[habit.id] = checking ? [...list, key] : list.filter((d) => d !== key);
  if (habit.pile) undoable = true;
  if (checking && key === dateKey()) dismissReminder(habit.id).catch(() => {});
  const after = currentStreak(habit, state.completions);
  const level = rewards(state.habits, state.completions).level;
  commit();
  if (!checking) return;
  const milestone = after > before && STREAK_MILESTONES.find((m) => m === after);
  const msg = level > levelBefore
    ? t('levelUp', { level })
    : milestone
      ? t('milestoneToast', { m: milestone, name: habit.name, unit: t(`unit_${streakUnit(habit)}`) })
      : t('pointsToast', { streak: after });
  toast(msg, undoable ? { label: t('undo'), run: () => (habit.pile ? removeRound(habit, date) : applyToggle(habit, date)) } : null);
}

// Takes back one round of a pile habit logged on `date`.
function removeRound(habit, date = new Date()) {
  const list = state.completions[habit.id] || [];
  const i = list.lastIndexOf(dateKey(date));
  if (i < 0) return;
  state.completions[habit.id] = list.filter((_, j) => j !== i);
  commit();
}

let lastLevel = null;
let highlight = null; // id of a habit just added or edited, briefly highlighted

function render() {
  const habits = state.habits;
  const r = rewards(habits, state.completions);
  const p = levelProgress(r.points);
  $('#points').textContent = r.points;
  $('#level').textContent = p.level;
  $('#badge-count').textContent = r.badges.length;
  $('#to-next').textContent = t('toNext', { n: p.toNext, level: p.level + 1 });
  $('#progress-btn').setAttribute('aria-label', `${t('progress')}: ${t('levelLine', { level: p.level, points: r.points, n: p.toNext, next: p.level + 1 })}`);
  setProgress(p);
  renderProgressSheet(r, p);

  const now = new Date();
  const today = sortToday(onToday(habits, state.completions, now), state.completions, now);
  const done = today.filter((h) => !isOpen(h, state.completions, now)).length;
  setBadge(openToday(habits, state.completions).length);
  $('#empty').hidden = habits.length > 0;
  $('#today-summary').textContent = !habits.length
    ? ''
    : !today.length
      ? t('nothingToday')
      : done === today.length
        ? t('allDone')
        : t('todaySummary', { done, total: today.length });
  // Open habits first (by time), then the private group, then the ones already done.
  const shown = today.filter((h) => !h.private);
  const doneItems = shown.filter((h) => !isOpen(h, state.completions, now)).map((h) => todayItem(h, now));
  const items = [
    ...shown.filter((h) => isOpen(h, state.completions, now)).map((h) => todayItem(h, now)),
    ...privateGroup(today.filter((h) => h.private), 'today', (h) => todayItem(h, now)),
  ];
  if (doneItems.length) {
    const divider = Object.assign(document.createElement('li'), { className: 'divider', textContent: t('doneGroup', { n: doneItems.length }) });
    items.push(divider, ...doneItems);
  }
  $('#today').replaceChildren(...items);

  // Until noon, yesterday's missed habits can still be checked off.
  const yesterday = addDays(now, -1);
  const missed = missedYesterday(habits, state.completions, now);
  const lateDone = habits.filter((h) => lateChecked.has(h.id) && isDone(state.completions, h.id, yesterday));
  const late = [...missed, ...lateDone.filter((h) => !missed.includes(h))];
  $('#yesterday').hidden = !late.length;
  $('#yesterday-list').replaceChildren(
    ...late.filter((h) => !h.private).map((h) => todayItem(h, yesterday)),
    ...privateGroup(late.filter((h) => h.private), 'yesterday', (h) => todayItem(h, yesterday)),
  );

  $('#all-count').textContent = habits.length ? `${habits.length}` : t('noneYet');
  $('#all').replaceChildren(
    ...habits.filter((h) => !h.private).map(allItem),
    ...privateGroup(habits.filter((h) => h.private), 'all', allItem),
  );

  // Banners sit below Today. Reminders are offered once a habit has a time to remind at.
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const wantsReminders = habits.some((h) => h.time);
  $('#reminders-banner').hidden = perm !== 'default' || embedded || androidApp || !wantsReminders;
  const note = wantsReminders ? reminderNote(perm) : '';
  $('#reminder-note').hidden = !note || prefs.dismissed.note === note;
  $('#reminder-note-text').textContent = note;

  if (friends.me) $('#me-stats').textContent = t('stats', sharedStats(habits, state.completions));

  // Offer installing until the app runs from the home screen. Once the banner is
  // dismissed, the ⋮ menu keeps the option.
  const canInstall = !(installed() || embedded || androidApp);
  $('#install-banner').hidden = !canInstall || Boolean(prefs.dismissed.install);
  $('#menu-install').hidden = !canInstall || !prefs.dismissed.install;
  if (!canInstall) $('#install-help').hidden = true;
  renderMenu();
}

// The whole row is the tap target; the circle is just the visual cue. A pile habit's row
// shows what's left on its pile, and a − button once a round was logged that day.
function todayItem(h, date) {
  const li = document.createElement('li');
  const late = dateKey(date) !== dateKey();
  const checked = late || !h.pile ? isDone(state.completions, h.id, date) : !isOpen(h, state.completions, date);
  const streak = currentStreak(h, state.completions);
  const note = h.pile && !late ? pileText(h, date) : h.time && !late ? h.time : '';
  li.innerHTML = `
    <button type="button" class="habit check-row${checked ? ' done' : ''}${h.id === highlight ? ' flash' : ''}" aria-pressed="${checked}"
      aria-label="${esc(t(late ? 'markDoneYesterday' : 'markDone', { name: h.name }))}">
      <span class="check" aria-hidden="true">${checked ? '✓' : ''}</span>
      <span class="emoji">${esc(h.emoji)}</span>
      <span class="name"><span class="title">${esc(h.name)}</span>${note ? `<small>${esc(note)}</small>` : ''}</span>
      ${late ? '' : `<span class="streak${streak ? '' : ' zero'}" title="${esc(t('currentStreak'))}">${streak}🔥</span>`}
    </button>`;
  li.querySelector('button').onclick = () => {
    if (late) lateChecked.add(h.id); // stays listed after checking, so a mistake can be undone
    toggle(h, date);
  };
  if (h.pile && isDone(state.completions, h.id, date)) {
    li.className = 'pile-row';
    const minus = Object.assign(document.createElement('button'), { type: 'button', className: 'minus', textContent: '↶' });
    minus.setAttribute('aria-label', t('removeRound', { name: h.name }));
    minus.onclick = () => removeRound(h, date);
    li.append(minus);
  }
  return li;
}

// "3 to go this week", "Pile 0" or "1 ahead", plus the reminder time.
function pileText(h, date) {
  const n = pileCount(h, state.completions, date);
  const text = n > 0 ? t(`pileToGo_${h.pile}`, { n }) : n < 0 ? t('pileAhead', { n: -n }) : t('pileClear');
  return h.time ? `${text} · ${h.time}` : text;
}
const lateChecked = new Set();

function scheduleText(h) {
  const kind = scheduleKind(h.days);
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => h.days.includes(d));
  const days = kind ? t(kind === 'weekdays' ? 'weekdaysPreset' : kind) : order.map((d) => t('weekdays')[d]).join(' ');
  const parts = [days, h.pile && t(`pileShort_${h.pile}`), h.time].filter(Boolean);
  return parts.join(' · ');
}

function allItem(h) {
  const li = document.createElement('li');
  li.className = `habit${h.id === editing ? ' editing' : ''}${h.id === highlight ? ' flash' : ''}`;
  li.innerHTML = `
    <span class="emoji">${esc(h.emoji)}</span>
    <span class="name"><span class="title">${esc(h.name)}</span><small>${esc(scheduleText(h))}</small></span>
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
    commit();
  };
  return li;
}

// The level bar. On a level-up it fills to the end first, then starts the new level,
// so it never just drops to empty.
function setProgress(p) {
  const bar = $('#progress');
  const width = `${(p.into / 250) * 100}%`;
  if (lastLevel !== null && p.level > lastLevel) {
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.transition = 'none';
      bar.style.width = '0';
      requestAnimationFrame(() => {
        bar.style.transition = '';
        bar.style.width = width;
      });
    }, 450);
  } else {
    bar.style.width = width;
  }
  lastLevel = p.level;
}

const BADGE_TEXT = { day: 'badgeDays', week: 'badgeWeeks', month: 'badgeMonths' };

// Badges live in the Progress sheet (tap the level in the header): one tile per habit
// with its best streak badge and the next one to aim for.
function renderProgressSheet(r, p) {
  $('#progress-level').textContent = t('levelLine', { level: p.level, points: r.points, n: p.toNext, next: p.level + 1 });
  const tiles = bestBadges(r.badges).map((b) => {
    const habit = state.habits.find((h) => h.id === b.habitId);
    const li = document.createElement('li');
    li.className = 'badge-tile';
    li.innerHTML = `
      <span class="badge-emoji" aria-hidden="true">${esc(habit.private ? '🔒' : habit.emoji)}</span>
      <b>${esc(t(BADGE_TEXT[b.unit] ?? 'badgeDays', { m: b.milestone }))}</b>
      <small>${esc(b.next ? t('nextBadge', { m: b.next }) : t('allBadges'))}</small>`;
    return li;
  });
  $('#badges').replaceChildren(
    ...(tiles.length ? tiles : [Object.assign(document.createElement('li'), { className: 'muted', textContent: t('firstBadge') })]),
  );
}

function renderMenu() {
  $('#menu-confirm').textContent = `${t('confirmSetting')}: ${t(prefs.confirm ? 'on' : 'off')}`;
  $('#menu-confirm').setAttribute('aria-pressed', prefs.confirm);
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
const privateOpen = { today: false, yesterday: false, all: false };
function privateGroup(hidden, list, item) {
  if (!hidden.length) return [];
  const date = list === 'yesterday' ? addDays(new Date(), -1) : new Date();
  const done = hidden.filter((h) => (list === 'yesterday' ? isDone(state.completions, h.id, date) : !isOpen(h, state.completions, date))).length;
  const li = document.createElement('li');
  li.className = 'private-group';
  li.innerHTML = `
    <details${privateOpen[list] ? ' open' : ''}>
      <summary>${esc(list === 'all' ? t('privateAll', { n: hidden.length }) : t('privateToday', { done, total: hidden.length }))}</summary>
      <ul class="list"></ul>
    </details>`;
  const details = li.querySelector('details');
  details.ontoggle = () => (privateOpen[list] = details.open);
  li.querySelector('ul').replaceChildren(...hidden.map(item));
  return [li];
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// A short message at the bottom. `action` ({ label, run }) adds a button, like Undo,
// and keeps the toast up a little longer.
function toast(msg, action = null) {
  const el = $('#toast');
  // An open modal dialog sits in the top layer, above anything in the page, so
  // the toast moves into it to stay visible.
  (document.querySelector('dialog[open]') ?? document.body).append(el);
  $('#toast-text').textContent = msg;
  const btn = $('#toast-action');
  btn.hidden = !action;
  el.classList.toggle('actionable', Boolean(action));
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => {
      el.classList.remove('show');
      action.run();
    };
  }
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
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

// Friends and "All habits" are <details> sections that start collapsed and remember
// whether they were left open on this device.
for (const el of document.querySelectorAll('details.fold')) {
  el.open = Boolean(prefs.open[el.id]);
  el.addEventListener('toggle', () => {
    prefs.open[el.id] = el.open;
    savePrefs(prefs);
  });
}

// The same form, in a sheet opened by the ＋ button, adds new habits and edits existing
// ones. `editing` is the id of the habit being edited, or null when adding.
let editing = null;
const form = $('#add-form');
const habitSheet = $('#habit-dialog');

// `starter` ({ name, emoji }) fills in one of the empty state's suggestions.
function openAdd(starter = null) {
  resetForm();
  if (starter) {
    form.elements.name.value = starter.name;
    pickEmoji(starter.emoji);
  }
  habitSheet.showModal();
  if (!starter) form.elements.name.focus();
}

function startEdit(habit) {
  resetForm();
  editing = habit.id;
  form.elements.name.value = habit.name;
  setDays(habit.days);
  form.elements.time.value = habit.time;
  form.elements.private.checked = Boolean(habit.private);
  form.elements.pile.value = habit.pile || '';
  pickEmoji(habit.emoji);
  $('#emoji-custom').value = EMOJI.includes(habit.emoji) ? '' : habit.emoji;
  setFormMode();
  render();
  habitSheet.showModal();
}

function setDays(days) {
  form.querySelectorAll('[name=days]').forEach((c) => (c.checked = days.includes(Number(c.value))));
}

const PRESETS = { daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };
for (const b of form.querySelectorAll('[data-preset]')) b.onclick = () => setDays(PRESETS[b.dataset.preset]);

function resetForm() {
  editing = null;
  form.reset();
  setDays(PRESETS.daily);
  pickEmoji('✅');
  $('#emoji-custom').value = '';
  showPicker(false);
  setFormMode();
}

function setFormMode() {
  $('#form-title').textContent = t(editing ? 'editHabit' : 'newHabit');
  form.querySelector('[type=submit]').textContent = t(editing ? 'saveChanges' : 'addHabit');
}

$('#fab').onclick = () => openAdd();
$('#add-first').onclick = () => openAdd();
$('#starters').replaceChildren(
  ...t('starters').map(([emoji, name]) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'starter', textContent: `${emoji} ${name}` });
    b.onclick = () => openAdd({ emoji, name });
    return b;
  }),
);
// Only the ✕ closes the sheet, not a tap beside it, so a stray tap doesn't lose typing.
habitSheet.querySelector('[data-close]').onclick = () => habitSheet.close();
habitSheet.addEventListener('close', () => {
  if (!editing) return;
  editing = null;
  render();
});

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
    pile: f.get('pile') || undefined,
  };
  const i = state.habits.findIndex((h) => h.id === editing);
  let id;
  if (i >= 0) {
    const old = state.habits[i];
    id = old.id;
    state.habits[i] = editHabit(old, fields);
    // A new reminder time may still be ahead today, so let it fire again.
    if (fields.time !== old.time) delete state.notified[old.id];
  } else {
    id = crypto.randomUUID();
    state.habits.push({ id, ...fields, createdAt: dateKey() });
  }
  // Keep the new or edited habit in view: open its private group and flash its row.
  if (fields.private) privateOpen.today = privateOpen.all = true;
  highlight = id;
  setTimeout(() => {
    if (highlight === id) highlight = null;
  }, 1600);
  const wasEditing = Boolean(editing);
  editing = null;
  habitSheet.close();
  commit();
  toast(t(wasEditing ? 'saved' : 'added', { name: fields.name }));
};

// Tapping the dimmed backdrop counts as "Not yet".
$('#confirm-done').onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
};

$('#enable-reminders').onclick = async () => {
  await requestPermission();
  render();
  enablePush(state).then(syncAdminDevice);
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

$('#install').onclick = () => install();
$('#menu-install').onclick = () => {
  $('#menu').close();
  install();
};
$('#install-close').onclick = () => {
  prefs.dismissed.install = true;
  savePrefs(prefs);
  $('#install-help').hidden = true;
  render();
};
$('#reminder-note-close').onclick = () => {
  prefs.dismissed.note = $('#reminder-note-text').textContent;
  savePrefs(prefs);
  render();
};

async function install() {
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
  if (!help.hidden) help.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// The ⋮ menu in the header holds things needed rarely, like moving data.
// Tapping a dialog's dimmed backdrop or its ✕ closes it.
for (const dlg of document.querySelectorAll('#menu, #move-dialog, #feedback-dialog, #help-dialog, #inbox-dialog, #progress-dialog, #profile-dialog')) {
  dlg.onclick = (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  };
}
$('#menu-btn').onclick = () => $('#menu').showModal();
$('#progress-btn').onclick = () => $('#progress-dialog').showModal();
$('#menu-confirm').onclick = () => {
  prefs.confirm = !prefs.confirm;
  savePrefs(prefs);
  renderMenu();
};
$('#menu-profile').onclick = () => {
  $('#menu').close();
  $('#profile-dialog').showModal();
};
$('#menu-move').onclick = () => {
  $('#menu').close();
  $('#move-dialog').showModal();
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
  $('#move-dialog').close();
  resetForm();
  commit();
  toast(t('imported', { n: data.habits.length }));
};

// Friends: an anonymous profile and linked friends (see friends.js). The section only
// shows when FRIENDS_SERVER is set. It is rendered by renderFriends() on its own, not by
// render(), so typing a code or nickname isn't wiped by a re-render.
let friends = loadFriends();
let joinName = randomName();
let editingNick = null;
let preview = null; // { code, profile } of an invite being looked at before accepting
const lang = getLang();
const nameOf = (profile) => profileName(profile.name, lang);

function avatar(el, name) {
  el.textContent = initials(name, lang);
  el.style.background = `hsl(${(name.animal * 47 + name.adj * 13) % 360} 55% 42%)`;
}

function renderFriends() {
  $('#friends-section').hidden = !friendsEnabled();
  // Feedback goes to the friends server too, and its inbox is for admin profiles only.
  $('#menu-feedback').hidden = !friendsEnabled();
  $('#menu-inbox').hidden = !(friends.me && friends.admin);
  const me = friends.me;
  $('#menu-profile').hidden = !me;
  $('#menu-signin').hidden = Boolean(me) || !friendsEnabled();
  if (!me && $('#profile-dialog').open) $('#profile-dialog').close();
  $('#friends-join').hidden = Boolean(me);
  $('#friends-main').hidden = !me;
  $('#friends-count').textContent = me && friends.friends.length ? `${friends.friends.length}` : '';
  if (!me) {
    avatar($('#join-avatar'), joinName);
    $('#join-name').textContent = profileName(joinName, lang);
    return;
  }
  avatar($('#me-avatar'), me.name);
  $('#me-name').textContent = nameOf(me);
  $('#me-stats').textContent = t('stats', sharedStats(state.habits, state.completions));
  avatar($('#profile-avatar'), me.name);
  $('#profile-name').textContent = nameOf(me);
  $('#recovery-code').textContent = formatCode(friends.code);
  $('#backup-status').textContent = friends.backedUpAt
    ? t('lastBackup', { when: new Date(friends.backedUpAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) })
    : t('noBackupYet');
  $('#no-friends').hidden = friends.friends.length > 0;
  $('#friend-list').replaceChildren(...friends.friends.map(friendItem));
  $('#add-preview').hidden = !preview;
  if (preview) {
    avatar($('#add-avatar'), preview.profile.name);
    const already = friends.friends.some((f) => f.id === preview.profile.id);
    $('#add-preview-text').textContent = t(already ? 'alreadyFriends' : 'addPreview', { name: nameOf(preview.profile) });
    $('#add-ok').hidden = already;
  }
}

function friendItem(f) {
  const li = document.createElement('li');
  li.className = 'habit friend';
  const nick = friends.nicknames[f.id];
  const name = nameOf(f);
  const stats = t('stats', f);
  li.innerHTML = `
    <span class="avatar" aria-hidden="true"></span>
    <span class="name">${
      f.id === editingNick
        ? `<input class="nick" maxlength="40" value="${esc(nick || '')}" placeholder="${esc(t('nickname'))}" aria-label="${esc(t('setNickname', { name }))}">`
        : `<span class="title">${esc(nick || name)}</span>${nick ? `<small>${esc(name)}</small>` : ''}<small>${esc(stats)}</small>`
    }</span>
    <button class="edit" aria-label="${esc(t('setNickname', { name }))}">${f.id === editingNick ? '✓' : '✎'}</button>
    <button class="delete" aria-label="${esc(t('removeFriend', { name }))}">✕</button>`;
  avatar(li.querySelector('.avatar'), f.name);
  const input = li.querySelector('.nick');
  const saveNick = () => {
    const value = input.value.trim();
    if (value) friends.nicknames[f.id] = value;
    else delete friends.nicknames[f.id];
    editingNick = null;
    commitFriends();
  };
  if (input) {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') saveNick();
      if (e.key === 'Escape') {
        editingNick = null;
        renderFriends();
      }
    };
    queueMicrotask(() => input.focus());
  }
  li.querySelector('.edit').onclick = () => {
    if (input) return saveNick();
    editingNick = f.id;
    renderFriends();
  };
  li.querySelector('.delete').onclick = (e) => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = t('removeConfirm');
      setTimeout(() => btn.isConnected && renderFriends(), 3000);
      return;
    }
    friendsCall(async () => {
      await removeFriend(friends.code, f.id);
      friends.friends = friends.friends.filter((x) => x.id !== f.id);
      delete friends.nicknames[f.id];
      commitFriends();
    });
  };
  return li;
}

function commitFriends() {
  saveFriends(friends);
  renderFriends();
  backupSoon();
}

// A failed call (status 0) blames the connection only when the device knows it's offline;
// otherwise the server is down, and the message says so instead.
const SERVER_DOWN = { offline: 'serverDown', feedbackOffline: 'feedbackServerDown', signOutOffline: 'signOutServerDown' };
const unreachable = (key) => (navigator.onLine === false ? key : SERVER_DOWN[key] || key);

// Runs a server call, turning failures into a toast. `messages` maps HTTP statuses (0 for
// no connection) to string keys; a 401 on a signed-in call means the profile was deleted elsewhere.
async function friendsCall(fn, messages = {}) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ServerError)) throw err;
    // A null message keeps a background call quiet, e.g. a refresh while offline.
    if (err.status in messages) return messages[err.status] && toast(t(err.status === 0 ? unreachable(messages[0]) : messages[err.status]));
    if (err.status === 401 && friends.me) {
      friends = { ...friends, code: '', me: null, admin: false, adminDevice: '', friends: [], sent: '', backup: false, backedUp: '', backedUpAt: '' };
      commitFriends();
      return toast(t('profileGone'));
    }
    toast(t(err.status === 0 ? unreachable('offline') : 'serverError'));
  }
}

async function refreshFriends() {
  if (!friends.me) return;
  refreshFriends.last = Date.now();
  await friendsCall(async () => {
    const { me, friends: list, admin } = await fetchMe(friends.code);
    friends.me = me;
    friends.friends = list;
    friends.admin = Boolean(admin);
    commitFriends();
  }, { 0: null });
  syncAdminDevice();
}

// Friends see level and streak, so send them whenever they change (shortly after, so a
// burst of check-ins makes one request).
let statsTimer;
function sendStatsSoon(delay = 1500) {
  if (!friends.me) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(async () => {
    const stats = sharedStats(state.habits, state.completions);
    const key = JSON.stringify(stats);
    if (key === friends.sent) return;
    await friendsCall(async () => {
      await sendStats(friends.code, stats);
      friends.sent = key;
      saveFriends(friends);
    }, { 0: null });
  }, delay);
}

// Habit backup and sync (see backup.js and sync.js): while signed in, the habits, their
// history and the nicknames are kept encrypted on the friends server. Each sync fetches
// that copy, merges it with this device's and stores the result, so every device signed in
// to the profile ends up with the check-ins of all of them. It runs shortly after each
// change, on opening, when the app comes back to the screen and every minute while open.
// `friends.backedUpAt` is when the stored copy last changed (shown in My profile).
let backupTimer;
function backupSoon(delay = 3000) {
  if (!friends.me || !friends.backup) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => syncNow(), delay);
}

// Takes over a state from the server without stamping it as this device's own change.
function adopt(next) {
  state = { ...next, notified: state.notified };
  committed = structuredClone(state);
  save(state);
  syncPush(state);
  render();
  sendStatsSoon();
}

// Returns true once this device and the server hold the same habits, false if the
// server couldn't be reached. Calls made while one runs are folded into a rerun.
let syncing = null;
let syncAgain = false;
async function syncNow() {
  if (!friends.me || !friends.backup) return false;
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = friends.code;
      let saved = null;
      try {
        saved = await fetchBackup(code);
      } catch (err) {
        if (!(err instanceof ServerError)) throw err;
        if (err.status === 401) {
          await friendsCall(async () => { throw err; }); // signs out: the profile is gone
          return false;
        }
        if (err.status !== 404) return false;
      }
      let theirs = null;
      try {
        if (saved) theirs = await decryptBackup(code, saved.data);
      } catch {
        // Damaged or unreadable: this device's copy replaces it.
      }
      if (code !== friends.code || !friends.backup) return false;
      if (theirs) {
        const merged = mergeStates(state, theirs);
        if (!sameData(merged, state)) adopt(merged);
        const nicknames = { ...theirs.nicknames, ...friends.nicknames };
        if (JSON.stringify(nicknames) !== JSON.stringify(friends.nicknames)) {
          friends.nicknames = nicknames;
          saveFriends(friends);
          renderFriends();
        }
      }
      const text = backupText(state, friends.nicknames);
      if (theirs && sameData(state, theirs) && JSON.stringify(theirs.nicknames) === JSON.stringify(friends.nicknames)) {
        return markSynced(saved.updatedAt);
      }
      try {
        const { updatedAt } = await uploadBackup(code, await encryptBackup(code, text), saved ? saved.updatedAt : null);
        if (code === friends.code) return markSynced(updatedAt);
        return false;
      } catch (err) {
        if (!(err instanceof ServerError)) throw err;
        if (err.status === 409) continue; // another device was quicker: merge with its copy
        if (err.status !== 0) await friendsCall(async () => { throw err; });
        return false;
      }
    }
    return false;
  })();
  try {
    return await syncing;
  } finally {
    syncing = null;
    if (syncAgain) {
      syncAgain = false;
      backupSoon(0);
    }
  }
}

function markSynced(updatedAt) {
  if (friends.backedUpAt !== updatedAt) {
    friends.backedUpAt = updatedAt;
    saveFriends(friends);
    renderFriends();
  }
  return true;
}

// "Back up now" in My profile syncs straight away and says how it went.
$('#backup-now').onclick = (e) =>
  busy(e.currentTarget, async () => {
    clearTimeout(backupTimer);
    // Before the first choice is made, the backup is offered first, never overwritten.
    if (!friends.backup) return checkBackup(true);
    toast(t((await syncNow()) ? 'backedUp' : unreachable('offline')));
  });

// After signing in, decides how this device joins the profile's habits: it takes the
// backup when it has no habits of its own, and asks when both have some (combine them, or
// use only the backup's). Until then nothing is uploaded, so signing in can't overwrite a
// backup before it's offered. Offline, it tries again next start.
async function checkBackup(manual = false) {
  if (!friends.me || friends.backup) return;
  const code = friends.code;
  let saved = null;
  try {
    saved = await fetchBackup(code);
  } catch (err) {
    if (!(err instanceof ServerError) || err.status !== 404) return manual && toast(t(unreachable('offline')));
  }
  let backup = null;
  try {
    if (saved) backup = await decryptBackup(code, saved.data);
  } catch {
    // Damaged or unreadable: this device's habits replace it.
  }
  if (code !== friends.code) return;
  if (backup && backup.habits.length && state.habits.length && !sameData(mergeStates(state, backup), state)) {
    return offerBackup(backup, saved.updatedAt);
  }
  if (backup && backup.habits.length && !state.habits.length) useBackup(backup);
  else if (backup) friends.nicknames = { ...backup.nicknames, ...friends.nicknames };
  backupDecided();
}

function offerBackup(backup, updatedAt) {
  const dlg = $('#backup-dialog');
  const date = new Date(updatedAt).toLocaleDateString(getLang(), { dateStyle: 'medium' });
  $('#backup-text').textContent = t('backupOffer', { n: backup.habits.length, date, here: state.habits.length });
  dlg.returnValue = '';
  dlg.onclose = () => {
    // Closed without a choice: asked again next time.
    if (!dlg.returnValue) return;
    if (dlg.returnValue === 'use') useBackup(backup);
    else if (dlg.returnValue === 'combine') {
      adopt(mergeStates(state, backup));
      friends.nicknames = { ...backup.nicknames, ...friends.nicknames };
    }
    backupDecided();
  };
  dlg.showModal();
}

function useBackup(backup) {
  const { nicknames, ...rest } = backup;
  // Habits only this device had count as deleted, so the other devices drop them too.
  const now = new Date().toISOString();
  const deleted = { ...rest.sync?.deleted };
  for (const h of state.habits) if (!rest.habits.some((x) => x.id === h.id)) deleted[h.id] = now;
  adopt({ ...rest, sync: { ...rest.sync, deleted } });
  resetForm();
  friends.nicknames = { ...nicknames, ...friends.nicknames };
  toast(t('backupRestored', { n: rest.habits.length }));
}

function backupDecided() {
  friends.backup = true;
  commitFriends();
  backupSoon(0);
}

// A new profile (`showProfile`) opens My profile straight away, so its recovery code gets saved.
async function signedIn(code, data, message, showProfile = false) {
  friends = { ...friends, code, me: data.me, admin: Boolean(data.admin), friends: data.friends || [], sent: '', backup: false, backedUp: '', backedUpAt: '' };
  commitFriends();
  if (showProfile) $('#profile-dialog').showModal();
  toast(t(message, { name: nameOf(data.me) }));
  sendStatsSoon(0);
  checkBackup();
  $('#invite-elsewhere').hidden = true;
  if (pendingInvite) lookUpInvite(pendingInvite);
}

$('#reroll').onclick = () => {
  const old = joinName;
  do joinName = randomName();
  while (joinName.adj === old.adj && joinName.animal === old.animal);
  renderFriends();
};

$('#join').onclick = (e) =>
  busy(e.currentTarget, () =>
    friendsCall(async () => {
      const { code, me } = await createProfile(joinName);
      await signedIn(code, { me }, 'welcome', true);
    }),
  );

// Signing in with a recovery code: from the ⋮ menu or the Friends section. On iPhone a
// home screen app has storage apart from Safari, so a profile made in Safari is missing there.
$('#ios-storage-note').hidden = installPlatform(navigator.userAgent, navigator.maxTouchPoints) !== 'ios';
$('#menu-signin').onclick = () => {
  $('#menu').close();
  $('#friends-section').open = true;
  $('#restore').hidden = false;
  $('#friends-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#restore-code').focus({ preventScroll: true });
};
$('#show-restore').onclick = () => {
  $('#restore').hidden = !$('#restore').hidden;
  if (!$('#restore').hidden) $('#restore-code').focus();
};

$('#restore-btn').onclick = (e) => {
  const code = normalizeCode($('#restore-code').value);
  if (!isCode(code, RECOVERY_LENGTH)) return toast(t('wrongRecovery'));
  busy(e.currentTarget, () =>
    friendsCall(async () => {
      const data = await fetchMe(code);
      $('#restore-code').value = '';
      await signedIn(code, data, 'restored');
    }, { 401: 'wrongRecovery' }),
  );
};

$('#invite-btn').onclick = (e) =>
  busy(e.currentTarget, () =>
    friendsCall(async () => {
      const { code } = await createInvite(friends.code);
      friends.invite = code;
      $('#invite-code').textContent = formatCode(code);
      $('#invite-box').hidden = false;
    }),
  );

$('#share-invite').onclick = async () => {
  const code = formatCode(friends.invite);
  // A link on the friends server, which opens the Android app when it's installed (App
  // Links) and otherwise forwards to this page with #invite=CODE.
  const url = `${FRIENDS_SERVER}/invite/${friends.invite}`;
  const text = t('inviteShare', { code, url });
  try {
    if (navigator.share) return await navigator.share({ text });
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  copyText(text);
};

$('#copy-recovery').onclick = () => copyText(formatCode(friends.code));

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    toast(t('copyByHand'));
  }
}

// Looking up an invite shows who sent it; nothing is linked until "Add friend".
async function lookUpInvite(raw) {
  pendingInvite = null;
  const code = normalizeCode(raw);
  if (!isCode(code, INVITE_LENGTH)) return toast(t('inviteNotFound'));
  await friendsCall(async () => {
    const { profile } = await previewInvite(friends.code, code);
    preview = { code, profile };
    renderFriends();
  }, { 404: 'inviteNotFound', 409: 'ownInvite' });
}

$('#add-friend').onclick = (e) => busy(e.currentTarget, () => lookUpInvite($('#add-code').value));
$('#add-code').onkeydown = (e) => e.key === 'Enter' && $('#add-friend').click();

$('#add-cancel').onclick = () => {
  preview = null;
  renderFriends();
};

$('#add-ok').onclick = (e) =>
  busy(e.currentTarget, () =>
    friendsCall(async () => {
      const { friend } = await acceptInvite(friends.code, preview.code);
      preview = null;
      $('#add-code').value = '';
      $('#open-in-app').hidden = true;
      $('#invite-elsewhere').hidden = true;
      friends.friends = [...friends.friends.filter((f) => f.id !== friend.id), friend];
      commitFriends();
      toast(t('friendAdded', { name: nameOf(friend) }));
    }, { 404: 'inviteNotFound', 409: 'ownInvite' }),
  );

$('#show-add').onclick = () => {
  $('#add-row').hidden = !$('#add-row').hidden;
  if (!$('#add-row').hidden) $('#add-code').focus();
};

// Signing out clears this phone but keeps the profile and its backup on the server, so the
// recovery code brings everything back. It backs up first and stops if that fails, so no
// habits are lost. Before the restore choice is made, this phone's habits may not be in the
// backup, so it asks for that choice first.
$('#sign-out').onclick = (e) => {
  const btn = e.currentTarget;
  if (!friends.backup) return checkBackup(true);
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = t('signOutConfirm');
    setTimeout(() => {
      btn.classList.remove('armed');
      btn.textContent = t('signOut');
    }, 3000);
    return;
  }
  btn.classList.remove('armed');
  btn.textContent = t('signOut');
  busy(btn, () =>
    friendsCall(async () => {
      clearTimeout(backupTimer);
      clearTimeout(statsTimer);
      while (syncing) await syncing.catch(() => {}); // a sync already running may predate the latest change
      if (!(await syncNow())) throw new ServerError(0, 'not synced');
      friends = { code: '', me: null, admin: false, friends: [], nicknames: {}, sent: '', backup: false, backedUp: '', backedUpAt: '' };
      $('#invite-box').hidden = true;
      $('#profile-dialog').close();
      resetForm();
      // Not commit(): that would stamp every habit as deleted, and signing in again with
      // "Combine" would then delete them from the backup.
      state = empty();
      adopt(state);
      commitFriends();
      toast(t('signedOut'));
    }, { 0: 'signOutOffline' }),
  );
};

$('#leave').onclick = (e) => {
  const btn = e.currentTarget;
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = t('deleteProfileConfirm');
    setTimeout(() => {
      btn.classList.remove('armed');
      btn.textContent = t('deleteProfile');
    }, 3000);
    return;
  }
  btn.classList.remove('armed');
  btn.textContent = t('deleteProfile');
  friendsCall(async () => {
    await deleteProfile(friends.code);
    friends = { code: '', me: null, admin: false, friends: [], nicknames: {}, sent: '', backup: false, backedUp: '', backedUpAt: '' };
    $('#invite-box').hidden = true;
    $('#profile-dialog').close();
    commitFriends();
    toast(t('profileDeleted'));
  });
};

// Feedback from the ⋮ menu goes to the friends server anonymously (no profile needed).
// Profiles listed as admins on the server also get a "Feedback inbox" in the menu.
// Sending returns a token that lets this device read replies and answer back, still
// anonymously (see feedback.js). Threads live under FEEDBACK_KEY, apart from everything else.
let myFeedback = (() => {
  try {
    return parseThreads(localStorage.getItem(FEEDBACK_KEY));
  } catch {
    return [];
  }
})();

function saveMyFeedback() {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(myFeedback));
  } catch {
    // Blocked storage: replies only last for this session.
  }
  renderMyFeedback();
}

// Titles for pushes to this device, in its language.
const feedbackTitles = () => ({ reply: t('feedbackReplyTitle'), reaction: t('feedbackReactionTitle') });

$('#menu-feedback').onclick = () => {
  $('#menu').close();
  openMyFeedback();
};

function openMyFeedback() {
  // Who admins will see it from: the profile name, or no name without a profile.
  $('#feedback-from').textContent = friends.me ? t('feedbackAsName', { name: nameOf(friends.me) }) : t('feedbackNoName');
  if (!$('#feedback-dialog').open) $('#feedback-dialog').showModal();
  myFeedback = markSeen(myFeedback);
  saveMyFeedback();
  refreshMyFeedback(true);
}

$('#feedback-send').onclick = (e) => {
  const text = $('#feedback-text').value.trim();
  if (!text) return $('#feedback-text').focus();
  busy(e.currentTarget, () =>
    friendsCall(async () => {
      const endpoint = await pushEndpoint().catch(() => null);
      const { id, token } = await sendFeedback(friends.code, {
        text, lang, platform: androidApp ? 'android' : 'web', endpoint: endpoint || undefined, titles: feedbackTitles(),
      });
      $('#feedback-text').value = '';
      if (id && token) {
        myFeedback = addThread(myFeedback, { id, token, text, createdAt: new Date().toISOString() });
        myFeedback[0].endpoint = endpoint || '';
        saveMyFeedback();
      }
      toast(t('feedbackThanks'));
    }, { 0: 'feedbackOffline', 429: 'feedbackTooMuch' }),
  );
};

// Fetches replies for open threads (at most once a minute unless `now`), and tells the
// server about this device's push endpoint when it has a new one.
async function refreshMyFeedback(now = false) {
  if (!friendsEnabled() || !myFeedback.some((th) => !th.closed)) return;
  if (!now && Date.now() - (refreshMyFeedback.last || 0) < 60_000) return;
  refreshMyFeedback.last = Date.now();
  const endpoint = await pushEndpoint().catch(() => null);
  for (const thread of myFeedback.filter((th) => !th.closed)) {
    try {
      const remote = await fetchThread(thread.id, thread.token);
      myFeedback = updateThread(myFeedback, thread.id, remote);
      if (endpoint && thread.endpoint !== endpoint) {
        await threadDevice(thread.id, thread.token, { endpoint, titles: feedbackTitles() });
        myFeedback = myFeedback.map((th) => (th.id === thread.id ? { ...th, endpoint } : th));
      }
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      if (err.status === 404) myFeedback = updateThread(myFeedback, thread.id, null);
      else if (err.status === 0) break; // offline
    }
  }
  if ($('#feedback-dialog').open) myFeedback = markSeen(myFeedback);
  saveMyFeedback();
}

const shortDate = (iso) => new Date(iso).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' });

function messageItem(m, mine) {
  const li = document.createElement('li');
  li.className = `msg ${m.fromAdmin === mine ? 'mine' : 'theirs'}`;
  const who = m.fromAdmin ? (mine ? t('fromYou') : t('fromAdmin')) : mine ? t('fromSender') : t('fromYou');
  li.innerHTML = `<span class="who">${esc(who)} · ${esc(shortDate(m.createdAt))}</span><p>${esc(m.text)}</p>`;
  return li;
}

// A reply box: a textarea and a send button that runs `send(text)`. Drafts survive
// re-renders until `send` clears them with `delete drafts[key]` once sent.
const drafts = {};
function replyBox(key, send) {
  const box = document.createElement('div');
  box.className = 'reply-box';
  box.innerHTML = `
    <textarea rows="2" maxlength="2000" placeholder="${esc(t('replyPlaceholder'))}" aria-label="${esc(t('replyPlaceholder'))}"></textarea>
    <button type="button" class="reply-send">${esc(t('sendFeedback'))}</button>`;
  const area = box.querySelector('textarea');
  area.value = drafts[key] || '';
  area.oninput = () => (drafts[key] = area.value);
  box.querySelector('button').onclick = (e) => {
    const text = area.value.trim();
    if (!text) return area.focus();
    busy(e.currentTarget, () => send(text));
  };
  return box;
}

// The sender's threads, under the feedback form, and the unread count on the ⋮ menu.
function renderMyFeedback() {
  const count = unreadTotal(myFeedback);
  $('#menu-feedback').textContent = t('feedbackItem') + (count ? ` (${count})` : '');
  $('#menu-btn').classList.toggle('has-unread', count > 0);
  $('#my-feedback').hidden = myFeedback.length === 0;
  $('#my-feedback-list').replaceChildren(
    ...myFeedback.map((th) => {
      const li = document.createElement('li');
      li.className = 'thread';
      li.innerHTML = `
        <span class="who">${esc(shortDate(th.createdAt))}${th.reaction ? ` · ${esc(t('reaction', { emoji: th.reaction }))}` : ''}</span>
        <p class="thread-text">${esc(th.text)}</p>
        <ul class="messages"></ul>`;
      li.querySelector('.messages').replaceChildren(...th.messages.map((m) => messageItem(m, false)));
      if (th.closed) {
        li.insertAdjacentHTML('beforeend', `<p class="muted">${esc(t('threadClosed'))}</p>`);
      } else if (th.messages.some((m) => m.fromAdmin)) {
        li.append(
          replyBox(`mine:${th.id}`, (text) =>
            friendsCall(async () => {
              await answerThread(th.id, th.token, text);
              delete drafts[`mine:${th.id}`];
              toast(t('answerSent'));
              await refreshMyFeedback(true);
            }, { 0: 'feedbackOffline', 429: 'feedbackTooMuch', 404: 'threadClosed' }),
          ),
        );
      }
      return li;
    }),
  );
}

// The admin inbox: a compact table with status, filters and search, so lots of feedback
// stays manageable. Tapping a row opens it to reply, react or clear it.
let inbox = [];
let openFeedback = null;
const inboxFilter = { status: 'all', platform: 'all', lang: 'all', sender: 'all', query: '', oldestFirst: false };

// Who sent a feedback: their profile name, after your own nickname for them if they're a friend.
function senderLabel(f) {
  if (!f.sender) return t('noProfile');
  const nick = friends.nicknames[f.sender.id];
  const name = nameOf(f.sender);
  return nick ? `${nick} (${name})` : name;
}
const STATUSES = ['all', 'new', 'waiting', 'answered'];
const statusLabel = { all: 'statusAll', new: 'statusNew', waiting: 'statusWaiting', answered: 'statusAnswered' };

$('#menu-inbox').onclick = () => {
  $('#menu').close();
  openInbox();
};

$('#inbox-search').oninput = (e) => {
  inboxFilter.query = e.target.value;
  renderInbox();
};
$('#inbox-platform').onchange = (e) => {
  inboxFilter.platform = e.target.value;
  renderInbox();
};
$('#inbox-lang').onchange = (e) => {
  inboxFilter.lang = e.target.value;
  renderInbox();
};
$('#inbox-sender').onchange = (e) => {
  inboxFilter.sender = e.target.value;
  renderInbox();
};
$('#inbox-sort').onclick = () => {
  inboxFilter.oldestFirst = !inboxFilter.oldestFirst;
  renderInbox();
};

async function loadInbox() {
  await friendsCall(async () => {
    const { feedback } = await fetchFeedback(friends.code);
    inbox = feedback.map((f) => ({ ...f, from: senderLabel(f) }));
    renderInbox();
  });
}

function openInbox() {
  renderInbox();
  if (!$('#inbox-dialog').open) $('#inbox-dialog').showModal();
  loadInbox();
  // The Android app checks for new feedback itself (FeedbackJob), so the hint is web-only.
  pushEndpoint()
    .catch(() => null)
    .then((endpoint) => ($('#inbox-push-hint').hidden = Boolean(endpoint) || androidApp));
}

// An admin's device with push reminders on registers its push endpoint, so the server
// sends it a notification for each new feedback. Re-sent once a day (and when the
// endpoint or language changes) in case the server dropped it.
async function syncAdminDevice() {
  if (!friends.me || !friends.admin) return;
  const endpoint = await pushEndpoint().catch(() => null);
  if (!endpoint) return;
  const key = `${dateKey()}|${lang}|${endpoint}`;
  if (friends.adminDevice === key) return;
  await friendsCall(async () => {
    await registerAdminDevice(friends.code, { endpoint, title: t('feedbackPushTitle') });
    friends.adminDevice = key;
    saveFriends(friends);
  }, { 0: null, 403: null });
}

// Help and the full "What's new" list, from the ⋮ menu or the banner below.
$('#menu-help').onclick = () => {
  $('#menu').close();
  openHelp();
};

function openHelp(atWhatsNew = false) {
  $('#help-topics').innerHTML = t('helpTopics')
    .map(([title, text]) => `<h3>${esc(title)}</h3><p>${esc(text)}</p>`)
    .join('');
  $('#whats-new-list').innerHTML = changesByDate(getLang())
    .map(({ date, items }) => {
      const when = new Date(`${date}T12:00`).toLocaleDateString(getLang(), { dateStyle: 'long' });
      return `<h3>${esc(when)}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    })
    .join('');
  $('#help-dialog').showModal();
  const help = $('#help-dialog .help');
  help.scrollTop = atWhatsNew ? $('#whats-new-title').offsetTop - help.offsetTop : 0;
}

// After an update with a notable change, a small banner says so once. It counts as seen
// as soon as it shows, so it never comes back on the next launch.
const newChange = bannerChange(loadSeenVersion(), state.habits.length > 0);
saveSeenVersion(LATEST);
if (newChange) {
  $('#whats-new-text').textContent = t('newBanner', { text: newChange[getLang()] ?? newChange.en });
  $('#whats-new-banner').hidden = false;
}
$('#whats-new-close').onclick = () => ($('#whats-new-banner').hidden = true);
$('#whats-new-more').onclick = () => {
  $('#whats-new-banner').hidden = true;
  openHelp(true);
};

// Tapping a new-feedback notification opens the app at …#inbox, and a reply to your own
// feedback at …#feedback.
function openInboxLink() {
  if (location.hash !== '#inbox' && location.hash !== '#feedback') return;
  const hash = location.hash;
  history.replaceState(null, '', location.pathname + location.search);
  if (hash === '#feedback') openMyFeedback();
  else if (friends.me && friends.admin) openInbox();
}
openInboxLink();
window.addEventListener('hashchange', openInboxLink);

function renderInbox() {
  const counts = statusCounts(inbox);
  $('#inbox-status').replaceChildren(
    ...STATUSES.map((st) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(inboxFilter.status === st));
      b.textContent = `${t(statusLabel[st])} ${counts[st]}`;
      b.onclick = () => {
        inboxFilter.status = st;
        renderInbox();
      };
      return b;
    }),
  );
  const option = (value, label, selected) => {
    const o = new Option(label, value);
    o.selected = value === selected;
    return o;
  };
  $('#inbox-platform').replaceChildren(
    option('all', t('allPlatforms'), inboxFilter.platform),
    option('android', 'Android', inboxFilter.platform),
    option('web', 'Web', inboxFilter.platform),
  );
  const langs = [...new Set(inbox.map((f) => f.lang))].sort();
  $('#inbox-lang').replaceChildren(
    option('all', t('allLanguages'), inboxFilter.lang),
    ...langs.map((l) => option(l, l.toUpperCase(), inboxFilter.lang)),
  );
  $('#inbox-sender').replaceChildren(
    option('all', t('allSenders'), inboxFilter.sender),
    option('named', t('withProfile'), inboxFilter.sender),
    option('none', t('noProfile'), inboxFilter.sender),
  );
  $('#inbox-sort').textContent = t(inboxFilter.oldestFirst ? 'oldestFirst' : 'newestFirst');

  const shown = filterFeedback(inbox, inboxFilter);
  $('#inbox-empty').hidden = shown.length > 0;
  $('#inbox-list').replaceChildren(...shown.flatMap((f) => inboxRows(f)));
}

function inboxRows(f) {
  const row = document.createElement('tr');
  const status = feedbackStatus(f);
  const open = openFeedback === f.id;
  row.className = `fb-row${open ? ' open' : ''}`;
  row.tabIndex = 0;
  row.setAttribute('aria-expanded', String(open));
  const day = new Date(f.createdAt).toLocaleDateString(lang, { day: 'numeric', month: 'numeric' });
  row.innerHTML = `
    <td class="fb-status"><span class="dot ${status}" title="${esc(t(statusLabel[status]))}"></span></td>
    <td class="fb-text"><div class="fb-from${f.sender ? '' : ' none'}">${esc(f.from)}</div>
      <div>${f.reaction ? `${esc(f.reaction)} ` : ''}${esc(f.text)}</div></td>
    <td class="fb-meta">${esc(day)}<br>${esc(f.lang.toUpperCase())} · ${f.platform === 'android' ? 'Android' : 'Web'}</td>`;
  const toggle = () => {
    openFeedback = open ? null : f.id;
    renderInbox();
  };
  row.onclick = toggle;
  row.onkeydown = (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle());
  if (!open) return [row];

  const detail = document.createElement('tr');
  detail.className = 'fb-detail';
  detail.innerHTML = `
    <td colspan="3">
      <div class="inbox-meta"><span><b class="fb-from${f.sender ? '' : ' none'}">${esc(f.from)}</b><br>${esc(shortDate(f.createdAt))} · ${esc(f.lang.toUpperCase())} · ${f.platform === 'android' ? 'Android' : 'Web'}</span>
        <button type="button" class="delete">${esc(t('inboxDone'))}</button></div>
      <p class="thread-text">${esc(f.text)}</p>
      <ul class="messages"></ul>
    </td>`;
  const cell = detail.querySelector('td');
  cell.querySelector('.messages').replaceChildren(...f.messages.map((m) => messageItem(m, true)));
  if (f.replyable) {
    const reactions = document.createElement('div');
    reactions.className = 'reactions';
    for (const emoji of REACTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.setAttribute('aria-label', t('reactionLabel', { emoji }));
      b.setAttribute('aria-pressed', String(f.reaction === emoji));
      // Tapping the current reaction again takes it back.
      b.onclick = (e) =>
        busy(e.currentTarget, () =>
          friendsCall(async () => {
            await reactToFeedback(friends.code, f.id, f.reaction === emoji ? '' : emoji);
            await loadInbox();
          }),
        );
      reactions.append(b);
    }
    cell.append(
      reactions,
      replyBox(`inbox:${f.id}`, (text) =>
        friendsCall(async () => {
          await replyToFeedback(friends.code, f.id, text);
          delete drafts[`inbox:${f.id}`];
          await loadInbox();
        }),
      ),
    );
  } else {
    cell.insertAdjacentHTML('beforeend', `<p class="muted">${esc(t('notReplyable'))}</p>`);
  }
  cell.querySelector('.delete').onclick = (e) => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = t('inboxDoneConfirm');
      setTimeout(() => btn.isConnected && renderInbox(), 3000);
      return;
    }
    friendsCall(async () => {
      await deleteFeedback(friends.code, f.id);
      inbox = inbox.filter((x) => x.id !== f.id);
      openFeedback = null;
      renderInbox();
    });
  };
  return [row, detail];
}

// Disables a button while its request runs, so a double tap doesn't send twice.
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.disabled = false;
  }
}

// An invite link (…#invite=CODE) opens the Friends section with the code filled in and
// scrolls to it, since the section sits below the fold. It's handled on load and on
// hashchange, because opening the link while the app is already open (or from the
// Android app, see MainActivity) only changes the hash and doesn't reload the page.
let pendingInvite = null;
function openInviteLink() {
  const link = location.hash.match(/^#invite=([\w-]+)$/);
  if (!link || !friendsEnabled()) return;
  history.replaceState(null, '', location.pathname + location.search);
  const code = normalizeCode(link[1]);
  $('#friends-section').open = true;
  $('#add-code').value = formatCode(code);
  $('#add-row').hidden = false;
  // An invite opened in an Android browser lands in the browser's storage, not the
  // Android app's, so offer to hand it to the app (habitchecker://invite/CODE).
  const inBrowserOnAndroid = /Android/i.test(navigator.userAgent) && !androidApp && !embedded;
  $('#open-in-app').hidden = !inBrowserOnAndroid;
  if (inBrowserOnAndroid) {
    const fallback = encodeURIComponent(`${location.origin}${location.pathname}`);
    $('#open-in-app-link').href = `intent://invite/${code}#Intent;scheme=habitchecker;package=io.github.tmerello1.habitchecker;S.browser_fallback_url=${fallback};end`;
  }
  // Without a profile here, the friend may have one elsewhere: an installed web app
  // opened from another browser keeps separate storage, so offer the code to carry over.
  $('#invite-elsewhere').hidden = Boolean(friends.me) || androidApp;
  $('#invite-elsewhere-text').textContent = t('inviteElsewhere', { code: formatCode(code) });
  $('#copy-invite-code').onclick = () => copyText(formatCode(code));
  if (friends.me) lookUpInvite(code);
  else pendingInvite = code;
  $('#friends-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
openInviteLink();
window.addEventListener('hashchange', openInviteLink);

$('#friends-section').addEventListener('toggle', (e) => e.currentTarget.open && refreshFriends());

function checkReminders() {
  // With the push server on, it sends the reminders (even while the app is closed).
  if (pushActive()) return;
  for (const h of dueReminders(state)) {
    notify(h);
    state.notified[h.id] = dateKey();
  }
  save(state);
}

// Re-render on focus so "today" rolls over if the app was left open past midnight, and
// fetch friends' latest streaks (at most once a minute).
window.addEventListener('focus', () => {
  render();
  if (Date.now() - (refreshFriends.last || 0) > 60_000) refreshFriends();
  refreshMyFeedback();
});
setInterval(checkReminders, 30_000);
// Picks up check-ins from the profile's other devices (see syncNow).
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && backupSoon(0));
setInterval(() => document.visibilityState === 'visible' && backupSoon(0), 60_000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
renderFriends();
renderMyFeedback();
refreshFriends();
refreshMyFeedback(true);
sendStatsSoon();
checkBackup();
backupSoon(0);
checkReminders();
enablePush(state).then(syncAdminDevice);
