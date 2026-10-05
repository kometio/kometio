import { defineConfig, devices } from '@playwright/test';
import { environment } from './src/support/environment';

const inCi = Boolean(process.env.CI);

/**
 * The first run, on an installation nobody has set up yet (docs/adr/0101,
 * docker/kometio/check.sh). Its own configuration because it cannot be a
 * project of the main one: those start by logging in as an admin, which does
 * not exist yet, and this test is what makes it.
 *
 * No `webServer`, like playwright.image.config.ts: the image is already
 * running, and a server that is down fails the run rather than being started
 * from a build against whatever database the root .env names. No retry: the
 * setup token is single-use, so a second attempt would only fail differently.
 */
export default defineConfig({
  testDir: './src/first-run',
  outputDir: '../../dist/e2e/first-run-results',
  workers: 1,
  retries: 0,
  forbidOnly: inCi,
  reporter: inCi
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: '../../dist/e2e/first-run' }],
      ]
    : [['list']],
  use: {
    baseURL: environment.editorUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'first-run',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
