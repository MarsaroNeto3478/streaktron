// Web Push in the browser (D45): the service worker, and turning notifications on or off for this
// device. The server sends the reminders; this only hands it the device's subscription.

import { api, call } from './api';

/** This browser can receive pushes (secure page, service workers, the Push API). */
export const pushSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** On iPhone and iPad, pushes only reach the app once it's on the Home Screen. */
export const needsHomeScreen = () => {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

/** Register the service worker (installable app, push); the app works the same without it. */
export async function registerServiceWorker(onNavigate: (to: string) => void) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[push] service worker not registered', err);
    return;
  }
  // A tapped notification asks an open window to go somewhere.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string; to?: string } | null;
    if (data?.type === 'navigate' && data.to) onNavigate(data.to);
  });
}

async function registration() {
  return navigator.serviceWorker.ready;
}

/** This device's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ask for permission and subscribe this device. Resolves to the permission the user gave. */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const { publicKey } = await call(api.push.$get());
  const reg = await registration();
  const applicationServerKey = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another server key can't be reused.
  const sameKey = (s: PushSubscription) => {
    const k = s.options.applicationServerKey;
    if (!k) return false;
    const a = new Uint8Array(k);
    return (
      a.length === applicationServerKey.length && a.every((b, i) => b === applicationServerKey[i])
    );
  };
  if (sub && !sameKey(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await call(api.push.subscriptions.$post({ json: { endpoint: json.endpoint, keys: json.keys } }));
  return permission;
}

/** Stop pushes to this device. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await call(api.push.subscriptions.remove.$post({ json: { endpoint: sub.endpoint } }));
  await sub.unsubscribe();
}

export async function sendTestPush() {
  return call(api.push.test.$post());
}
