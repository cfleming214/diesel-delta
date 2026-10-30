import { defineConfig, devices } from '@playwright/test';

// Journeys run against the exported web build (npm run e2e:build) talking to the mock backend.
const MOCK_PORT = 54331;
const WEB_PORT = 8091;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // The app's design frame (iPhone 16 Pro logical size).
    viewport: { width: 402, height: 874 },
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run -s mock:server',
      url: `http://localhost:${MOCK_PORT}/health`,
      env: { MOCK_PORT: String(MOCK_PORT), MOCK_LATENCY_MS: '0', MOCK_JITTER_MS: '0' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node e2e/serve.mjs dist-e2e',
      url: `http://localhost:${WEB_PORT}`,
      env: { E2E_WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: !process.env.CI,
    },
  ],
});

export const E2E_MOCK_URL = `http://localhost:${MOCK_PORT}`;
