import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { formatCode } from '../../src/codes.js';
import worker, { nameNumber } from '../src/worker.js';
import { fakeD1 } from './fake-d1.js';

let env;
beforeEach(() => {
  env = { DB: fakeD1() };
});

async function call(method, path, { body, code, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (code) headers.Authorization = `Bearer ${code}`;
  if (token) headers['X-Feedback-Token'] = token;
  const res = await worker.fetch(
    new Request(`https://friends.test${path}`, { method, headers, body: body && JSON.stringify(body) }),
    env,
  );
  return { status: res.status, body: await res.json() };
}

// Ends the quiet time after an admin push, as if 5 minutes had passed.
const quietOver = () => env.DB.raw.exec('DELETE FROM admin_push');

// The profile that sends feedback in tests that don't care who sends it.
let senderCode;
beforeEach(() => {
  senderCode = null;
});
const sender = async () => (senderCode ??= (await join(7, 7)).code);

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

test('feedback names the signed-in sender, and is marked as having none otherwise', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  const ana = await join(2, 9);
  await call('POST', '/feedback', { code: ana.code, body: { text: 'from Ana' } });
  await call('POST', '/feedback', { body: { text: 'no profile' } });
  await call('POST', '/feedback', { code: 'ABCDEFGHJKMNPQRSTVWX', body: { text: 'unknown code' } });
  const list = (await call('GET', '/feedback', { code: tom.code })).body.feedback;
  const by = Object.fromEntries(list.map((f) => [f.text, f.sender]));
  assert.deepEqual(by['from Ana'], { id: ana.me.id, name: { adj: 2, animal: 9, num: 0 } });
  assert.equal(by['no profile'], null);
  assert.equal(by['unknown code'], null);
  // The name stays after the profile is deleted.
  await call('DELETE', '/me', { code: ana.code });
  const after = (await call('GET', '/feedback', { code: tom.code })).body.feedback.find((f) => f.text === 'from Ana');
  assert.deepEqual(after.sender.name, { adj: 2, animal: 9, num: 0 });
});

test('anyone can send feedback; only profiles named in ADMINS can read and clear it', async () => {
  const tom = await join(4, 7);
  const ana = await join(2, 9);
  env.ADMINS = ' 9.9.9 , 4.7.0';
  assert.equal((await call('GET', '/me', { code: tom.code })).body.admin, true);
  assert.equal((await call('GET', '/me', { code: ana.code })).body.admin, false);

  const sent = await call('POST', '/feedback', { code: await sender(), body: { text: '  More badges please ', lang: 'de', platform: 'android' } });
  assert.equal(sent.status, 201);
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: 'Hi', platform: 'ios', lang: 'Klingon' } })).status, 201);

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
  assert.deepEqual(inbox.body.feedback[0].sender.name, { adj: 7, animal: 7, num: 0 });

  const id = inbox.body.feedback[0].id;
  assert.equal((await call('DELETE', `/feedback/${id}`, { code: ana.code })).status, 403);
  assert.equal((await call('DELETE', `/feedback/${id}`, { code: tom.code })).status, 200);
  assert.equal((await call('GET', '/feedback', { code: tom.code })).body.feedback.length, 1);
});

test('feedback must be 1 to 2000 characters, and one sender can send 5 an hour', async () => {
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: '   ' } })).status, 400);
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: 'x'.repeat(2001) } })).status, 400);
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: {} })).status, 400);
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: `note ${i}` } })).status, 201);
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: 'one more' } })).status, 429);
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

  await call('POST', '/feedback', { code: await sender(), body: { text: 'y'.repeat(300) } });
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].url, 'https://internal/notify');
  assert.deepEqual(pushed[0].endpoints.sort(), ['https://fcm.googleapis.com/fcm/send/old', 'https://fcm.googleapis.com/fcm/send/tom']);
  assert.equal(pushed[0].message.title, '💬 Neues Feedback');
  assert.equal(pushed[0].message.body.length, 140);
  assert.equal(pushed[0].message.url, '#inbox');

  // The push server said "old" is gone, so it isn't asked for again.
  quietOver();
  await call('POST', '/feedback', { code: await sender(), body: { text: 'again' } });
  assert.deepEqual(pushed[1].endpoints, ['https://fcm.googleapis.com/fcm/send/tom']);

  // Taken off ADMINS: no more pushes, even with the device still listed.
  env.ADMINS = '';
  quietOver();
  await call('POST', '/feedback', { code: await sender(), body: { text: 'third' } });
  assert.equal(pushed.length, 2);
});

test('feedback is still saved when the push server fails', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  env.PUSH = { fetch: async () => new Response('down', { status: 500 }) };
  await call('PUT', '/admin/device', { code: tom.code, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/tom' } });
  assert.equal((await call('POST', '/feedback', { code: await sender(), body: { text: 'hello' } })).status, 201);
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

// A fake push server binding that records what it was asked to send.
function fakePush() {
  const pushed = [];
  env.PUSH = {
    fetch: async (url, init) => {
      pushed.push(JSON.parse(init.body));
      return Response.json({ sent: 1, unknown: [] });
    },
  };
  return pushed;
}

test('an admin can reply and react; the anonymous sender reads it with their token and answers back', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  await call('PUT', '/admin/device', { code: tom.code, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/tom', title: '💬 New feedback' } });
  const pushed = fakePush();

  const sent = await call('POST', '/feedback', {
    body: {
      text: 'Dark mode please',
      endpoint: 'https://fcm.googleapis.com/fcm/send/sender',
      titles: { reply: '💬 Reply to your feedback', reaction: '{emoji} on your feedback' },
    },
  });
  assert.equal(sent.status, 201);
  const { id, token } = sent.body;
  assert.equal(token.length, 20);
  pushed.length = 0;

  assert.equal((await call('POST', `/feedback/${id}/messages`, { code: tom.code, body: { text: 'On it!' } })).status, 201);
  assert.equal((await call('PUT', `/feedback/${id}/reaction`, { code: tom.code, body: { emoji: '👍' } })).status, 200);
  assert.deepEqual(pushed.map((p) => [p.endpoints[0], p.message.title, p.message.body, p.message.url]), [
    ['https://fcm.googleapis.com/fcm/send/sender', '💬 Reply to your feedback', 'On it!', '#feedback'],
    ['https://fcm.googleapis.com/fcm/send/sender', '👍 on your feedback', 'Dark mode please', '#feedback'],
  ]);

  const thread = await call('GET', `/threads/${id}`, { token });
  assert.equal(thread.body.reaction, '👍');
  assert.deepEqual(thread.body.messages.map((m) => [m.fromAdmin, m.text]), [[true, 'On it!']]);

  pushed.length = 0;
  quietOver();
  assert.equal((await call('POST', `/threads/${id}/messages`, { token, body: { text: 'Thanks!' } })).status, 201);
  assert.equal(pushed[0].endpoints[0], 'https://fcm.googleapis.com/fcm/send/tom');
  assert.equal(pushed[0].message.body, 'Thanks!');

  const [item] = (await call('GET', '/feedback', { code: tom.code })).body.feedback;
  assert.equal(item.replyable, true);
  assert.equal(item.reaction, '👍');
  assert.deepEqual(item.messages.map((m) => [m.fromAdmin, m.text]), [[true, 'On it!'], [false, 'Thanks!']]);
  assert.ok(!JSON.stringify(item).includes('token'));
});

test('a thread only opens with its own token, and nobody but admins can reply as admin', async () => {
  const tom = await join(4, 7);
  const ana = await join(2, 9);
  env.ADMINS = '4.7.0';
  const a = (await call('POST', '/feedback', { code: await sender(), body: { text: 'one' } })).body;
  const b = (await call('POST', '/feedback', { code: await sender(), body: { text: 'two' } })).body;
  assert.equal((await call('GET', `/threads/${a.id}`, { token: b.token })).status, 404);
  assert.equal((await call('GET', `/threads/${a.id}`)).status, 404);
  assert.equal((await call('POST', `/threads/${a.id}/messages`, { token: b.token, body: { text: 'x' } })).status, 404);
  assert.equal((await call('POST', `/feedback/${a.id}/messages`, { code: ana.code, body: { text: 'x' } })).status, 403);
  assert.equal((await call('PUT', `/feedback/${a.id}/reaction`, { code: ana.code, body: { emoji: '👍' } })).status, 403);
  assert.equal((await call('POST', `/feedback/${a.id}/messages`, { code: tom.code, body: { text: '' } })).status, 400);
});

test('deleting feedback ends its thread, and a sender can answer 10 times an hour', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  const { id, token } = (await call('POST', '/feedback', { code: await sender(), body: { text: 'hi' } })).body;
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', `/threads/${id}/messages`, { token, body: { text: `m${i}` } })).status, 201);
  assert.equal((await call('POST', `/threads/${id}/messages`, { token, body: { text: 'one more' } })).status, 429);
  await call('DELETE', `/feedback/${id}`, { code: tom.code });
  assert.equal((await call('GET', `/threads/${id}`, { token })).status, 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM feedback_messages').get().n, 0);
});

test('a sender without push gets no notification; turning push on later registers it', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  const pushed = fakePush();
  const { id, token } = (await call('POST', '/feedback', { code: await sender(), body: { text: 'hi' } })).body;
  await call('POST', `/feedback/${id}/messages`, { code: tom.code, body: { text: 'hello' } });
  assert.equal(pushed.length, 0);
  await call('PUT', `/threads/${id}/device`, { token, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/s', titles: { reply: 'R', reaction: '{emoji}' } } });
  await call('POST', `/feedback/${id}/messages`, { code: tom.code, body: { text: 'again' } });
  assert.equal(pushed[0].message.title, 'R');
});

test('a burst of feedback pushes admins once, then once more with a count after 5 minutes', async () => {
  const tom = await join(4, 7);
  env.ADMINS = '4.7.0';
  await call('PUT', '/admin/device', { code: tom.code, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/tom' } });
  const pushed = fakePush();
  for (const text of ['a', 'b', 'c']) await call('POST', '/feedback', { code: await sender(), body: { text } });
  assert.deepEqual(pushed.map((p) => p.message.body), ['a']);

  // 5 minutes on: b, c and d are new since the last push.
  env.DB.raw.exec("UPDATE admin_push SET last_at = '2000-01-01T00:00:00.000Z'");
  env.DB.raw.exec("UPDATE feedback SET created_at = '1999-01-01T00:00:00.000Z' WHERE text = 'a'");
  await call('POST', '/feedback', { code: await sender(), body: { text: 'd' } });
  assert.deepEqual(pushed.map((p) => p.message.body), ['a', 'd (+2)']);
});

test('a profile keeps one backup, which only its own code reads, and deleting the profile drops it', async () => {
  const a = await join(1, 1);
  const b = await join(2, 2);
  assert.equal((await call('GET', '/me/backup', { code: a.code })).status, 404);
  assert.equal((await call('PUT', '/me/backup', { code: a.code, body: { data: 'AAAA' } })).status, 200);
  assert.equal((await call('PUT', '/me/backup', { code: a.code, body: { data: 'BBBB==' } })).status, 200);
  const got = await call('GET', '/me/backup', { code: a.code });
  assert.equal(got.body.data, 'BBBB==');
  assert.ok(got.body.updatedAt);
  assert.equal((await call('GET', '/me/backup', { code: b.code })).status, 404);
  assert.equal((await call('GET', '/me/backup')).status, 401);
  await call('DELETE', '/me', { code: a.code });
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM backups').get().n, 0);
});

test('a backup must be base64 text of a sensible size', async () => {
  const { code } = await join();
  for (const data of [undefined, '', 42, 'not base64!', 'A'.repeat(2_000_001)]) {
    assert.equal((await call('PUT', '/me/backup', { code, body: { data } })).status, 400);
  }
});

test('a backup write based on an older copy is refused, so devices merge first', async () => {
  const { code } = await join();
  const first = await call('PUT', '/me/backup', { code, body: { data: 'AAAA', base: null } });
  assert.equal(first.status, 200);
  assert.equal((await call('PUT', '/me/backup', { code, body: { data: 'BBBB', base: null } })).status, 409);
  await new Promise((r) => setTimeout(r, 2));
  const second = await call('PUT', '/me/backup', { code, body: { data: 'CCCC', base: first.body.updatedAt } });
  assert.equal(second.status, 200);
  assert.equal((await call('PUT', '/me/backup', { code, body: { data: 'DDDD', base: first.body.updatedAt } })).status, 409);
  assert.equal((await call('GET', '/me/backup', { code })).body.data, 'CCCC');
  assert.equal((await call('PUT', '/me/backup', { code, body: { data: 'EEEE', base: 5 } })).status, 400);
});
