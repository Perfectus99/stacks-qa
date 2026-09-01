import { defineConfig } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,

  // A test that only passes on a retry is flaky, not passing. Retries exist in
  // CI so one bad run doesn't block a merge — the retry is still reported.
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : undefined,

  // Nothing may be committed with .only.
  forbidOnly: isCI,

  // The HTML report is for debugging a failure; the summary is for reading what
  // the suite covers and whether it is healthy. Different questions, so both.
  reporter: isCI
    ? [['html', { open: 'never' }], ['./reporters/summary.ts'], ['github'], ['list']]
    : [['html', { open: 'never' }], ['./reporters/summary.ts'], ['list']],

  use: {
    trace: 'retain-on-failure',
  },
})
