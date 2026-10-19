// Feedback threads. Pure, so it's tested under Node; app.js renders it and friends.js talks
// to the server.
//
// Senders stay anonymous: sending feedback returns a random token, and this device keeps
// each thread (token, what was sent, the replies seen so far) under FEEDBACK_KEY. Admins
// see every thread in the inbox, which filters and sorts them with filterFeedback().

export const FEEDBACK_KEY = 'habit-checker:feedback';
export const MAX_THREADS = 20;
export const REACTIONS = ['👍', '❤️', '🙏', '😂', '🎉'];

// --- The sender's side -----------------------------------------------------------------

const adminCount = (thread) => thread.messages.filter((m) => m.fromAdmin).length;

// Replies and reactions not yet looked at, across threads or for one.
export function unread(thread) {
  return Math.max(0, adminCount(thread) - (thread.seenAdmin || 0)) + (thread.reaction && thread.reaction !== thread.seenReaction ? 1 : 0);
}
export const unreadTotal = (threads) => threads.reduce((n, t) => n + unread(t), 0);

// Everything counts as seen once the sender opens their feedback.
export const markSeen = (threads) => threads.map((t) => ({ ...t, seenAdmin: adminCount(t), seenReaction: t.reaction }));

// A just-sent feedback becomes a thread; the oldest ones drop off past MAX_THREADS.
export function addThread(threads, { id, token, text, createdAt }) {
  const thread = { id, token, text, createdAt, reaction: '', messages: [], seenAdmin: 0, seenReaction: '', closed: false };
  return [thread, ...threads].slice(0, MAX_THREADS);
}

// Takes in what the server said about a thread; null means it's gone (the admin cleared
// it), which keeps the replies already here but closes it for answers.
export function updateThread(threads, id, remote) {
  return threads.map((t) => {
    if (t.id !== id) return t;
    if (!remote) return { ...t, closed: true };
    return { ...t, reaction: remote.reaction || '', messages: remote.messages || [] };
  });
}

// Reads stored threads, dropping anything malformed.
export function parseThreads(raw) {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => t && typeof t.id === 'string' && typeof t.token === 'string' && typeof t.text === 'string')
      .map((t) => ({ reaction: '', seenAdmin: 0, seenReaction: '', closed: false, ...t, messages: Array.isArray(t.messages) ? t.messages : [] }))
      .slice(0, MAX_THREADS);
  } catch {
    return [];
  }
}

// --- The admin inbox -------------------------------------------------------------------

// new: nobody has answered yet. waiting: the sender wrote last, after an admin's reply.
// answered: an admin replied or reacted, and the sender hasn't written since.
export function feedbackStatus(f) {
  const last = f.messages?.at(-1);
  if (last && !last.fromAdmin) return 'waiting';
  if (last || f.reaction) return 'answered';
  return 'new';
}

// filter: { status: 'all'|'new'|'waiting'|'answered', platform: 'all'|'web'|'android',
// lang: 'all'|<code>, query, oldestFirst }. The query matches the feedback and its messages.
export function filterFeedback(list, filter = {}) {
  const query = (filter.query || '').trim().toLowerCase();
  const hit = (f) => [f.text, ...(f.messages || []).map((m) => m.text)].some((s) => s.toLowerCase().includes(query));
  const out = list.filter(
    (f) =>
      (!filter.status || filter.status === 'all' || feedbackStatus(f) === filter.status) &&
      (!filter.platform || filter.platform === 'all' || f.platform === filter.platform) &&
      (!filter.lang || filter.lang === 'all' || f.lang === filter.lang) &&
      (!query || hit(f)),
  );
  // ISO timestamps sort as text.
  return out.sort((a, b) => (filter.oldestFirst ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
}

// How many of each status, for the filter chips.
export function statusCounts(list) {
  const counts = { all: list.length, new: 0, waiting: 0, answered: 0 };
  for (const f of list) counts[feedbackStatus(f)]++;
  return counts;
}
