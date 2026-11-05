// Database backups: one pg_dump per day (the owner's day), the newest BACKUP_KEEP kept, in
// DATA_DIR/backups. The job runs hourly and makes the day's backup if it isn't there yet, so a
// laptop that was off at night still gets one.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { userDay, type DateString } from '@strekatron/shared/time';
import { env } from '../env';
import { getOwnerSettings } from '../services/users';

const NAME_RE = /^strekatron-(\d{4}-\d{2}-\d{2})\.dump$/;

export const backupFileName = (day: DateString) => `strekatron-${day}.dump`;

/** Backup files to delete so that only the newest `keep` remain (other files are left alone). */
export function filesToPrune(names: string[], keep: number): string[] {
  return names
    .filter((n) => NAME_RE.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

export type BackupResult =
  | { status: 'created'; file: string; bytes: number; pruned: string[] }
  | { status: 'skipped'; file: string; reason: 'exists' };

export async function runBackup({ force = false } = {}): Promise<BackupResult> {
  const owner = await getOwnerSettings();
  const day = userDay(new Date(), {
    timeZone: owner?.timezone ?? 'UTC',
    dayStartHour: owner?.dayStartHour ?? 0,
  });
  const dir = join(env.DATA_DIR, 'backups');
  const file = join(dir, backupFileName(day));
  await mkdir(dir, { recursive: true });

  if (!force && (await stat(file).catch(() => null))) {
    return { status: 'skipped', file, reason: 'exists' };
  }

  const partial = `${file}.partial`;
  try {
    await dump(partial);
    await rename(partial, file);
  } catch (err) {
    await rm(partial, { force: true });
    throw err;
  }

  const pruned = filesToPrune(await readdir(dir), env.BACKUP_KEEP);
  await Promise.all(pruned.map((n) => rm(join(dir, n), { force: true })));
  const { size } = await stat(file);
  return { status: 'created', file, bytes: size, pruned };
}

/** pg_dump in custom format (compressed; restore with pg_restore) to `out`. */
function dump(out: string): Promise<void> {
  const [cmd, ...pre] = env.PG_DUMP.split(/\s+/).filter(Boolean);
  if (!cmd) return Promise.reject(new Error('PG_DUMP is empty'));
  const args = [...pre, '--format=custom', '--no-owner', `--dbname=${env.DATABASE_URL}`];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const sink = createWriteStream(out);
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.stdout.pipe(sink);
    child.on('error', (err) => reject(new Error(`could not run ${cmd}: ${err.message}`)));
    child.on('close', (code) => {
      sink.close(() => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} exited with ${code}: ${stderr.trim()}`));
      });
    });
  });
}
