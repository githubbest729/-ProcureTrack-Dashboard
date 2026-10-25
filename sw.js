/* ProcureTrack service worker */
const STATIC_CACHE = 'procuretrack-static-v2';
const DYNAMIC_CACHE = 'procuretrack-dynamic-v2';
const SHELL = [
  './', './index.html', './offline.html', './manifest.webmanifest',
  './css/styles.css', './js/db.js', './js/seed.js', './js/charts.js', './js/tour.js', './js/app.js',
  './assets/logo.svg', './favicon.svg', './favicon.ico', './apple-touch-icon.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/favicon-16x16.png', './icons/favicon-32x32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, DYNAMIC_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('procuretrack-') && !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first with offline fallback
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        caches.open(DYNAMIC_CACHE).then((c) => c.put(req, copy));
        return res;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(cached ? STATIC_CACHE : DYNAMIC_CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'procuretrack-sync') {
    event.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: 'SYNC_DONE', at: Date.now() }))));
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'ProcureTrack delivery alert', body: 'A delivery or blocker needs your attention.' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icons/icon-192.png', badge: './icons/icon-96.png', tag: 'procuretrack-alert', data: { url: './index.html#procurement' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
