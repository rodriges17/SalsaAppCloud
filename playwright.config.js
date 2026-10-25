import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './web-tests', testMatch: '**/*.spec.js', timeout: 60000, expect: { timeout: 12000 },
  // Each test owns an isolated browser context; OPFS and output paths are test-scoped.
  fullyParallel: true, workers: 2, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'on-first-retry' },
  projects: [
    { name: 'chromium-mobile', use: { browserName: 'chromium', channel: 'chrome', ...devices['Pixel 7'] } },
    { name: 'webkit-iphone', use: { browserName: 'webkit', ...devices['iPhone 13'] } }
  ],
  webServer: { command: 'python3 -u web-tests/server.py', url: 'http://127.0.0.1:4173/pwa/', reuseExistingServer: false, timeout: 120000, stdout: 'pipe', stderr: 'pipe' }
});
