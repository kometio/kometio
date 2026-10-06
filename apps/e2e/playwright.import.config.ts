import { defineConfig, devices } from '@playwright/test';
import { environment } from './src/support/environment';

const inCi = Boolean(process.env.CI);

/**
 * The first run again, with a site from another installation instead of a new
 * one (docs/adr/0106, docker/kometio/check.sh): an archive is opened on the
 * first-run screen, and the account that was in it signs in. Its own
 * configuration for the same reason as playwright.first-run.config.ts, and
 * because it cannot run in the same installation: an installation is set up
 * once, by one or the other.
 *
 * No `webServer` and no retry, for the reasons given there: the image is
 * already running, and what the test spends (the installation, which stops being
 * new) is not given back by a second attempt.
 */
export default defineConfig({
  testDir: './src/import',
  outputDir: '../../dist/e2e/import-results',
  workers: 1,
  retries: 0,
  forbidOnly: inCi,
  reporter: inCi
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: '../../dist/e2e/import' }],
      ]
    : [['list']],
  use: {
    baseURL: environment.editorUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'import',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
