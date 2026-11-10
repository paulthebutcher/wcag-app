import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'npm run start -w @wcag/server',
      url: 'http://127.0.0.1:4312/api/session',
      env: {
        PORT: '4312',
        ENGINE_MODE: 'fixture',
        APP_DATA_DIR: mkdtempSync(join(tmpdir(), 'wcag-ui-e2e-')),
        WEB_ORIGIN: 'http://127.0.0.1:5174',
        FIXTURE_DURATION_MS: '300',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w @wcag/web',
      url: 'http://127.0.0.1:5174',
      env: { WEB_PORT: '5174', API_URL: 'http://127.0.0.1:4312' },
      reuseExistingServer: false,
    },
  ],
});
