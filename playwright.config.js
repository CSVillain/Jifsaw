import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  webServer: {
    command: 'python -m http.server 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
      grep: /(source and difficulty stages|theme carousel arrows|switching back to a theme|category selection stays|search form submits|loading is announced|search request failures|blank search|source controls stay)/,
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
});
