// Browser tests for the key flows (plan.md Phase 6, D54). `pnpm test:e2e` builds the web app, starts
// a server on a fresh `strekatron_e2e` database (apps/server/test/e2e-server.ts) and runs these in
// the Edge or Chrome already installed (no browser download). One account, so one worker, in order:
// `setup` creates the owner, the rest sign in as them.

import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const OWNER_STATE = join(import.meta.dirname, '.auth/owner.json');

const PORT = 3201;
const channel = process.env.E2E_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  outputDir: '../data/e2e-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel,
    timezoneId: 'America/Sao_Paulo',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: 'setup.e2e.ts' },
    {
      name: 'desktop',
      testIgnore: ['setup.e2e.ts', 'phone.e2e.ts'],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], channel, storageState: OWNER_STATE },
    },
    {
      name: 'phone',
      testMatch: 'phone.e2e.ts',
      dependencies: ['desktop'],
      use: { ...devices['Pixel 7'], channel, storageState: OWNER_STATE },
    },
  ],
  webServer: {
    command: 'npx tsx apps/server/test/e2e-server.ts',
    cwd: '..',
    url: `http://localhost:${PORT}/api/setup`,
    env: { E2E_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
