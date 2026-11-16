// Strekatron's service worker. It makes the app installable and shows Web Push notifications
// (Phase 4, D45), and it keeps the app itself on the device so it opens without the server (D55):
// the build writes the list of its files into PRECACHE below (vite.config.ts), they're saved on
// install, and pages and files come from here when the network or the server doesn't answer.
// Data is the app's business (IndexedDB); requests to /api always go to the network.
//
// In development PRECACHE stays null: nothing is cached and every request goes to Vite.

/* global self, URL, caches, fetch, Request, Response, AbortController, setTimeout, clearTimeout */

const PRECACHE = /*__PRECACHE__*/ null;

const PREFIX = 'strekatron-';
const APP = PRECACHE ? `${PREFIX}app-${PRECACHE.version}` : null;
const RUNTIME = `${PREFIX}runtime`;
/** How long a page waits for the server before showing the saved app. */
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (APP) {
        const cache = await caches.open(APP);
        // One file failing (a deploy mid-install) doesn't stop the rest.
        await Promise.allSettled(
          PRECACHE.files.map((f) => cache.add(new Request(f, { cache: 'reload' }))),
        );
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Older versions of the app go; in development, everything this worker ever saved.
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== APP && (APP ? name !== RUNTIME : true)) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/** The network, or nothing after `ms` (a phone on the tailnet with the computer off can hang). */
async function network(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(request, { signal: controller.signal });
    // 502–504: the proxy in front answered for a server that's off.
    return res.status >= 502 && res.status <= 504 ? null : res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromCache(request) {
  return (await caches.match(request, { ignoreSearch: request.mode === 'navigate' })) ?? null;
}

self.addEventListener('fetch', (event) => {
  if (!APP) return;
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: the server's when it answers in time, else the saved app (one page for every route).
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const res = await network(request, NAV_TIMEOUT_MS);
        if (res) return res;
        return (
          (await caches.match('/', { cacheName: APP })) ??
          new Response('Strekatron is offline and not saved on this device yet.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        );
      })(),
    );
    return;
  }

  // Built files have their content in their name: the saved copy is the right one.
  if (url.pathname.startsWith('/assets/') && /-[\w-]{8,}\.\w+$/.test(url.pathname)) {
    event.respondWith((async () => (await fromCache(request)) ?? fetch(request))());
    return;
  }

  // Everything else (icons, Streaky, collectibles, the manifest): fresh when possible, saved as
  // it comes, the saved copy when offline.
  event.respondWith(
    (async () => {
      const res = await network(request, NAV_TIMEOUT_MS);
      if (res && res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(RUNTIME).then((c) => c.put(request, copy)));
        return res;
      }
      return (await fromCache(request)) ?? res ?? Response.error();
    })(),
  );
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Strekatron', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/today' },
    }),
  );
});

// Tapping a notification opens the app where it points: an open window is focused and told to go
// there (the app's router moves without a reload); otherwise a new one opens.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/today', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === url.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', to: url.pathname + url.search });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
