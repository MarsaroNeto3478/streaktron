import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineProject } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://strekatron:strekatron@localhost:5432/strekatron_test';

export default defineProject({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // One database for all files: run them one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      TEST_DATABASE_URL,
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-00',
      APP_ORIGINS: 'http://localhost:3001',
      DATA_DIR: mkdtempSync(join(tmpdir(), 'strekatron-test-')),
      PG_DUMP: `sh ${join(import.meta.dirname, 'test/fixtures/fake-pg-dump.sh')}`,
      JOBS_ENABLED: 'false',
    },
  },
});
