// Background reminders through the push server. The app subscribes this device for Web Push
// and sends the server a copy of the habit schedule, its timezone and the latest check-ins;
// the server then pushes each reminder at its time, even while the app is closed.
// Everything here quietly does nothing when PUSH_SERVER isn't set or push isn't available,
// and the open-page reminders in reminders.js keep working as before.

import { PUSH_SERVER } from './config.js';
import { dateKey } from './dates.js';

const SYNCED_KEY = 'habit-checker:push-synced';
let active = false;
let timer;

// True once the server has this device's schedule, so the open page shouldn't remind too.
export const pushActive = () => active;

function supported() {
  return Boolean(PUSH_SERVER) && 'serviceWorker' in navigator && 'PushManager' in window && window.self === window.top;
}

function keyBytes(b64url) {
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function subscription() {
  const reg = await navigator.serviceWorker.ready;
  const { key } = await (await fetch(`${PUSH_SERVER}/vapid-public-key`)).json();
  const serverKey = keyBytes(key);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for a different server key would be rejected, so replace it.
  if (sub && !sameKey(sub.options.applicationServerKey, serverKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
}

// Subscribes (if notifications are allowed) and sends the schedule. Safe to call on every load.
export async function enablePush(state) {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    await send(state, await subscription());
  } catch (err) {
    console.warn('Push reminders unavailable, using in-app reminders', err);
  }
}

// Call after every change; sends the latest schedule to the server shortly after.
export function syncPush(state) {
  if (!active) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await send(state, sub);
    } catch (err) {
      console.warn('Push sync failed', err);
    }
  }, 1500);
}

async function send(state, sub) {
  // The server only needs the date of each habit's latest check-in to skip finished ones.
  const done = {};
  for (const [id, days] of Object.entries(state.completions)) if (days.length) done[id] = days.reduce((a, b) => (a > b ? a : b));
  const body = JSON.stringify({
    subscription: sub.toJSON(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    habits: state.habits.map(({ id, name, emoji, days, time, createdAt }) => ({ id, name, emoji, days, time, createdAt })),
    done,
  });
  // Skip unchanged syncs to stay well inside the server's free-tier write limits,
  // but still send once a day so the server never drifts for long.
  const stamp = `${dateKey()}|${body}`;
  if (readSynced() === stamp) {
    active = true;
    return;
  }
  const res = await fetch(`${PUSH_SERVER}/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error(`push server answered ${res.status}`);
  active = true;
  try {
    localStorage.setItem(SYNCED_KEY, stamp);
  } catch {
    // Storage blocked: we just sync a bit more often.
  }
}

function readSynced() {
  try {
    return localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}
