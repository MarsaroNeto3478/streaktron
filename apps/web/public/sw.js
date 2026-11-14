// Strekatron's service worker (Phase 4, D45): it makes the app installable and shows Web Push
// notifications. It keeps no data offline: every request still goes to the network.

/* global self, URL */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
