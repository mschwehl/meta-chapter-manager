const { defineConfig } = require('@playwright/test');

const port = process.env.MCM_TEST_PORT || '3301';
const baseURL = process.env.MCM_TEST_BASE_URL || `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: /tests[\\/]api[\\/].*\.spec\.js$/,
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'gui',
      testMatch: /tests[\\/]gui[\\/].*\.spec\.js$/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'node tests/scripts/start-test-server.js',
    url: `${baseURL}/api/status`,
    timeout: 180000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      MCM_TEST_PORT: port,
      MCM_TEST_BASE_URL: baseURL,
      MCM_TEST_GIT_REMOTE: process.env.MCM_TEST_GIT_REMOTE || 'http://localhost:8080/git/root/meta-data.git',
      MCM_TEST_GIT_USER: process.env.MCM_TEST_GIT_USER || 'root',
      MCM_TEST_GIT_PASSWORD: process.env.MCM_TEST_GIT_PASSWORD || 'root',
      MCM_TEST_GIT_BRANCH: process.env.MCM_TEST_GIT_BRANCH || 'test-suite',
      MCM_TEST_SYNC_STRATEGY: process.env.MCM_TEST_SYNC_STRATEGY || 'action-based',
    },
  },
});
