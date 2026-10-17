import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: 'production.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3105',
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'NODE_ENV=production PORT=3105 npm start',
    url: 'http://127.0.0.1:3105/api/ready',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
