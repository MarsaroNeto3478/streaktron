// Configuration from the environment, validated once at startup.

import { z } from 'zod';
import { DEFAULT_DATA_DIR } from './paths';

const list = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().startsWith('postgres', 'DATABASE_URL must be a postgres:// URL'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  /** Origins the app is opened at (first = canonical): localhost, the Vite dev server, the tailnet. */
  APP_ORIGINS: list
    .default(['http://localhost:5173', 'http://localhost:3001'])
    .pipe(z.array(z.url()).min(1)),
  /** Built web app to serve; empty to serve none (dev, where Vite serves it). */
  STATIC_DIR: z.string().optional(),
  DATA_DIR: z.string().default(DEFAULT_DATA_DIR),
  /** Command that runs pg_dump (`docker exec -i strekatron-db pg_dump` when it isn't installed). */
  PG_DUMP: z.string().default('pg_dump'),
  BACKUP_KEEP: z.coerce.number().int().min(1).default(14),
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid environment (see .env.example):\n${lines.join('\n')}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
