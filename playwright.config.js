// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'npx serve -s .',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  testDir: './tests',
    navigationTimeout: 10000,
    actionTimeout: 5000,
});
