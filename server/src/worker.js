// Habit Checker push server (Cloudflare Worker).
//
// The app registers its push subscription here together with a copy of its habit
// schedule, timezone and latest check-ins. A cron trigger runs every minute and sends a
// push for each reminder that is due, so reminders arrive while the app is closed.
//
// Storage (KV namespace bound as SUBS):
//   "sub:<id>"  one record per subscription: { subscription, timeZone, habits, done, notified, updatedAt }
//   "index"     JSON array of every <id>, so the cron reads one key instead of listing
//               (KV's free plan allows far more reads than list calls).
// Secret VAPID_JWK holds the VAPID private key; the deploy workflow creates it once.

import { dueHabits, isValidTimeZone, localClock } from './schedule.js';
import { sendPush, vapidPublicKey } from './webpush.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Only real browser push services, so the server can't be pointed at arbitrary URLs.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

async function subId(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readIndex(env) {
  return (await env.SUBS.get('index', 'json')) || [];
}

async function setIndexed(env, id, present) {
  const index = await readIndex(env);
  if (index.includes(id) === present) return;
  await env.SUBS.put('index', JSON.stringify(present ? [...index, id] : index.filter((x) => x !== id)));
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validSubscription(s) {
  try {
    const url = new URL(s.endpoint);
    return (
      url.protocol === 'https:' &&
      PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)) &&
      typeof s.keys?.p256dh === 'string' &&
      typeof s.keys?.auth === 'string'
    );
  } catch {
    return false;
  }
}

// Keep only the habit fields reminders need, with sane sizes.
function cleanHabits(habits) {
  if (!Array.isArray(habits)) return null;
  return habits.slice(0, 200).map((h) => ({
    id: str(h.id, 64),
    name: str(h.name, 100),
    emoji: str(h.emoji, 16),
    days: Array.isArray(h.days) ? h.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    time: /^\d{2}:\d{2}$/.test(h.time) ? h.time : '',
    createdAt: isDateKey(h.createdAt) ? h.createdAt : '1970-01-01',
  }));
}

function cleanDone(done) {
  const out = {};
  for (const [id, key] of Object.entries(done || {}).slice(0, 200)) if (isDateKey(key)) out[str(id, 64)] = key;
  return out;
}

async function subscribe(request, env) {
  const body = await request.json().catch(() => null);
  const habits = cleanHabits(body?.habits);
  if (!body || !validSubscription(body.subscription) || !habits || !isValidTimeZone(body.timeZone)) {
    return json({ error: 'invalid request' }, 400);
  }
  const { endpoint, keys } = body.subscription;
  const id = await subId(endpoint);
  const previous = await env.SUBS.get(`sub:${id}`, 'json');
  const record = {
    subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    timeZone: body.timeZone,
    habits,
    done: cleanDone(body.done),
    notified: previous?.notified || {},
    updatedAt: new Date().toISOString(),
  };
  await env.SUBS.put(`sub:${id}`, JSON.stringify(record));
  await setIndexed(env, id, true);
  return json({ ok: true });
}

async function unsubscribe(request, env) {
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== 'string') return json({ error: 'invalid request' }, 400);
  const id = await subId(body.endpoint);
  await forget(env, id);
  return json({ ok: true });
}

async function forget(env, id) {
  await env.SUBS.delete(`sub:${id}`);
  await setIndexed(env, id, false);
}

export async function runReminders(env, now = new Date()) {
  const jwk = JSON.parse(env.VAPID_JWK);
  const subject = env.VAPID_SUBJECT;
  let sent = 0;
  for (const id of await readIndex(env)) {
    const record = await env.SUBS.get(`sub:${id}`, 'json');
    if (!record) continue;
    const due = dueHabits(record, now);
    if (!due.length) continue;
    const { today } = localClock(record.timeZone, now);
    let gone = false;
    for (const habit of due) {
      const status = await sendPush(
        record.subscription,
        { title: `${habit.emoji} Time for: ${habit.name}`, body: 'Keep your streak going!', tag: habit.id },
        { jwk, subject },
      ).catch((err) => {
        console.error('push failed', id, err);
        return 0;
      });
      if (status === 404 || status === 410) {
        await forget(env, id);
        gone = true;
        break;
      }
      if (status >= 200 && status < 300) sent++;
      else console.error('push rejected', id, status);
      // Marked even on failure so a broken subscription isn't retried every minute.
      record.notified[habit.id] = today;
    }
    if (!gone) await env.SUBS.put(`sub:${id}`, JSON.stringify(record));
  }
  return sent;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET' && pathname === '/vapid-public-key') {
      if (!env.VAPID_JWK) return json({ error: 'server not set up yet' }, 503);
      return json({ key: vapidPublicKey(JSON.parse(env.VAPID_JWK)) });
    }
    if (request.method === 'POST' && pathname === '/subscribe') return subscribe(request, env);
    if (request.method === 'POST' && pathname === '/unsubscribe') return unsubscribe(request, env);
    if (request.method === 'GET' && pathname === '/') return json({ ok: true, service: 'habit-checker-push' });
    return json({ error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    if (!env.VAPID_JWK) return;
    ctx.waitUntil(runReminders(env, new Date(event.scheduledTime)));
  },
};
