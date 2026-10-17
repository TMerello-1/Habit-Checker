// Cache-first service worker for offline use. Bump CACHE whenever any file in
// ASSETS changes, or installed users keep running the old version.
const CACHE = 'habit-checker-v18';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'src/app.js',
  'src/codes.js',
  'src/config.js',
  'src/dates.js',
  'src/friends.js',
  'src/habits.js',
  'src/i18n.js',
  'src/install.js',
  'src/names.js',
  'src/push.js',
  'src/reminders.js',
  'src/store.js',
  'src/transfer.js',
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

// Reminders sent by the push server (server/) while the app is closed.
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Habit Checker', {
      body: data.body || 'Time for a habit!',
      tag: data.tag,
      icon: 'icons/icon.svg',
    }),
  );
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
