// Sending jobs from request handlers. The pg-boss instance exists only when jobs run (not in tests
// or with JOBS_ENABLED=false); then sends are just logged.

import type { PgBoss } from 'pg-boss';

let boss: PgBoss | null = null;

export function setBoss(b: PgBoss | null) {
  boss = b;
}

export async function enqueue(queue: string, data: object) {
  if (!boss) {
    console.warn(`[jobs] not running; dropped a ${queue} job`, data);
    return;
  }
  await boss.send(queue, data);
}
