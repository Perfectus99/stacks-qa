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

  reporter: isCI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    trace: 'retain-on-failure',
  },
})
