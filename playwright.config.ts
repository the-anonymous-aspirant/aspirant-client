import { defineConfig, devices } from '@playwright/test';

/**
 * Locks the 7 fixed Värdeutlåtande surfaces against regression. The desktop
 * project runs Chromium against the production build served by vite preview;
 * the mobile project runs the same spec under iPhone 13 (Mobile Safari) so
 * the mobile CSS branches in ValuationStatement.vue (≤768px) are exercised.
 *
 * Backend calls (/api/commander/*) are mocked per-test via page.route(); no
 * commander or Go server is required to run the suite. A real-commander
 * golden-fixture variant lives in tests/e2e/vardeutlatande.golden.spec.ts
 * and is skipped unless COMMANDER_E2E=1 is set.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Fail the build if a test was left as test.only on a branch.
  forbidOnly: !!process.env.CI,
  // Retry once on CI to absorb a flake on first run; locally a failure is a
  // failure — no retry hiding genuine regressions in dev.
  retries: process.env.CI ? 1 : 0,
  // Single worker keeps the mocked dev server load predictable and download
  // assertions race-free.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
