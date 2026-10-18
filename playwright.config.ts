import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: 'production.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
