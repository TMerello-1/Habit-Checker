// Habit Checker friends server (Cloudflare Worker with a D1 database, see ../schema.sql).
//
// Profiles are anonymous: a generated name and a secret recovery code, nothing else. Each
// device signs in by sending that code as a bearer token; the server keeps only its hash.
// Friends are linked with a single-use invite code, and both directions are stored. Friends
// see each other's name, level and best current streak. Habits reach the server only as a
// backup the app encrypts with a key derived from the recovery code, which this server can't read.
//
// Routes (all JSON; everything except POST /profiles needs "Authorization: Bearer <code>"):
//   POST   /profiles               { adj, animal }  → { code, me }   new profile
//   GET    /me                                      → { me, friends }
//   PUT    /me/stats               { level, streak }
//   DELETE /me                                         deletes the profile and its links
//   PUT    /me/backup              { data }         → { updatedAt }  the encrypted habit backup
//   GET    /me/backup                               → { data, updatedAt }   404 when there is none
//   POST   /invites                                 → { code, expiresAt }
//   GET    /invites/<code>                          → { profile }  who sent it, before accepting
//   POST   /invites/<code>/accept                   → { friend }
//   DELETE /friends/<id>
//   POST   /feedback               { text, lang, platform, endpoint?, titles? }
//                                                  → { id, token }   no sign-in needed, anonymous
//   GET    /feedback                                → { feedback }   admins only
//   DELETE /feedback/<id>                                             admins only
//   POST   /feedback/<id>/messages { text }                           admins only: reply
//   PUT    /feedback/<id>/reaction { emoji }                          admins only ('' clears)
//
// The sender's side of a feedback thread uses the token from POST /feedback instead of a
// profile, sent as "X-Feedback-Token: <token>":
//   GET    /threads/<id>                            → { reaction, messages }
//   POST   /threads/<id>/messages  { text }                           answer back
//   PUT    /threads/<id>/device    { endpoint, titles }               where to push replies
//   PUT    /admin/device           { endpoint, title }                admins only
//   DELETE /admin/device           { endpoint }                       admins only
//
// Admins are the profiles named in the ADMINS variable (see wrangler.toml); GET /me tells
// the app whether the signed-in profile is one, so it can show the feedback inbox.
// An admin device registered with PUT /admin/device gets a push for each new feedback,
// sent through the push server (server/) over the PUSH service binding.

import { INVITE_LENGTH, isCode, normalizeCode, randomCode, RECOVERY_LENGTH } from '../../src/codes.js';
import { ADJECTIVES, ANIMALS } from '../../src/names.js';

const INVITE_DAYS = 7;
const MAX_FRIENDS = 200;
const MAX_FEEDBACK_LENGTH = 2000;
const FEEDBACK_PER_HOUR = 5;
const ANSWERS_PER_HOUR = 10; // a sender's messages in one thread
const ADMIN_PUSH_GAP_MS = 5 * 60_000;
const MAX_BACKUP_LENGTH = 2_000_000; // base64 characters, years of history for dozens of habits

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Feedback-Token',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const fail = (status, error) => json({ error }, status);

async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isIndex = (v, list) => Number.isInteger(v) && v >= 0 && v < list.length;
const isCount = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

// What one profile shows another. Never includes the token hash.
const publicProfile = (row) => ({
  id: row.id,
  name: { adj: row.adj, animal: row.animal, num: row.num },
  level: row.level,
  streak: row.streak,
  updatedAt: row.updated_at,
});

// The number for a name whose adjective and animal are taken: 2–99 first, so most names
// stay short, then up to 9999.
export function nameNumber(attempt, random = Math.random) {
  if (attempt === 0) return 0;
  const [lo, hi] = attempt <= 20 ? [2, 99] : [100, 9999];
  return lo + Math.floor(random() * (hi - lo + 1));
}

async function createProfile(request, env) {
  const body = await request.json().catch(() => null);
  if (!isIndex(body?.adj, ADJECTIVES) || !isIndex(body?.animal, ANIMALS)) return fail(400, 'invalid name');
  const code = randomCode(RECOVERY_LENGTH);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const tokenHash = await sha256(code);
  for (let attempt = 0; attempt < 60; attempt++) {
    const num = nameNumber(attempt);
    const { meta } = await env.DB.prepare(
      `INSERT INTO profiles (id, token_hash, adj, animal, num, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
      .bind(id, tokenHash, body.adj, body.animal, num, now, now)
      .run();
    if (meta.changes) {
      const me = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first();
      return json({ code, me: publicProfile(me) }, 201);
    }
  }
  return fail(409, 'name taken');
}

async function signedIn(request, env) {
  const token = normalizeCode((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!isCode(token, RECOVERY_LENGTH)) return null;
  return env.DB.prepare('SELECT * FROM profiles WHERE token_hash = ?').bind(await sha256(token)).first();
}

const nameKey = (row) => `${row.adj}.${row.animal}.${row.num}`;
const isAdmin = (env, me) => (env.ADMINS || '').split(',').map((s) => s.trim()).includes(nameKey(me));

async function friendsOf(env, id) {
  const { results } = await env.DB.prepare(
    `SELECT p.* FROM friends f JOIN profiles p ON p.id = f.friend_id
     WHERE f.profile_id = ? ORDER BY f.created_at`,
  )
    .bind(id)
    .all();
  return results.map(publicProfile);
}

async function updateStats(request, env, me) {
  const body = await request.json().catch(() => null);
  if (!isCount(body?.level, 1_000_000) || !isCount(body?.streak, 100_000)) return fail(400, 'invalid stats');
  await env.DB.prepare('UPDATE profiles SET level = ?, streak = ?, updated_at = ? WHERE id = ?')
    .bind(body.level, body.streak, new Date().toISOString(), me.id)
    .run();
  return json({ ok: true });
}

async function deleteProfile(env, me) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friends WHERE profile_id = ? OR friend_id = ?').bind(me.id, me.id),
    env.DB.prepare('DELETE FROM invites WHERE profile_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM admin_devices WHERE profile_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM backups WHERE profile_id = ?').bind(me.id),
    env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(me.id),
  ]);
  return json({ ok: true });
}

async function saveBackup(request, env, me) {
  const body = await request.json().catch(() => null);
  const data = body?.data;
  if (typeof data !== 'string' || !data || data.length > MAX_BACKUP_LENGTH || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
    return fail(400, 'invalid backup');
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO backups (profile_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(me.id, data, now)
    .run();
  return json({ updatedAt: now });
}

async function readBackup(env, me) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM backups WHERE profile_id = ?').bind(me.id).first();
  return row ? json({ data: row.data, updatedAt: row.updated_at }) : fail(404, 'no backup');
}

// Hands out the profile's open invite, or a fresh one once that is used or expired.
async function createInvite(env, me, now = new Date()) {
  await env.DB.prepare('DELETE FROM invites WHERE expires_at <= ?').bind(now.toISOString()).run();
  const open = await env.DB.prepare('SELECT * FROM invites WHERE profile_id = ?').bind(me.id).first();
  if (open) return json({ code: open.code, expiresAt: open.expires_at });
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString();
  const code = randomCode(INVITE_LENGTH);
  await env.DB.prepare('INSERT INTO invites (code, profile_id, expires_at) VALUES (?, ?, ?)').bind(code, me.id, expiresAt).run();
  return json({ code, expiresAt }, 201);
}

async function findInvite(env, rawCode) {
  const code = normalizeCode(decodeURIComponent(rawCode));
  if (!isCode(code, INVITE_LENGTH)) return null;
  return env.DB.prepare(
    `SELECT i.code, p.* FROM invites i JOIN profiles p ON p.id = i.profile_id
     WHERE i.code = ? AND i.expires_at > ?`,
  )
    .bind(code, new Date().toISOString())
    .first();
}

async function previewInvite(env, me, rawCode) {
  const from = await findInvite(env, rawCode);
  if (!from) return fail(404, 'invite not found');
  if (from.id === me.id) return fail(409, 'own invite');
  const already = await env.DB.prepare('SELECT 1 FROM friends WHERE profile_id = ? AND friend_id = ?').bind(me.id, from.id).first();
  return json({ profile: publicProfile(from), alreadyFriends: Boolean(already) });
}

async function acceptInvite(env, me, rawCode) {
  const from = await findInvite(env, rawCode);
  if (!from) return fail(404, 'invite not found');
  if (from.id === me.id) return fail(409, 'own invite');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM friends WHERE profile_id IN (?, ?) GROUP BY profile_id ORDER BY n DESC')
    .bind(me.id, from.id)
    .first();
  if (count && count.n >= MAX_FRIENDS) return fail(409, 'too many friends');
  const now = new Date().toISOString();
  const link = 'INSERT INTO friends (profile_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING';
  await env.DB.batch([
    env.DB.prepare(link).bind(me.id, from.id, now),
    env.DB.prepare(link).bind(from.id, me.id, now),
    env.DB.prepare('DELETE FROM invites WHERE code = ?').bind(from.code),
  ]);
  return json({ friend: publicProfile(from) });
}

async function removeFriend(env, me, id) {
  await env.DB.prepare('DELETE FROM friends WHERE (profile_id = ? AND friend_id = ?) OR (profile_id = ? AND friend_id = ?)')
    .bind(me.id, id, id, me.id)
    .run();
  return json({ ok: true });
}

async function sendFeedback(request, env, ctx) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_FEEDBACK_LENGTH) return fail(400, 'invalid feedback');
  const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : 'en';
  const platform = body.platform === 'android' ? 'android' : 'web';
  const ipHash = await sha256(`feedback:${request.headers.get('CF-Connecting-IP') || ''}`);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, hourAgo)
    .first();
  if (recent.n >= FEEDBACK_PER_HOUR) return fail(429, 'too much feedback');
  const id = crypto.randomUUID();
  const token = randomCode(RECOVERY_LENGTH);
  const device = senderDevice(body);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO feedback (id, text, lang, platform, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, text, lang, platform, ipHash, now.toISOString()),
    env.DB.prepare(
      `INSERT INTO feedback_threads (feedback_id, token_hash, endpoint, reply_title, reaction_title, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, await sha256(token), device.endpoint, device.replyTitle, device.reactionTitle, now.toISOString()),
  ]);
  inBackground(ctx, notifyAdmins(env, text));
  return json({ ok: true, id, token }, 201);
}

// Pushes run after the response when the runtime allows it (ctx.waitUntil), and a failed
// push never fails the request.
async function inBackground(ctx, promise) {
  const quiet = promise.catch((err) => console.error('push failed', err));
  if (ctx) ctx.waitUntil(quiet);
  else await quiet;
}

const MESSAGE_LENGTH = MAX_FEEDBACK_LENGTH;
const cleanText = (v) => (typeof v === 'string' ? v.trim() : '');
const isEndpoint = (v) => typeof v === 'string' && /^https:\/\/\S{1,500}$/.test(v);

// The sender's push endpoint and notification titles (in the sender's language; the
// reaction title has an {emoji} slot). Missing parts become '' and mean no push.
function senderDevice(body) {
  const title = (v) => cleanText(v).slice(0, 80);
  return {
    endpoint: isEndpoint(body?.endpoint) ? body.endpoint : '',
    replyTitle: title(body?.titles?.reply),
    reactionTitle: title(body?.titles?.reaction),
  };
}

// A thread the request's X-Feedback-Token opens, or null.
async function senderThread(request, env, id) {
  const token = normalizeCode(request.headers.get('X-Feedback-Token') || '');
  if (!isCode(token, RECOVERY_LENGTH)) return null;
  return env.DB.prepare('SELECT * FROM feedback_threads WHERE feedback_id = ? AND token_hash = ?')
    .bind(id, await sha256(token))
    .first();
}

async function threadMessages(env, id) {
  const { results } = await env.DB.prepare('SELECT * FROM feedback_messages WHERE feedback_id = ? ORDER BY created_at, rowid')
    .bind(id)
    .all();
  return results.map((r) => ({ id: r.id, fromAdmin: Boolean(r.from_admin), text: r.text, createdAt: r.created_at }));
}

async function addMessage(env, id, fromAdmin, text) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO feedback_messages (id, feedback_id, from_admin, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), id, fromAdmin ? 1 : 0, text, now),
    env.DB.prepare('UPDATE feedback_threads SET updated_at = ? WHERE feedback_id = ?').bind(now, id),
  ]);
}

const preview = (text) => (text.length > 140 ? `${text.slice(0, 139)}…` : text);

// Tells the sender about a reply or reaction, if their device gave a push endpoint.
async function notifySender(env, thread, title, body) {
  if (!env.PUSH || !thread.endpoint || !title) return;
  const res = await env.PUSH.fetch('https://internal/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoints: [thread.endpoint], message: { title, body, tag: `feedback-${thread.feedback_id}`, url: '#feedback' } }),
  });
  if (!res.ok) throw new Error(`push server answered ${res.status}`);
  const { unknown = [] } = await res.json();
  if (unknown.length) await env.DB.prepare("UPDATE feedback_threads SET endpoint = '' WHERE feedback_id = ?").bind(thread.feedback_id).run();
}

async function senderRoute(request, env, ctx, id, action) {
  const thread = await senderThread(request, env, id);
  if (!thread) return fail(404, 'thread not found');
  const { method } = request;
  if (method === 'GET' && !action) return json({ reaction: thread.reaction, messages: await threadMessages(env, id) });
  if (method === 'PUT' && action === 'device') {
    const device = senderDevice(await request.json().catch(() => null));
    await env.DB.prepare('UPDATE feedback_threads SET endpoint = ?, reply_title = ?, reaction_title = ? WHERE feedback_id = ?')
      .bind(device.endpoint, device.replyTitle, device.reactionTitle, id)
      .run();
    return json({ ok: true });
  }
  if (method === 'POST' && action === 'messages') {
    const text = cleanText((await request.json().catch(() => null))?.text);
    if (!text || text.length > MESSAGE_LENGTH) return fail(400, 'invalid message');
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback_messages WHERE feedback_id = ? AND from_admin = 0 AND created_at > ?')
      .bind(id, hourAgo)
      .first();
    if (recent.n >= ANSWERS_PER_HOUR) return fail(429, 'too many messages');
    await addMessage(env, id, false, text);
    inBackground(ctx, notifyAdmins(env, text));
    return json({ ok: true }, 201);
  }
  return fail(404, 'not found');
}

async function adminReply(request, env, ctx, id) {
  const text = cleanText((await request.json().catch(() => null))?.text);
  if (!text || text.length > MESSAGE_LENGTH) return fail(400, 'invalid message');
  const thread = await env.DB.prepare('SELECT * FROM feedback_threads WHERE feedback_id = ?').bind(id).first();
  if (!thread) return fail(404, 'no thread');
  await addMessage(env, id, true, text);
  inBackground(ctx, notifySender(env, thread, thread.reply_title, preview(text)));
  return json({ ok: true }, 201);
}

async function adminReact(request, env, ctx, id) {
  const emoji = cleanText((await request.json().catch(() => null))?.emoji);
  if (emoji.length > 16) return fail(400, 'invalid reaction');
  const thread = await env.DB.prepare('SELECT * FROM feedback_threads WHERE feedback_id = ?').bind(id).first();
  if (!thread) return fail(404, 'no thread');
  await env.DB.prepare('UPDATE feedback_threads SET reaction = ?, updated_at = ? WHERE feedback_id = ?')
    .bind(emoji, new Date().toISOString(), id)
    .run();
  if (emoji && emoji !== thread.reaction) {
    const feedback = await env.DB.prepare('SELECT text FROM feedback WHERE id = ?').bind(id).first();
    inBackground(ctx, notifySender(env, thread, thread.reaction_title.replace('{emoji}', emoji), preview(feedback?.text || '')));
  }
  return json({ ok: true });
}

// Each admin device gets "<its title>" with the start of the feedback as the body. Each
// language's devices go in one request; endpoints the push server no longer knows are dropped.
// At most one push per ADMIN_PUSH_GAP_MS: what arrives in between stays quiet, and the next
// push adds "(+N)" for everything since the last one.
export async function notifyAdmins(env, text, now = new Date()) {
  if (!env.PUSH) return;
  const last = await env.DB.prepare('SELECT last_at FROM admin_push WHERE id = 1').first();
  if (last && now.getTime() - Date.parse(last.last_at) < ADMIN_PUSH_GAP_MS) return;
  const since = last?.last_at || now.toISOString();
  const count = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM feedback WHERE created_at > ?1)
          + (SELECT COUNT(*) FROM feedback_messages WHERE from_admin = 0 AND created_at > ?1) AS n`,
  )
    .bind(since)
    .first();
  await env.DB.prepare('INSERT INTO admin_push (id, last_at) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET last_at = excluded.last_at')
    .bind(now.toISOString())
    .run();
  const { results } = await env.DB.prepare(
    'SELECT d.endpoint, d.title, p.adj, p.animal, p.num FROM admin_devices d JOIN profiles p ON p.id = d.profile_id',
  ).all();
  const byTitle = new Map();
  // A profile taken off ADMINS stops getting these, even with its device still listed.
  for (const r of results.filter((row) => isAdmin(env, row))) byTitle.set(r.title, [...(byTitle.get(r.title) || []), r.endpoint]);
  const more = count.n > 1 ? ` (+${count.n - 1})` : '';
  const body = preview(text) + more;
  for (const [title, endpoints] of byTitle) {
    const res = await env.PUSH.fetch('https://internal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoints, message: { title, body, tag: 'feedback', url: '#inbox' } }),
    });
    if (!res.ok) throw new Error(`push server answered ${res.status}`);
    const { unknown = [] } = await res.json();
    for (const endpoint of unknown) await env.DB.prepare('DELETE FROM admin_devices WHERE endpoint = ?').bind(endpoint).run();
  }
}

async function saveAdminDevice(request, env, me) {
  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
  if (!/^https:\/\/\S{1,500}$/.test(endpoint)) return fail(400, 'invalid endpoint');
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM admin_devices WHERE endpoint = ? AND profile_id = ?').bind(endpoint, me.id).run();
    return json({ ok: true });
  }
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : '💬 New feedback';
  await env.DB.prepare(
    `INSERT INTO admin_devices (endpoint, profile_id, title, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET profile_id = excluded.profile_id, title = excluded.title`,
  )
    .bind(endpoint, me.id, title, new Date().toISOString())
    .run();
  return json({ ok: true });
}

// Newest first. Feedback sent before replies existed has no thread, so `replyable` is false.
async function listFeedback(env) {
  const { results } = await env.DB.prepare(
    `SELECT f.*, t.reaction, t.feedback_id AS thread FROM feedback f
     LEFT JOIN feedback_threads t ON t.feedback_id = f.id ORDER BY f.created_at DESC LIMIT 500`,
  ).all();
  const { results: messages } = await env.DB.prepare(
    `SELECT m.* FROM feedback_messages m JOIN feedback f ON f.id = m.feedback_id ORDER BY m.created_at, m.rowid`,
  ).all();
  return json({
    feedback: results.map((r) => ({
      id: r.id,
      text: r.text,
      lang: r.lang,
      platform: r.platform,
      createdAt: r.created_at,
      replyable: Boolean(r.thread),
      reaction: r.reaction || '',
      messages: messages
        .filter((m) => m.feedback_id === r.id)
        .map((m) => ({ id: m.id, fromAdmin: Boolean(m.from_admin), text: m.text, createdAt: m.created_at })),
    })),
  });
}

// Android App Links: the app claims https://<this server>/invite/CODE links, and Android
// checks this file (with the fingerprint of the app's signing certificate, set at deploy)
// before letting them open the app directly. GitHub Pages can't serve it, because App Links
// need it at the domain root and the site lives under /Habit-Checker/.
function assetLinks(env) {
  const fingerprints = (env.ANDROID_CERT_SHA256 || '').split(',').map((s) => s.trim()).filter(Boolean);
  const body = fingerprints.length
    ? [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'io.github.tmerello1.habitchecker', sha256_cert_fingerprints: fingerprints },
      }]
    : [];
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

// An invite link. With the Android app installed, Android opens the app instead of getting
// here; otherwise the browser is sent on to the web app with the code.
function inviteLink(env, rawCode) {
  const code = normalizeCode(decodeURIComponent(rawCode));
  if (!isCode(code, INVITE_LENGTH)) return Response.redirect(env.APP_URL, 302);
  return Response.redirect(`${env.APP_URL}#invite=${code}`, 302);
}

async function route(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const { method } = request;
  if (method === 'GET' && pathname === '/') return json({ ok: true, service: 'habit-checker-friends' });
  if (method === 'POST' && pathname === '/profiles') return createProfile(request, env);
  if (method === 'POST' && pathname === '/feedback') return sendFeedback(request, env, ctx);
  if (method === 'GET' && pathname === '/.well-known/assetlinks.json') return assetLinks(env);
  const invite = pathname.match(/^\/invite\/([^/]+)$/);
  if (method === 'GET' && invite) return inviteLink(env, invite[1]);
  const thread = pathname.match(/^\/threads\/([\w-]{1,64})(?:\/(messages|device))?$/);
  if (thread) return senderRoute(request, env, ctx, thread[1], thread[2]);

  const me = await signedIn(request, env);
  if (!me) return fail(401, 'unknown profile');
  if (method === 'GET' && pathname === '/me') {
    return json({ me: publicProfile(me), friends: await friendsOf(env, me.id), admin: isAdmin(env, me) });
  }
  if (method === 'PUT' && pathname === '/me/stats') return updateStats(request, env, me);
  if (method === 'DELETE' && pathname === '/me') return deleteProfile(env, me);
  if (method === 'PUT' && pathname === '/me/backup') return saveBackup(request, env, me);
  if (method === 'GET' && pathname === '/me/backup') return readBackup(env, me);
  if (method === 'POST' && pathname === '/invites') return createInvite(env, me);

  let m;
  if ((m = pathname.match(/^\/invites\/([^/]+)$/)) && method === 'GET') return previewInvite(env, me, m[1]);
  if ((m = pathname.match(/^\/invites\/([^/]+)\/accept$/)) && method === 'POST') return acceptInvite(env, me, m[1]);
  if ((m = pathname.match(/^\/friends\/([\w-]{1,64})$/)) && method === 'DELETE') return removeFriend(env, me, m[1]);

  if (pathname === '/feedback' || pathname.startsWith('/feedback/') || pathname === '/admin/device') {
    if (!isAdmin(env, me)) return fail(403, 'not an admin');
    if ((method === 'PUT' || method === 'DELETE') && pathname === '/admin/device') return saveAdminDevice(request, env, me);
    if (method === 'GET' && pathname === '/feedback') return listFeedback(env);
    if ((m = pathname.match(/^\/feedback\/([\w-]{1,64})$/)) && method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(m[1]),
        env.DB.prepare('DELETE FROM feedback_threads WHERE feedback_id = ?').bind(m[1]),
        env.DB.prepare('DELETE FROM feedback_messages WHERE feedback_id = ?').bind(m[1]),
      ]);
      return json({ ok: true });
    }
    if ((m = pathname.match(/^\/feedback\/([\w-]{1,64})\/messages$/)) && method === 'POST') return adminReply(request, env, ctx, m[1]);
    if ((m = pathname.match(/^\/feedback\/([\w-]{1,64})\/reaction$/)) && method === 'PUT') return adminReact(request, env, ctx, m[1]);
  }
  return fail(404, 'not found');
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env, ctx);
    } catch (err) {
      console.error(err);
      return fail(500, 'server error');
    }
  },
};
