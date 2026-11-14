// Light, dark or the system's choice (D53). The choice belongs to the device, not the account: a
// phone can stay dark while the laptop follows the system. index.html applies it before the first
// paint with the same key, so a dark page never flashes white.

import { useSyncExternalStore } from 'react';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const KEY = 'strekatron-theme';
/** The browser bar's color, the page background of each theme. */
const BAR = { light: '#faf9f7', dark: '#1c1917' };

const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return (THEMES as readonly string[]).includes(v ?? '') ? (v as Theme) : 'system';
  } catch {
    return 'system';
  }
}

let current: Theme = 'system';

function apply() {
  const dark = current === 'dark' || (current === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? BAR.dark : BAR.light);
}

/** Starts applying the saved choice, and follows the system while the choice is "system". */
export function startTheme() {
  current = read();
  apply();
  media().addEventListener('change', apply);
  // Another tab changed it.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    current = read();
    apply();
    listeners.forEach((l) => l());
  });
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode: it still applies until the page closes.
  }
  apply();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
