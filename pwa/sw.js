const VERSION = '2026-10-28-compact-tags-v1';
const PREFIX = `salsa-trainer:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + VERSION;
const files = ['.', './index.html', './styles.css', './appearance.js', './zoom.js', './fonts/Inter-400.woff', './fonts/Inter-500.woff', './fonts/Inter-600.woff', './fonts/Inter-700.woff', './app.js', './tag-picker.js', './tag-catalog.js', './tag-suggestions.js', './file-delivery.js', './figure-zip.js', './cloud.js', './cloud-upload.js', './cloud-dedup.js', './cloud-people.js', './cloud-members.js', './cloud-local.js', './cloud-provenance.js', './cloud-local-content.js', './cloud-library-download.js', './cloud-library-order.js', './cloud-library-draft.js', './cloud-read-state.js', './cloud-cache.js', './cloud-posters.js', './cloud-api.js', './cloud-config.js', './storage.js', './app-storage.js', './folder-storage.js', './logic.js', './package.js', './backup-format.js', './backup-ui.js', './backup-workflow.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const assets = files.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Standalone guides have their own HTML and must not resolve to the app shell.
  if (url.pathname.startsWith(new URL('./anleitungen/', self.registration.scope).pathname)) return;
  // Only the app shell is cached. User videos use a separate local media cache, never network uploads.
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', self.registration.scope).href)) ?? fetch(event.request)));
  } else if (assets.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) ?? fetch(event.request)));
  }
});
