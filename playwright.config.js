import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  webServer: {
    command: 'python -m http.server 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
});
