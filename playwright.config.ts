import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// End-to-end tests (spec 8) against `astro preview` of a fresh build, with
// /api/* mocked per test (the Worker is not running). Chromium only.
//
// @playwright/test is pinned to the release whose Chromium build is the one
// installed on the development machine (revision 1234); `pnpm exec playwright
// install chromium` fetches it elsewhere (CI).
//
// The development machine keeps missing shared libraries (libasound) in
// ~/.local/lib: the browser and the server get it on LD_LIBRARY_PATH.

const PORT = 4323;
const HOST = '127.0.0.1';
const localLib = join(homedir(), '.local/lib');
const ldLibraryPath = [existsSync(localLib) ? localLib : '', process.env.LD_LIBRARY_PATH ?? '']
  .filter(Boolean)
  .join(':');
if (ldLibraryPath) process.env.LD_LIBRARY_PATH = ldLibraryPath;
const env = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
);

// --ignore-lock: astro preview keeps one server per project by default, and a
// developer preview may already be running.
const preview = `pnpm exec astro preview --host ${HOST} --port ${PORT} --ignore-lock`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // The development machine has 128 cores: unbounded workers overload the
  // preview server and the slow mobile checkout tests time out. CI keeps the default.
  workers: process.env.CI ? undefined : 16,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { env },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // E2E_SKIP_BUILD=1 reuses dist/ from a previous `pnpm build`.
    command: process.env.E2E_SKIP_BUILD ? preview : `pnpm build && ${preview}`,
    url: `http://${HOST}:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { ...env, LD_LIBRARY_PATH: ldLibraryPath },
  },
});
