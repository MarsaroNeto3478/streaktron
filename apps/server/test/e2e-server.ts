// The server the browser tests (e2e/) run against: a fresh database every run, the built web app,
// no background jobs. Playwright starts it (e2e/playwright.config.ts); it never touches the real
// database.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import pg from 'pg';

const url = new URL(
  process.env.E2E_DATABASE_URL ?? 'postgres://strekatron:strekatron@localhost:5432/strekatron_e2e',
);
const name = decodeURIComponent(url.pathname.slice(1));
if (!name.endsWith('_e2e'))
  throw new Error(`Refusing to recreate "${name}": not an _e2e database.`);

const admin = new URL(url);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${name}"`);
await client.end();

const port = process.env.E2E_PORT ?? '3201';
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: url.toString(),
  PORT: port,
  APP_ORIGINS: `http://localhost:${port}`,
  // serveStatic takes a path relative to the working directory.
  STATIC_DIR: relative(process.cwd(), join(import.meta.dirname, '../../web/dist')),
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-000000',
  DATA_DIR: mkdtempSync(join(tmpdir(), 'strekatron-e2e-')),
  PG_DUMP: `sh ${join(import.meta.dirname, 'fixtures/fake-pg-dump.sh')}`,
  JOBS_ENABLED: 'false',
});

// The real entry point: migrations, then the server.
await import('../src/index');
