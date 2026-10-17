import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { dueHabits, localClock } from '../src/schedule.js';
import { generateVapidJwk } from '../src/webpush.js';
import worker, { reminderMessage, runReminders } from '../src/worker.js';

const habit = { id: 'a', name: 'Read', emoji: '📚', days: [1], time: '08:00', createdAt: '2026-10-01' };
// Monday 2026-10-12, 08:03 in New York (EDT, UTC-4).
const mondayNY = new Date('2026-10-12T12:03:00Z');
const record = (extra = {}) => ({ timeZone: 'America/New_York', habits: [habit], done: {}, notified: {}, ...extra });

test('localClock reads the date and time in the user timezone', () => {
  const { today, minutes, day } = localClock('America/New_York', mondayNY);
  assert.equal(today, '2026-10-12');
  assert.equal(minutes, 8 * 60 + 3);
  assert.equal(day.getDay(), 1);
  // Same instant is already Tuesday in Kiribati (UTC+14).
  assert.equal(localClock('Pacific/Kiritimati', mondayNY).today, '2026-10-13');
});

test('a reminder is due shortly after its time, in the user timezone', () => {
  assert.deepEqual(dueHabits(record(), mondayNY).map((h) => h.id), ['a']);
  assert.equal(dueHabits(record({ timeZone: 'Europe/London' }), mondayNY).length, 0);
});

test('no reminder before its time, long after, when done, already sent, or unscheduled', () => {
  assert.equal(dueHabits(record(), new Date('2026-10-12T11:59:00Z')).length, 0);
  assert.equal(dueHabits(record(), new Date('2026-10-12T12:30:00Z')).length, 0);
  assert.equal(dueHabits(record({ done: { a: '2026-10-12' } }), mondayNY).length, 0);
  assert.equal(dueHabits(record({ notified: { a: '2026-10-12' } }), mondayNY).length, 0);
  assert.equal(dueHabits(record(), new Date('2026-10-13T12:03:00Z')).length, 0);
  // Yesterday's check-in doesn't count for today.
  assert.equal(dueHabits(record({ done: { a: '2026-10-11' } }), mondayNY).length, 1);
});

// In-memory stand-in for a KV namespace.
function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k);
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) {
      m.set(k, v);
    },
    async delete(k) {
      m.delete(k);
    },
  };
}

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
  keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
};

async function setup() {
  const env = { SUBS: fakeKV(), VAPID_JWK: JSON.stringify(await generateVapidJwk()), VAPID_SUBJECT: 'https://example.com/' };
  const post = (path, body) =>
    worker.fetch(new Request(`https://push.test${path}`, { method: 'POST', body: JSON.stringify(body) }), env);
  return { env, post };
}

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

function mockPushService(status) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status });
  };
  return calls;
}

test('subscribe stores the schedule, the cron sends once, then stays quiet', async () => {
  const { env, post } = await setup();
  const res = await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: {} });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(env.SUBS.m.get('index')).length, 1);

  const calls = mockPushService(201);
  assert.equal(await runReminders(env, mondayNY), 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, subscription.endpoint);
  assert.equal(calls[0].init.headers['Content-Encoding'], 'aes128gcm');
  assert.match(calls[0].init.headers.Authorization, /^vapid t=.+, k=.+$/);

  // Next minute: already sent today.
  assert.equal(await runReminders(env, new Date('2026-10-12T12:04:00Z')), 0);
  assert.equal(calls.length, 1);

  // A later sync from the app must not wipe out what was already sent.
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: {} });
  assert.equal(await runReminders(env, new Date('2026-10-12T12:05:00Z')), 0);
});

test('changing a reminder time lets it fire again the same day', async () => {
  const { env, post } = await setup();
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: {} });
  const calls = mockPushService(201);
  await runReminders(env, mondayNY);
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [{ ...habit, time: '09:00' }], done: {} });
  await runReminders(env, new Date('2026-10-12T13:01:00Z'));
  assert.equal(calls.length, 2);
});

test('reminder text uses the language the app sent', () => {
  const de = { title: '{emoji} Zeit für: {name}', body: 'Bleib an deiner Serie dran!' };
  assert.deepEqual(reminderMessage(de, habit), { title: '📚 Zeit für: Read', body: 'Bleib an deiner Serie dran!', tag: 'a' });
  assert.equal(reminderMessage(undefined, habit).title, '📚 Time for: Read');
});

test('a checked-off habit gets no push', async () => {
  const { env, post } = await setup();
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: { a: '2026-10-12' } });
  const calls = mockPushService(201);
  await runReminders(env, mondayNY);
  assert.equal(calls.length, 0);
});

test('an expired subscription is forgotten', async () => {
  const { env, post } = await setup();
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: {} });
  mockPushService(410);
  await runReminders(env, mondayNY);
  assert.deepEqual(JSON.parse(env.SUBS.m.get('index')), []);
  assert.equal([...env.SUBS.m.keys()].filter((k) => k.startsWith('sub:')).length, 0);
});

test('unsubscribe removes the record', async () => {
  const { env, post } = await setup();
  await post('/subscribe', { subscription, timeZone: 'America/New_York', habits: [habit], done: {} });
  await post('/unsubscribe', { endpoint: subscription.endpoint });
  assert.deepEqual(JSON.parse(env.SUBS.m.get('index')), []);
});

test('rejects endpoints that are not browser push services, and bad timezones', async () => {
  const { post } = await setup();
  const evil = { ...subscription, endpoint: 'https://example.com/hook' };
  assert.equal((await post('/subscribe', { subscription: evil, timeZone: 'UTC', habits: [] })).status, 400);
  assert.equal((await post('/subscribe', { subscription, timeZone: 'Mars/Base', habits: [] })).status, 400);
});

test('serves the VAPID public key', async () => {
  const { env } = await setup();
  const res = await worker.fetch(new Request('https://push.test/vapid-public-key'), env);
  const { key } = await res.json();
  assert.equal(key.length, 87); // 65 bytes, base64url
});
