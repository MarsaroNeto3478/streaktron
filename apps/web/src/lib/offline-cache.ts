// What the app has loaded, kept on this device (D55), so it opens with your data when the server
// can't be reached: every page you've opened shows what it showed last. Saved a moment after
// queries change; read back before the first page loads. Fresh data replaces it as soon as the
// server answers.

import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { idbDelete, idbGet, idbSet } from './idb';
import { clearOutbox } from './outbox';

const KEY = 'queries';
/** Raise when cached shapes change in a way old data would break. */
const VERSION = 1;
/** Older than this, a saved cache isn't worth showing. */
export const MAX_AGE_MS = 14 * 24 * 3600_000;
/** Queries not worth keeping (asked fresh each time, or meaningless offline). */
const SKIP = new Set(['setup', 'push', 'search', 'snapshots']);

interface Saved {
  version: number;
  savedAt: number;
  state: DehydratedState;
}

/** Put the saved cache back into `qc` (before the router's first load). */
export async function restoreCache(qc: QueryClient) {
  const saved = await idbGet<Saved>(KEY);
  if (!saved || saved.version !== VERSION || Date.now() - saved.savedAt > MAX_AGE_MS) return;
  hydrate(qc, saved.state);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

function persist(qc: QueryClient) {
  if (stopped) return;
  const state = dehydrate(qc, {
    shouldDehydrateQuery: (q) => q.state.status === 'success' && !SKIP.has(String(q.queryKey[0])),
    shouldDehydrateMutation: () => false,
  });
  // Plain data only (what the API sent).
  const saved: Saved = {
    version: VERSION,
    savedAt: Date.now(),
    state: JSON.parse(JSON.stringify(state)),
  };
  void idbSet(KEY, saved);
}

/** Save the cache a moment after it changes, and when the page is put away. */
export function keepCache(qc: QueryClient) {
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'removed') return;
    clearTimeout(timer);
    timer = setTimeout(() => persist(qc), 1000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist(qc);
  });
}

/** Signing out: nothing of the account stays on this device. */
export async function clearOfflineData(qc: QueryClient) {
  stopped = true;
  clearTimeout(timer);
  qc.clear();
  await Promise.all([idbDelete(KEY), clearOutbox()]);
  stopped = false;
}
