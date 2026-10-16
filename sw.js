// Cache-first service worker for offline use. Bump CACHE whenever any file in
// ASSETS changes, or installed users keep running the old version.
const CACHE = 'habit-checker-v7';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'src/app.js',
  'src/dates.js',
  'src/habits.js',
  'src/reminders.js',
  'src/store.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages allows 10 minutes),
  // which could otherwise fill the new cache with the previous version's files.
  const fresh = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

// Tapping a reminder focuses the open app, or opens it.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) =>
      wins.length ? wins[0].focus() : self.clients.openWindow('./'),
    ),
  );
});
