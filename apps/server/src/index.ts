import { serve } from '@hono/node-server';
import { app } from './app';
import { pool } from './db/client';
import { runMigrations } from './db/migrate';
import { env } from './env';
import { startJobs } from './jobs';

await runMigrations();
const boss = env.JOBS_ENABLED ? await startJobs() : null;

const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`Strekatron server on http://${info.address}:${info.port}`);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  server.close();
  await boss?.stop({ graceful: true, timeout: 10_000 }).catch((e) => console.error(e));
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
