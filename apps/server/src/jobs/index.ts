// Background jobs on pg-boss (Postgres-backed queue, in its own `pgboss` schema). Failures are
// retried with backoff and logged; they never affect a request.

import { PgBoss } from 'pg-boss';
import { env } from '../env';
import { evaluateAll } from '../services/game';
import { runBackup } from './backup';
import { QUEUES } from './names';
import { runPurge } from './purge';
import { setBoss } from './queue';

export { QUEUES };

export async function startJobs(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => console.error('[jobs] pg-boss error', err));
  await boss.start();

  await boss.createQueue(QUEUES.backup, {
    policy: 'exclusive', // never two backups at once
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });
  await boss.work(QUEUES.backup, async () => {
    const result = await runBackup();
    if (result.status === 'created') {
      console.log(`[jobs] backup written: ${result.file} (${result.bytes} bytes)`);
      for (const name of result.pruned) console.log(`[jobs] old backup removed: ${name}`);
    }
  });
  // Hourly; the job itself makes at most one backup per day.
  await boss.schedule(QUEUES.backup, '17 * * * *');
  // And once at startup, for a machine that was off when the last one was due.
  await boss.send(QUEUES.backup);

  await boss.createQueue(QUEUES.purge, { policy: 'exclusive', retryLimit: 3, retryDelay: 300 });
  await boss.work(QUEUES.purge, async () => {
    const gone = await runPurge();
    if (gone.tasks || gone.goals || gone.snapshots) {
      console.log(
        `[jobs] purged ${gone.tasks} task(s), ${gone.goals} goal(s), ${gone.snapshots} snapshot(s) past 30 days`,
      );
    }
  });
  await boss.schedule(QUEUES.purge, '43 * * * *');

  // Retries of a game evaluation that failed after a write (http/game.ts).
  await boss.createQueue(QUEUES.game, { retryLimit: 5, retryDelay: 30, retryBackoff: true });
  await boss.work<{ userId: string }>(QUEUES.game, async ([job]) => {
    if (job) await evaluateAll(job.data.userId);
  });

  setBoss(boss);
  return boss;
}
