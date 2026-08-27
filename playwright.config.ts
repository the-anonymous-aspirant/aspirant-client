import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Per-worktree preview port (#4335). Concurrent aspirant-client e2e runs come
 * from sibling git worktrees (/home/aspirant/aspirant-client-<task_id>). A
 * single shared `:4173 --strictPort` + `reuseExistingServer` meant a second
 * concurrent run either bind-collided or silently REUSED another worktree's
 * preview and asserted against *its* build — and that shared server vanished
 * when the owning worktree rebuilt or finished, surfacing as a burst of
 * `Connection refused` / cross-asserted failures (not the diff under test).
 * Deriving the port from this worktree's own directory name gives every
 * concurrent run its own isolated preview. The bare main checkout
 * ("aspirant-client") and CI keep 4173 for continuity; `E2E_PORT` overrides.
 *
 * Isolation invariant: distinct worktree dir ⇒ distinct name ⇒ distinct port,
 * so no two concurrent worktree runs share a preview server.
 */
function previewPort(): number {
  const override = process.env.E2E_PORT;
  if (override) return Number(override);
  const name = path.basename(process.cwd());
  if (name === 'aspirant-client') return 4173;
  // Stable hash of the worktree name into 4174–5173 (1000 slots, disjoint from
  // main's 4173).
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 4174 + (h % 1000);
}

const PREVIEW_PORT = previewPort();
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

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
    baseURL: PREVIEW_URL,
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
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
