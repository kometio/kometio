import { expect, test } from '@playwright/test';
import { requireEnv } from '@kometio/env-config';
import { environment } from '../support/environment';

/**
 * What a person meets in the first minutes, in a real browser, on an image
 * started the way the quickstart says: no captcha key of its own, no mail
 * server, nothing set up yet.
 *
 * It exists because that is the one path the rest of the suite cannot see.
 * Everything else runs on an installation somebody has already set up, with
 * the captcha key and the mail server the suite gives it, and the first run
 * broke three times in three days with all of that green: the login button
 * stayed disabled for everyone who pulled the image (no key), a login cookie
 * left on the host by another installation gave a white page (a 503), and a
 * site that was created without a domain answered "not found". Each was found
 * by walking it by hand.
 *
 * It also invites a person, with no mail server: the invitation has to be
 * made, the editor has to say that no email went out, and the link has to be
 * in the installation's log (docker/kometio/check.sh reads it there, for the
 * address in E2E_INVITEE_EMAIL).
 *
 * It spends the installation: the setup token is single-use and the account is
 * made here, so it runs once, on its own installation, and never retries.
 */
test('a person who starts the image reaches a working site, and can sign in again', async ({
  browser,
}) => {
  const siteName = 'First Run Site';
  const siteHost = new URL(environment.publicSiteUrl).hostname;

  // A login left on this host by another installation: cookies do not tell
  // ports apart, so a developer who has used Kometio before has one. It used
  // to reach an installation with no account yet, answer 503, and leave a
  // white page for seven seconds and then a dead end.
  const first = await browser.newContext();
  await first.addCookies([
    {
      name: 'kometio_session',
      value: 'left-over-from-another-installation',
      url: environment.editorUrl,
    },
  ]);
  const page = await first.newPage();
  await page.goto(environment.editorUrl);
  await expect(page).toHaveURL(/\/setup$/, { timeout: 10_000 });

  // The setup form is drawn before there is an account to say a language, so
  // it is English. The domain arrives filled in: the host of the address the
  // image was told to serve the site on.
  await expect(page.getByLabel('Domain')).toHaveValue(siteHost);
  await page.getByLabel('Setup token').fill(requireEnv('E2E_SETUP_TOKEN'));
  await page.getByLabel('Site name').fill(siteName);
  await page.getByLabel('Your email').fill(environment.adminEmail);
  await page
    .getByLabel('Password', { exact: true })
    .fill(environment.adminPassword);
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page).toHaveURL(/\/pages/);

  // The site answers at its address at once, with the home page the wizard
  // made, and nothing was set by hand.
  const site = await first.request.get(environment.publicSiteUrl);
  expect(site.status()).toBe(200);
  expect(await site.text()).toContain(`<title>${siteName}`);

  // Sign in again, in a clean browser, through the form: the captcha has to
  // give the button its token with the key the image has when nobody gave it
  // one. With an empty key the widget refused it and the button stayed
  // disabled for ever, for everyone who pulled the image.
  const second = await browser.newContext();
  const login = await second.newPage();
  await login.goto(`${environment.editorUrl}login`);
  const logIn = login.getByRole('button', { name: 'Log in' });
  await expect(logIn).toBeEnabled({ timeout: 30_000 });
  await login.getByLabel('Email').fill(environment.adminEmail);
  await login.getByLabel('Password').fill(environment.adminPassword);
  await logIn.click();
  await expect(login).toHaveURL(/\/pages/);

  // Invite somebody, on an installation with no mail server. It used to answer
  // 500 after the person was already made; now the invitation is made, and the
  // editor says that nothing was mailed instead of "they will get an email".
  const invitee = requireEnv('E2E_INVITEE_EMAIL');
  await login.goto(`${environment.editorUrl}users`);
  await expect(
    login.getByRole('heading', { name: 'Users', exact: true }),
  ).toBeVisible();
  await expect(
    login.getByText('This installation cannot send email'),
  ).toBeVisible();
  await login.getByRole('button', { name: 'Invite user' }).click();
  const dialog = login.getByRole('dialog');
  await expect(
    dialog.getByText('This installation cannot send email'),
  ).toBeVisible();
  await dialog.getByLabel('Email').fill(invitee);
  await dialog.getByLabel('Name').fill('New Colleague');
  await dialog.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(
    login.getByText(`${invitee} is invited, but no email was sent`),
  ).toBeVisible();

  await first.close();
  await second.close();
});
