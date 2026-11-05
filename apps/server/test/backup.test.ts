import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/env';
import { backupFileName, filesToPrune, runBackup } from '../src/jobs/backup';
import { resetDb, setUpOwner } from './helpers';

describe('filesToPrune', () => {
  const days = Array.from({ length: 16 }, (_, i) =>
    backupFileName(`2026-10-${String(i + 1).padStart(2, '0')}`),
  );

  it('keeps the newest ones', () => {
    expect(filesToPrune(days, 14)).toEqual([
      backupFileName('2026-10-02'),
      backupFileName('2026-10-01'),
    ]);
    expect(filesToPrune(days, 16)).toEqual([]);
  });

  it('leaves other files alone', () => {
    expect(filesToPrune(['notes.txt', 'strekatron-2026-10-01.dump.partial', ...days], 15)).toEqual([
      backupFileName('2026-10-01'),
    ]);
  });
});

describe('runBackup', () => {
  const dir = join(env.DATA_DIR, 'backups');

  beforeEach(async () => {
    await resetDb();
    await setUpOwner();
  });
  afterEach(() => {
    delete process.env.FAKE_PG_DUMP_FAIL;
  });

  it('writes one backup a day, named by the owner’s day', async () => {
    const first = await runBackup();
    expect(first.status).toBe('created');
    const file = first.file;
    expect(file).toMatch(/strekatron-\d{4}-\d{2}-\d{2}\.dump$/);
    expect(await readFile(file, 'utf8')).toContain('--format=custom');

    const again = await runBackup();
    expect(again).toEqual({ status: 'skipped', file, reason: 'exists' });
    expect((await runBackup({ force: true })).status).toBe('created');
  });

  it('prunes beyond the limit', async () => {
    for (let i = 1; i <= env.BACKUP_KEEP + 2; i++) {
      await writeFile(join(dir, backupFileName(`2020-01-${String(i).padStart(2, '0')}`)), 'old');
    }
    const result = await runBackup({ force: true });
    expect(result.status === 'created' && result.pruned).toHaveLength(3);
    const left = (await readdir(dir)).filter((n) => n.endsWith('.dump'));
    expect(left).toHaveLength(env.BACKUP_KEEP);
  });

  it('fails loudly and leaves no partial file', async () => {
    process.env.FAKE_PG_DUMP_FAIL = '1';
    await expect(runBackup({ force: true })).rejects.toThrow(/connection refused/);
    expect((await readdir(dir)).some((n) => n.endsWith('.partial'))).toBe(false);
  });
});
