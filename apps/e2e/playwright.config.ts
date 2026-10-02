import { defineConfig, devices } from '@playwright/test';
import { environment } from './src/support/environment';

const inCi = Boolean(process.env.CI);

/**
 * The three apps, as built. Locally whatever is already listening on
 * these addresses is used as it is (a developer's running stack); in CI
 * nothing is, and Playwright starts each one from its build and waits for
 * it to answer. See docs/development.md, "End-to-end tests".
 */
const webServer = [
  {
    name: 'api',
    command: 'node apps/api/dist/main.js',
    cwd: '../..',
    url: `${environment.apiUrl}health`,
  },
  {
    name: 'editor',
    command: `pnpm exec vite preview --strictPort --port ${new URL(environment.editorUrl).port}`,
    cwd: '../editor-app',
    url: environment.editorUrl,
  },
  {
    name: 'public site',
    command: 'node server.mjs',
    cwd: '../public-site',
    // Not `/`: Playwright follows its redirect to the default language's
    // home page, which a freshly seeded site does not have — a 404, and a
    // server Playwright waits on until it gives up. robots.txt answers as
    // soon as the site can reach the API, whatever the site holds.
    url: `${environment.publicSiteUrl}robots.txt`,
    env: { PUBLIC_SITE_PORT: new URL(environment.publicSiteUrl).port },
  },
].map((server) => ({
  ...server,
  reuseExistingServer: !inCi,
  timeout: 120_000,
}));

export default defineConfig({
  testDir: './src',
  // Outside this project, in the repository's ignored `dist/`: a report
  // under apps/e2e is a folder of bundled JavaScript that ESLint then
  // lints, and a local run broke the pre-push hook until it was deleted.
  outputDir: '../../dist/e2e/results',
  // One at a time in CI: the runner is small, and the API, the database and
  // three servers share it with the browser. Locally, as many as fit.
  workers: inCi ? 1 : undefined,
  // A retry that passes is still reported as flaky, so it cannot hide.
  retries: inCi ? 1 : 0,
  forbidOnly: inCi,
  reporter: inCi
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: '../../dist/e2e/report' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: '../../dist/e2e/report' }],
      ],
  use: {
    baseURL: environment.editorUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      testMatch: /\.e2e\.ts$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: environment.storageStatePath,
      },
    },
  ],
  webServer,
});
