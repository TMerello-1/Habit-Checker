// UI layer: renders state into the DOM and wires up events. Every change goes
// through commit(), which saves and re-renders the whole view (the app is small
// enough that diffing isn't worth it).

import { formatCode, INVITE_LENGTH, isCode, normalizeCode, RECOVERY_LENGTH } from './codes.js';
import { dateKey } from './dates.js';
import { acceptInvite, createInvite, createProfile, deleteProfile, fetchMe, friendsEnabled, loadFriends, previewInvite, removeFriend, saveFriends, sendStats, ServerError } from './friends.js';
import { currentStreak, dueToday, editHabit, isDone, openToday, rewards, sharedStats, STREAK_MILESTONES } from './habits.js';
import { getLang, pickLang, setLang, t } from './i18n.js';
import { installPlatform, installSteps } from './install.js';
import { initials, profileName, randomName } from './names.js';
import { enablePush, pushActive, syncPush } from './push.js';
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
  syncPush(state);
  render();
  sendStatsSoon();
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

  if (friends.me) $('#me-stats').textContent = t('stats', sharedStats(habits, state.completions));

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
  enablePush(state);
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
  const me = friends.me;
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
  $('#recovery-code').textContent = formatCode(friends.code);
  $('#show-recovery').textContent = t($('#recovery-box').hidden ? 'showRecovery' : 'hideRecovery');
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
        : `${esc(nick || name)}<small>${nick ? `${esc(name)} · ` : ''}${esc(stats)}</small>`
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
}

// Runs a server call, turning failures into a toast. `messages` maps HTTP statuses (0 for
// no connection) to string keys; a 401 on a signed-in call means the profile was deleted elsewhere.
async function friendsCall(fn, messages = {}) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ServerError)) throw err;
    // A null message keeps a background call quiet, e.g. a refresh while offline.
    if (err.status in messages) return messages[err.status] && toast(t(messages[err.status]));
    if (err.status === 401 && friends.me) {
      friends = { ...friends, code: '', me: null, friends: [], sent: '' };
      commitFriends();
      return toast(t('profileGone'));
    }
    toast(t(err.status === 0 ? 'offline' : 'serverError'));
  }
}

async function refreshFriends() {
  if (!friends.me) return;
  refreshFriends.last = Date.now();
  await friendsCall(async () => {
    const { me, friends: list } = await fetchMe(friends.code);
    friends.me = me;
    friends.friends = list;
    commitFriends();
  }, { 0: null });
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

async function signedIn(code, data, message) {
  friends = { ...friends, code, me: data.me, friends: data.friends || [], sent: '' };
  commitFriends();
  toast(t(message, { name: nameOf(data.me) }));
  sendStatsSoon(0);
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
      $('#recovery-box').hidden = false;
      await signedIn(code, { me }, 'welcome');
    }),
  );

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
  const url = `${location.origin}${location.pathname}#invite=${friends.invite}`;
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
      friends.friends = [...friends.friends.filter((f) => f.id !== friend.id), friend];
      commitFriends();
      toast(t('friendAdded', { name: nameOf(friend) }));
    }, { 404: 'inviteNotFound', 409: 'ownInvite' }),
  );

$('#show-recovery').onclick = () => {
  $('#recovery-box').hidden = !$('#recovery-box').hidden;
  renderFriends();
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
    friends = { code: '', me: null, friends: [], nicknames: {}, sent: '' };
    $('#recovery-box').hidden = true;
    $('#invite-box').hidden = true;
    commitFriends();
    toast(t('profileDeleted'));
  });
};

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
  // An invite opened in an Android browser lands in the browser's storage, not the
  // Android app's, so offer to hand it to the app (habitchecker://invite/CODE).
  const inBrowserOnAndroid = /Android/i.test(navigator.userAgent) && !androidApp && !embedded;
  $('#open-in-app').hidden = !inBrowserOnAndroid;
  if (inBrowserOnAndroid) {
    const fallback = encodeURIComponent(`${location.origin}${location.pathname}`);
    $('#open-in-app-link').href = `intent://invite/${code}#Intent;scheme=habitchecker;package=io.github.tmerello1.habitchecker;S.browser_fallback_url=${fallback};end`;
  }
  if (friends.me) lookUpInvite(code);
  else {
    pendingInvite = code;
    toast(t('joinFirst'));
  }
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
});
setInterval(checkReminders, 30_000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
renderFriends();
refreshFriends();
sendStatsSoon();
checkReminders();
enablePush(state);
