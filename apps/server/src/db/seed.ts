// Dev seed: makes the owner account if there is none, so `pnpm dev` can be signed into at once.
// Later phases add sample areas/projects here.

import { pool } from './client';
import { runMigrations } from './migrate';
import { createOwner } from '../services/setup';
import { hasAnyUser } from '../services/users';

const email = process.env.SEED_EMAIL ?? 'dev@strekatron.local';
const password = process.env.SEED_PASSWORD ?? 'strekatron-dev';

await runMigrations();
if (await hasAnyUser()) {
  console.log('An account already exists; nothing to seed.');
} else {
  const res = await createOwner(
    {
      name: 'Dev',
      email,
      password,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    new Headers(),
  );
  if (!res.ok) throw new Error(`Seeding the account failed: ${res.status} ${await res.text()}`);
  console.log(`Seeded the owner account: ${email} / ${password}`);
}
await pool.end();
