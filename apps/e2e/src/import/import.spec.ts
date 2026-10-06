import { expect, test } from '@playwright/test';
import { requireEnv } from '@kometio/env-config';
import { environment } from '../support/environment';

/**
 * A site from another installation, opened on the first-run screen of a new one
 * (docs/adr/0106), in a real browser.
 *
 * What it proves is what a unit cannot: that the upload reaches the API with the
 * token in a header, that the screen survives the server going away and coming
 * back (the API that took the file is stopped to open it, the page keeps asking
 * until it answers), and that the account that was in the archive signs in to the
 * site that was in it, with its files. The archive is the one the main
 * installation of docker/kometio/check.sh exported through Settings → Export.
 *
 * It spends the installation (a token, and the one setup it allows), so it runs
 * once, on its own, and never retries.
 */
test('a site from another installation is opened on the first-run screen, and its account signs in', async ({
  browser,
  playwright,
}) => {
  const archivePath = requireEnv('E2E_ARCHIVE');
  const siteName = requireEnv('E2E_SITE_NAME');
  const uploadedPath = requireEnv('E2E_UPLOADED_PATH');

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(environment.editorUrl);
  await expect(page).toHaveURL(/\/setup$/, { timeout: 10_000 });

  // The wizard offers it, since this server can open an archive.
  await page
    .getByRole('button', {
      name: 'I already have a site from another installation',
    })
    .click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Open a site from another installation',
    }),
  ).toBeVisible();

  // A token that is not the one in the log is refused, and nothing is touched:
  // the person can read the log again and go on from this very page.
  await page.getByLabel('Setup token').fill('not-the-token-in-the-log');
  await page.getByLabel('Site archive').setInputFiles(archivePath);
  await page.getByRole('button', { name: 'Open the site' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'That setup token is not valid',
  );

  // The right one, and the same archive: the page says the server is away and
  // waits, and when it is back there is a site, which is the login.
  await page.getByLabel('Setup token').fill(requireEnv('E2E_SETUP_TOKEN'));
  await page.getByRole('button', { name: 'Open the site' }).click();
  await expect(page.getByText('The server is opening the site')).toBeVisible();
  await expect(page).toHaveURL(/\/login/, { timeout: 180_000 });
  await expect(
    page.getByText('The site is here. Sign in with the account you had'),
  ).toBeVisible();

  // The account that was in the archive, with its password, through the form
  // (the captcha built into Kometio: this installation has no keys of its own).
  const logIn = page.getByRole('button', { name: 'Log in' });
  await expect(logIn).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Email').fill(environment.adminEmail);
  await page.getByLabel('Password').fill(environment.adminPassword);
  await logIn.click();
  await expect(page).toHaveURL(/\/pages/);

  // The site that was in the archive, at the address this installation is
  // reached at, and a file that was uploaded to it. The API is back a moment
  // before the site is (the launcher starts the one, then the other), and a
  // login does not wait for the site: so the site is waited for, not asked once.
  const visitor = await playwright.request.newContext();
  await expect
    .poll(
      // A site that is not listening yet is a refused connection, not a status.
      () =>
        visitor.get(environment.publicSiteUrl).then(
          (response) => response.status(),
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(200);
  const site = await visitor.get(environment.publicSiteUrl);
  expect(await site.text()).toContain(`<title>${siteName}`);
  const file = await visitor.get(
    new URL(uploadedPath.replace(/^\//, ''), environment.apiUrl).href,
  );
  expect(file.status()).toBe(200);
});
