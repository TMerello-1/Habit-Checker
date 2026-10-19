import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addThread, feedbackStatus, filterFeedback, markSeen, MAX_THREADS, parseThreads, statusCounts, unread, unreadTotal, updateThread } from '../src/feedback.js';

const sent = (id, createdAt = '2026-10-19T10:00:00.000Z') => ({ id, token: 'T'.repeat(20), text: `text ${id}`, createdAt });
const admin = (text) => ({ fromAdmin: true, text, createdAt: '2026-10-19T11:00:00.000Z' });
const sender = (text) => ({ fromAdmin: false, text, createdAt: '2026-10-19T12:00:00.000Z' });

test('replies and a reaction count as unread until the sender opens them', () => {
  let threads = addThread([], sent('a'));
  assert.equal(unreadTotal(threads), 0);
  threads = updateThread(threads, 'a', { reaction: '👍', messages: [admin('On it')] });
  assert.equal(unread(threads[0]), 2);
  threads = markSeen(threads);
  assert.equal(unreadTotal(threads), 0);
  // The sender's own answer isn't unread; a changed reaction is.
  threads = updateThread(threads, 'a', { reaction: '🎉', messages: [admin('On it'), sender('Thanks')] });
  assert.equal(unreadTotal(threads), 1);
});

test('a thread the admin cleared keeps its replies but closes', () => {
  let threads = updateThread(addThread([], sent('a')), 'a', { reaction: '', messages: [admin('Done')] });
  threads = updateThread(threads, 'a', null);
  assert.equal(threads[0].closed, true);
  assert.equal(threads[0].messages.length, 1);
});

test('keeps the newest threads only, and stored threads survive a round trip', () => {
  let threads = [];
  for (let i = 0; i < MAX_THREADS + 3; i++) threads = addThread(threads, sent(`t${i}`));
  assert.equal(threads.length, MAX_THREADS);
  assert.equal(threads[0].id, `t${MAX_THREADS + 2}`);
  assert.deepEqual(parseThreads(JSON.stringify(threads)), threads);
  assert.deepEqual(parseThreads('not json'), []);
  assert.deepEqual(parseThreads(JSON.stringify([{ id: 1 }, sent('ok')])).map((t) => t.id), ['ok']);
});

test('inbox status: new, answered, or waiting on the admin again', () => {
  assert.equal(feedbackStatus({ messages: [], reaction: '' }), 'new');
  assert.equal(feedbackStatus({ messages: [], reaction: '👍' }), 'answered');
  assert.equal(feedbackStatus({ messages: [admin('hi')], reaction: '' }), 'answered');
  assert.equal(feedbackStatus({ messages: [admin('hi'), sender('more')], reaction: '' }), 'waiting');
});

test('the inbox filters by status, platform, language and text, newest first unless asked', () => {
  const list = [
    { id: 1, text: 'Dark mode', lang: 'en', platform: 'web', createdAt: '2026-10-01T00:00:00Z', messages: [], reaction: '' },
    { id: 2, text: 'Widget', lang: 'de', platform: 'android', createdAt: '2026-10-03T00:00:00Z', messages: [admin('Thanks')], reaction: '' },
    { id: 3, text: 'Bug', lang: 'de', platform: 'web', createdAt: '2026-10-02T00:00:00Z', messages: [admin('Which?'), sender('The streak one')], reaction: '' },
  ];
  const ids = (f) => filterFeedback(list, f).map((x) => x.id);
  assert.deepEqual(ids({}), [2, 3, 1]);
  assert.deepEqual(ids({ oldestFirst: true }), [1, 3, 2]);
  assert.deepEqual(ids({ status: 'new' }), [1]);
  assert.deepEqual(ids({ status: 'waiting' }), [3]);
  assert.deepEqual(ids({ platform: 'web' }), [3, 1]);
  assert.deepEqual(ids({ lang: 'de', status: 'answered' }), [2]);
  assert.deepEqual(ids({ query: 'STREAK' }), [3]);
  assert.deepEqual(statusCounts(list), { all: 3, new: 1, waiting: 1, answered: 1 });
});
