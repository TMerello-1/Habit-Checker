import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { formatCode } from '../../src/codes.js';
import worker, { nameNumber } from '../src/worker.js';
import { fakeD1 } from './fake-d1.js';

let env;
beforeEach(() => {
  env = { DB: fakeD1() };
});

async function call(method, path, { body, code } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers.Authorization = `Bearer ${code}`;
  const res = await worker.fetch(
    new Request(`https://friends.test${path}`, { method, headers, body: body && JSON.stringify(body) }),
    env,
  );
  return { status: res.status, body: await res.json() };
}

const join = async (adj = 0, animal = 0) => (await call('POST', '/profiles', { body: { adj, animal } })).body;

test('a new profile gets its name and a recovery code that signs it in', async () => {
  const { code, me } = await join(3, 5);
  assert.deepEqual(me.name, { adj: 3, animal: 5, num: 0 });
  assert.equal(code.length, 20);
  const res = await call('GET', '/me', { code });
  assert.equal(res.status, 200);
  assert.equal(res.body.me.id, me.id);
  assert.deepEqual(res.body.friends, []);
  assert.ok(!JSON.stringify(res.body).includes('token'));
});

test('the code works typed with dashes, lowercase and look-alike letters', async () => {
  const { code, me } = await join();
  const typed = formatCode(code).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
  assert.equal((await call('GET', '/me', { code: typed })).body.me.id, me.id);
});

test('a taken name gets a number, so names stay unique', async () => {
  const first = await join(1, 1);
  const second = await join(1, 1);
  const third = await join(1, 1);
  assert.equal(first.me.name.num, 0);
  assert.ok(second.me.name.num >= 2 && second.me.name.num <= 99);
  assert.notEqual(third.me.name.num, second.me.name.num);
});

test('nameNumber tries no number, then 2-99, then up to 9999', () => {
  assert.equal(nameNumber(0), 0);
  assert.equal(nameNumber(1, () => 0), 2);
  assert.equal(nameNumber(20, () => 0.9999), 99);
  assert.equal(nameNumber(21, () => 0), 100);
  assert.equal(nameNumber(59, () => 0.9999), 9999);
});

test('rejects names outside the lists and unknown or missing codes', async () => {
  assert.equal((await call('POST', '/profiles', { body: { adj: 9999, animal: 0 } })).status, 400);
  assert.equal((await call('POST', '/profiles', { body: { adj: 1.5, animal: 0 } })).status, 400);
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/me', { code: 'A'.repeat(20) })).status, 401);
});

test('an invite links both profiles once accepted, and friends see level and streak', async () => {
  const tom = await join(0, 0);
  const ana = await join(2, 9);
  await call('PUT', '/me/stats', { code: tom.code, body: { level: 3, streak: 12 } });

  const invite = await call('POST', '/invites', { code: tom.code });
  assert.equal(invite.status, 201);
  assert.equal(invite.body.code.length, 8);
  // Asking again hands out the same open invite.
  assert.equal((await call('POST', '/invites', { code: tom.code })).body.code, invite.body.code);

  const preview = await call('GET', `/invites/${formatCode(invite.body.code)}`, { code: ana.code });
  assert.equal(preview.body.profile.id, tom.me.id);
  assert.equal(preview.body.alreadyFriends, false);
  // Looking at an invite links nothing yet.
  assert.deepEqual((await call('GET', '/me', { code: ana.code })).body.friends, []);

  const accepted = await call('POST', `/invites/${invite.body.code}/accept`, { code: ana.code });
  assert.equal(accepted.body.friend.id, tom.me.id);

  const anaView = (await call('GET', '/me', { code: ana.code })).body.friends;
  assert.equal(anaView.length, 1);
  assert.equal(anaView[0].level, 3);
  assert.equal(anaView[0].streak, 12);
  assert.deepEqual(Object.keys(anaView[0]).sort(), ['id', 'level', 'name', 'streak', 'updatedAt']);
  assert.equal((await call('GET', '/me', { code: tom.code })).body.friends[0].id, ana.me.id);

  // Single use: the code is gone, and the next invite is a new one.
  assert.equal((await call('POST', `/invites/${invite.body.code}/accept`, { code: ana.code })).status, 404);
  assert.notEqual((await call('POST', '/invites', { code: tom.code })).body.code, invite.body.code);
});

test("you can't accept your own invite", async () => {
  const tom = await join();
  const { code } = (await call('POST', '/invites', { code: tom.code })).body;
  assert.equal((await call('POST', `/invites/${code}/accept`, { code: tom.code })).status, 409);
});

test('expired invites no longer work', async () => {
  const tom = await join();
  const ana = await join(1, 1);
  const { code } = (await call('POST', '/invites', { code: tom.code })).body;
  env.DB.raw.prepare('UPDATE invites SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
  assert.equal((await call('GET', `/invites/${code}`, { code: ana.code })).status, 404);
  assert.equal((await call('POST', `/invites/${code}/accept`, { code: ana.code })).status, 404);
});

test('removing a friend unlinks both sides', async () => {
  const tom = await join();
  const ana = await join(1, 1);
  const { code } = (await call('POST', '/invites', { code: tom.code })).body;
  await call('POST', `/invites/${code}/accept`, { code: ana.code });
  await call('DELETE', `/friends/${tom.me.id}`, { code: ana.code });
  assert.deepEqual((await call('GET', '/me', { code: tom.code })).body.friends, []);
  assert.deepEqual((await call('GET', '/me', { code: ana.code })).body.friends, []);
});

test('deleting a profile removes it from friends and frees its name', async () => {
  const tom = await join(4, 4);
  const ana = await join(1, 1);
  const { code } = (await call('POST', '/invites', { code: tom.code })).body;
  await call('POST', `/invites/${code}/accept`, { code: ana.code });
  await call('DELETE', '/me', { code: tom.code });
  assert.equal((await call('GET', '/me', { code: tom.code })).status, 401);
  assert.deepEqual((await call('GET', '/me', { code: ana.code })).body.friends, []);
  assert.equal((await join(4, 4)).me.name.num, 0);
});

test('stats must be sensible whole numbers', async () => {
  const { code } = await join();
  assert.equal((await call('PUT', '/me/stats', { code, body: { level: -1, streak: 2 } })).status, 400);
  assert.equal((await call('PUT', '/me/stats', { code, body: { level: 2, streak: 'x' } })).status, 400);
});

test('answers CORS preflights for the app', async () => {
  const res = await worker.fetch(new Request('https://friends.test/me', { method: 'OPTIONS' }), env);
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});

test('anyone can send feedback; only profiles named in ADMINS can read and clear it', async () => {
  const tom = await join(4, 7);
  const ana = await join(2, 9);
  env.ADMINS = ' 9.9.9 , 4.7.0';
  assert.equal((await call('GET', '/me', { code: tom.code })).body.admin, true);
  assert.equal((await call('GET', '/me', { code: ana.code })).body.admin, false);

  const sent = await call('POST', '/feedback', { body: { text: '  More badges please ', lang: 'de', platform: 'android' } });
  assert.equal(sent.status, 201);
  assert.equal((await call('POST', '/feedback', { body: { text: 'Hi', platform: 'ios', lang: 'Klingon' } })).status, 201);

  assert.equal((await call('GET', '/feedback', { code: ana.code })).status, 403);
  assert.equal((await call('GET', '/feedback')).status, 401);
  const inbox = await call('GET', '/feedback', { code: tom.code });
  assert.equal(inbox.status, 200);
  assert.deepEqual(
    inbox.body.feedback.map(({ text, lang, platform }) => ({ text, lang, platform })).sort((a, b) => a.text.localeCompare(b.text)),
    [
      { text: 'Hi', lang: 'en', platform: 'web' },
      { text: 'More badges please', lang: 'de', platform: 'android' },
    ],
  );
  assert.ok(!JSON.stringify(inbox.body).includes('ip'));

  const id = inbox.body.feedback[0].id;
  assert.equal((await call('DELETE', `/feedback/${id}`, { code: ana.code })).status, 403);
  assert.equal((await call('DELETE', `/feedback/${id}`, { code: tom.code })).status, 200);
  assert.equal((await call('GET', '/feedback', { code: tom.code })).body.feedback.length, 1);
});

test('feedback must be 1 to 2000 characters, and one sender can send 5 an hour', async () => {
  assert.equal((await call('POST', '/feedback', { body: { text: '   ' } })).status, 400);
  assert.equal((await call('POST', '/feedback', { body: { text: 'x'.repeat(2001) } })).status, 400);
  assert.equal((await call('POST', '/feedback', { body: {} })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/feedback', { body: { text: `note ${i}` } })).status, 201);
  assert.equal((await call('POST', '/feedback', { body: { text: 'one more' } })).status, 429);
});

test('new feedback is pushed to registered admin devices, in each admin\'s language', async () => {
  const tom = await join(4, 7);
  const ana = await join(2, 9);
  env.ADMINS = '4.7.0';
  const pushed = [];
  env.PUSH = {
    fetch: async (url, init) => {
      pushed.push({ url, ...JSON.parse(init.body) });
      return Response.json({ sent: 1, unknown: ['https://fcm.googleapis.com/fcm/send/old'] });
    },
  };
  const device = (code, endpoint, title) => call('PUT', '/admin/device', { code, body: { endpoint, title } });
  assert.equal((await device(ana.code, 'https://fcm.googleapis.com/fcm/send/ana', 'x')).status, 403);
  assert.equal((await device(tom.code, 'https://fcm.googleapis.com/fcm/send/tom', '💬 Neues Feedback')).status, 200);
  assert.equal((await device(tom.code, 'https://fcm.googleapis.com/fcm/send/old', '💬 Neues Feedback')).status, 200);
  assert.equal((await device(tom.code, 'not a url', 'x')).status, 400);

  await call('POST', '/feedback', { body: { text: 'y'.repeat(300) } });
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].url, 'https://internal/notify');
  assert.deepEqual(pushed[0].endpoints.sort(), ['https://fcm.googleapis.com/fcm/send/old', 'https://fcm.googleapis.com/fcm/send/tom']);
  assert.equal(pushed[0].message.title, '💬 Neues Feedback');
  assert.equal(pushed[0].message.body.length, 140);
  assert.equal(pushed[0].message.url, '#inbox');

  // The push server said "old" is gone, so it isn't asked for again.
  await call('POST', '/feedback', { body: { text: 'again' } });
  assert.deepEqual(pushed[1].endpoints, ['https://fcm.googleapis.com/fcm/send/tom']);

  // Taken off ADMINS: no more pushes, even with the device still listed.
  env.ADMINS = '';
  await call('POST', '/feedback', { body: { text: 'third' } });
  assert.equal(pushed.length, 2);
});

test('feedback is still saved when the push server fails', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  env.PUSH = { fetch: async () => new Response('down', { status: 500 }) };
  await call('PUT', '/admin/device', { code: tom.code, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/tom' } });
  assert.equal((await call('POST', '/feedback', { body: { text: 'hello' } })).status, 201);
  assert.equal((await call('GET', '/feedback', { code: tom.code })).body.feedback.length, 1);
});

test('serves Android App Links for the signing certificate, or nothing without one', async () => {
  env.ANDROID_CERT_SHA256 = 'AA:BB';
  let res = await worker.fetch(new Request('https://friends.test/.well-known/assetlinks.json'), env);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  const [link] = await res.json();
  assert.equal(link.target.package_name, 'io.github.tmerello1.habitchecker');
  assert.deepEqual(link.target.sha256_cert_fingerprints, ['AA:BB']);
  env.ANDROID_CERT_SHA256 = '';
  res = await worker.fetch(new Request('https://friends.test/.well-known/assetlinks.json'), env);
  assert.deepEqual(await res.json(), []);
});

test('invite links send browsers on to the web app with the code', async () => {
  env.APP_URL = 'https://app.test/';
  let res = await worker.fetch(new Request('https://friends.test/invite/abcd-1234'), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://app.test/#invite=ABCD1234');
  res = await worker.fetch(new Request('https://friends.test/invite/nope'), env);
  assert.equal(res.headers.get('Location'), 'https://app.test/');
});
