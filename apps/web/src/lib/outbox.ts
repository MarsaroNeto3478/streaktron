// Changes made while the server can't be reached (D55): the day-to-day writes (capture, edit,
// complete, move on the board, habit check-ins) wait here, in order, on this device, and go out
// when the server answers again. Each one says when it was made (`X-Occurred-At`), so a task done
// on the bus counts for that day. Everything else needs a connection.
//
//   const sent = await send({ kind: 'task.complete', id }, task.title);
//   if (sent.queued) … // shown as done; the server hears about it later
//
// Quire's lesson (plan.md §11): one route table of every write that can wait, client-made ids so
// a create sent twice makes one task, and one merge rule for what comes back.

import type { TaskCreate, TaskMove, TaskPatch } from '@strekatron/shared/schemas';
import type { ClientResponse } from 'hono/client';
import { useSyncExternalStore } from 'react';
import { api, ApiError, call, isUnreachable } from './api';
import { idbGet, idbSet } from './idb';

export type Change =
  | { kind: 'task.create'; input: TaskCreate & { id: string } }
  | { kind: 'task.patch'; id: string; patch: TaskPatch }
  | { kind: 'task.complete'; id: string }
  | { kind: 'task.reopen'; id: string }
  | { kind: 'task.move'; id: string; move: TaskMove }
  | { kind: 'habit.checkin'; id: string; date?: string }
  | { kind: 'habit.uncheck'; id: string; date: string };

export type Queued = Change & {
  /** When it was made (ISO), sent as `X-Occurred-At`. */
  at: string;
  /** What it was about, for messages (“Buy paper”). */
  label: string;
  /** Times the server failed on it (5xx); after a few it's given up, so the rest can go. */
  tries?: number;
};

const MAX_TRIES = 5;

type Headers = Record<string, string>;

/** The route table: how each change is sent. */
function request(
  c: Change,
  headers: Headers = {},
): Promise<ClientResponse<unknown, number, string>> {
  const o = { headers };
  switch (c.kind) {
    case 'task.create':
      return api.tasks.$post({ json: c.input }, o);
    case 'task.patch':
      return api.tasks[':id'].$patch({ param: { id: c.id }, json: c.patch }, o);
    case 'task.complete':
      return api.tasks[':id'].complete.$post({ param: { id: c.id } }, o);
    case 'task.reopen':
      return api.tasks[':id'].reopen.$post({ param: { id: c.id } }, o);
    case 'task.move':
      return api.tasks[':id'].move.$post({ param: { id: c.id }, json: c.move }, o);
    case 'habit.checkin':
      return api.habits[':id'].checkin.$post(
        { param: { id: c.id }, json: c.date ? { date: c.date } : {} },
        o,
      );
    case 'habit.uncheck':
      return api.habits[':id'].checkin[':date'].$delete({ param: { id: c.id, date: c.date } }, o);
  }
}

// --- State -----------------------------------------------------------------------------------

const KEY = 'outbox';

export type Connection = 'online' | 'offline' | 'syncing';

interface State {
  connection: Connection;
  /** Changes waiting to be sent. */
  pending: number;
}

let queue: Queued[] = [];
let state: State = { connection: 'online', pending: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  const merged = { ...state, ...next, pending: queue.length };
  if (merged.connection === state.connection && merged.pending === state.pending) return;
  state = merged;
  for (const l of listeners) l();
}

const save = () => idbSet(KEY, queue);

/** What the offline indicator shows. */
export function useOutbox(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const outboxState = () => state;

// --- Sending ---------------------------------------------------------------------------------

export type Sent<T> = { queued: true } | { queued: false; result: T };

function enqueue(change: Change, label: string) {
  const last = queue.at(-1);
  // Edits of one task in a row go as one.
  if (last?.kind === 'task.patch' && change.kind === 'task.patch' && last.id === change.id) {
    last.patch = { ...last.patch, ...change.patch };
  } else {
    queue.push({ ...change, at: new Date().toISOString(), label });
  }
  set({});
  void save();
  schedule();
}

/**
 * Send a change now; if the server can't be reached, keep it for later (resolves `{ queued }`).
 * While others wait, it waits behind them, so the server sees them in the order they were made.
 * Any other failure throws, as `call` does.
 */
export async function send<T>(change: Change, label: string): Promise<Sent<T>> {
  if (queue.length) {
    enqueue(change, label);
    if (state.connection !== 'offline') void drain();
    return { queued: true };
  }
  try {
    return { queued: false, result: (await call(request(change))) as T };
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    enqueue(change, label);
    return { queued: true };
  }
}

export interface SyncReport {
  synced: number;
  /** Changes the server refused (a task deleted elsewhere, a change over a week old). */
  failed: { label: string; message: string }[];
}

let onSynced: (report: SyncReport) => void = () => {};

/** After the queue empties: refresh what the server derived, and say what happened. */
export const setSyncedHandler = (fn: (report: SyncReport) => void) => {
  onSynced = fn;
};

let draining: Promise<void> | null = null;

/** Send what waits, oldest first; stops at the first one the server can't take yet. */
export function drain(): Promise<void> {
  draining ??= (async () => {
    if (!queue.length) return;
    set({ connection: 'syncing' });
    const report: SyncReport = { synced: 0, failed: [] };
    while (queue.length) {
      const next = queue[0]!;
      try {
        await call(request(next, { 'x-occurred-at': next.at }));
        report.synced++;
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 500;
        const failing = status >= 500 && !isUnreachable(err);
        if (failing) next.tries = (next.tries ?? 0) + 1;
        // Unreachable, signed out or the server failing: try again later, in the same order.
        if (isUnreachable(err) || status === 401 || (failing && next.tries! < MAX_TRIES)) {
          void save();
          set({ connection: isUnreachable(err) ? 'offline' : 'online' });
          schedule();
          if (report.synced || report.failed.length) onSynced(report);
          return;
        }
        report.failed.push({
          label: next.label,
          message: err instanceof Error ? err.message : 'It was refused.',
        });
      }
      queue.shift();
      set({});
      await save();
    }
    set({ connection: 'online' });
    onSynced(report);
  })().finally(() => {
    draining = null;
  });
  return draining;
}

// While offline, look for the server now and then; any answer sends what waits.
let timer: ReturnType<typeof setTimeout> | undefined;
const RETRY_MS = 20_000;

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    if (queue.length) void drain();
    else if (state.connection === 'offline') void probe();
  }, RETRY_MS);
}

async function probe() {
  try {
    await call(api.health.$get());
  } catch {
    // still away; `call` told us
  }
  if (state.connection === 'offline') schedule();
}

/** Whether a request reached the server (every `call` tells this). */
export function reached(ok: boolean) {
  if (!ok) {
    if (state.connection !== 'syncing') set({ connection: 'offline' });
    schedule();
    return;
  }
  if (state.connection === 'offline') {
    set({ connection: 'online' });
    if (queue.length) void drain();
  }
}

/** Load what waited from the last visit and try to send it. */
export async function startOutbox() {
  const saved = await idbGet<Queued[]>(KEY);
  if (Array.isArray(saved) && saved.length) {
    queue = [...saved, ...queue];
    set({});
    void drain();
  }
  window.addEventListener('online', () => void (queue.length ? drain() : probe()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && queue.length) void drain();
  });
}

/** Forget what waits (signing out). */
export async function clearOutbox() {
  queue = [];
  set({ connection: 'online' });
  await save();
}
