import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3457',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  globalSetup: './fixtures.ts',
  globalTeardown: './fixtures.ts',
  webServer: [
    {
      command: `cd ${JSON.stringify(PROJECT_ROOT)} && cd packages/proxy && npx tsx src/index.ts`,
      url: 'http://localhost:3456/health',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `cd ${JSON.stringify(PROJECT_ROOT)} && npm run dev --workspace=apps/web`,
      url: 'http://localhost:3457',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
