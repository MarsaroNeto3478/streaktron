// Around focus sessions (D33): breaks, the clock in the tab (title and favicon), and the floating
// mini clock window. Breaks earn nothing and live only in this browser (localStorage), so they're
// a convenience: losing one costs nothing.

import { useEffect, useSyncExternalStore } from 'react';

// --- A tiny store helper ---------------------------------------------------------------------

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    use(): T {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => value,
      );
    },
  };
}

// --- Breaks ----------------------------------------------------------------------------------

export interface Break {
  startedAt: number;
  minutes: number;
}

const BREAK_KEY = 'strekatron.break';

function readBreak(): Break | null {
  try {
    const raw = localStorage.getItem(BREAK_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Break;
    // A break long over (the tab was closed) isn't worth showing again.
    if (Date.now() - b.startedAt > (b.minutes + 30) * 60_000) return null;
    return b;
  } catch {
    return null;
  }
}

const breakStore = store<Break | null>(readBreak());

function saveBreak(b: Break | null) {
  breakStore.set(b);
  try {
    if (b) localStorage.setItem(BREAK_KEY, JSON.stringify(b));
    else localStorage.removeItem(BREAK_KEY);
  } catch {
    // Private mode or blocked storage: the break still runs in this tab.
  }
}

export const startBreak = (minutes: number) => saveBreak({ startedAt: Date.now(), minutes });
export const endBreak = () => saveBreak(null);
export const useBreak = () => breakStore.use();

/** The break length that goes with a session: its preset's, or 5 minutes. */
export function breakFor(
  plannedMinutes: number,
  presets: { focusMinutes: number; breakMinutes: number }[],
): number {
  return presets.find((p) => p.focusMinutes === plannedMinutes)?.breakMinutes ?? 5;
}

// --- The clock in the tab --------------------------------------------------------------------

const COLORS = { focus: '#f97316', break: '#0ea5e9' };

function ringIcon(fraction: number, kind: 'focus' | 'break'): string | null {
  try {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!g) return null;
    const r = size / 2 - 6;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(128,128,128,0.35)';
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = COLORS[kind];
    g.lineCap = 'round';
    g.beginPath();
    const f = Math.min(1, Math.max(0, fraction));
    g.arc(size / 2, size / 2, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
    g.stroke();
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * While a session or break runs: the time left in the tab's title and a progress ring as its
 * icon, so it shows from other tabs. Both go back when it ends.
 */
export function useTabClock(
  clock: { text: string; fraction: number; kind: 'focus' | 'break' } | null,
) {
  const text = clock?.text;
  const kind = clock?.kind;
  // The ring changes in whole percents, not every tick.
  const pct = clock ? Math.round(clock.fraction * 100) : null;

  useEffect(() => {
    if (text === undefined || !kind) return;
    const before = document.title;
    document.title = `${kind === 'focus' ? '⏱' : '☕'} ${text} · Strekatron`;
    return () => {
      document.title = before;
    };
  }, [text, kind]);

  useEffect(() => {
    if (pct === null || !kind) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return;
    const before = link.href;
    const icon = ringIcon(pct / 100, kind);
    if (icon) link.href = icon;
    return () => {
      link.href = before;
    };
  }, [pct, kind]);
}

// --- The mini clock window (Document Picture-in-Picture) --------------------------------------

interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

const pip = (): DocumentPictureInPicture | undefined =>
  (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

/** Chrome and Edge on desktop; elsewhere the button isn't offered. */
export const miniClockSupported = () => typeof window !== 'undefined' && !!pip();

const miniStore = store<Window | null>(null);
export const useMiniClockWindow = () => miniStore.use();

export async function openMiniClock() {
  const api = pip();
  if (!api || miniStore.get()) return;
  const win = await api.requestWindow({ width: 240, height: 120 });
  win.document.title = 'Strekatron focus';
  win.document.body.style.margin = '0';
  win.addEventListener('pagehide', () => miniStore.set(null));
  miniStore.set(win);
}

export function closeMiniClock() {
  miniStore.get()?.close();
  miniStore.set(null);
}
