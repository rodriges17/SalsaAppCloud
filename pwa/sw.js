const VERSION = '2026-10-20-folder-access-v2';
const PREFIX = `salsa-trainer:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + VERSION;
const files = ['.', './index.html', './styles.css', './app.js', './cloud.js', './cloud-api.js', './cloud-config.js', './storage.js', './app-storage.js', './folder-storage.js', './logic.js', './package.js', './backup-format.js', './backup-ui.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const assets = files.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Only the app shell is cached. User videos use a separate local media cache, never network uploads.
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', self.registration.scope).href)) ?? fetch(event.request)));
  } else if (assets.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) ?? fetch(event.request)));
  }
});
