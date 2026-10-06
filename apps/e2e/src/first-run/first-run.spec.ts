import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test, type Locator } from '@playwright/test';
import { requireEnv } from '@kometio/env-config';
import { environment } from '../support/environment';
import { KometioApi } from '../support/kometio-api';

/** What the built-in captcha widget says it is doing: `unverified` until the visitor starts, then `verifying`, then `verified`. */
function widgetState(widget: Locator): Promise<unknown> {
  return widget.evaluate((element) =>
    'getState' in element && typeof element.getState === 'function'
      ? element.getState()
      : null,
  );
}

/**
 * What a person meets in the first minutes, in a real browser, on an image
 * started the way the quickstart says: no captcha keys of its own, no mail
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
 * It also invites a person and asks for a password reset, with no mail
 * server: the invitation has to be made, the editor has to say that no email
 * went out, and the link of each has to be in the installation's log
 * (docker/kometio/check.sh reads them there, for the address in
 * E2E_INVITEE_EMAIL and the administrator's own).
 *
 * And it downloads the site from Settings → Export (docs/adr/0105), which only
 * this image offers: the file has to arrive as a real download through the
 * browser, over plain ports and over HTTPS with the editor and the API on two
 * names, and be an archive.
 *
 * And it sends a form of the public site with no captcha keys: the visitor's
 * widget is the one built into Kometio (docs/adr/0103), which asks this site for
 * its challenge, solves it once they start on the form, and the server has to
 * accept the solution it signed.
 *
 * It spends the installation: the setup token is single-use and the account is
 * made here, so it runs once, on its own installation, and never retries.
 */
test('a person who starts the image reaches a working site, and can sign in again', async ({
  browser,
  playwright,
}) => {
  const siteName = 'First Run Site';
  // On a server with a name the addresses are HTTPS, and on the machine this runs
  // on the certificate is Caddy's own authority's, which nothing here trusts: it
  // is a throwaway installation made by this suite, so it is accepted. Never for
  // an address that is not https, where there is no certificate to accept.
  const secure = environment.editorUrl.startsWith('https://');
  const trust = { ignoreHTTPSErrors: secure };
  const siteHost = new URL(environment.publicSiteUrl).hostname;

  // A login left on this host by another installation: cookies do not tell
  // ports apart, so a developer who has used Kometio before has one. It used
  // to reach an installation with no account yet, answer 503, and leave a
  // white page for seven seconds and then a dead end.
  const first = await browser.newContext(trust);
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
  // give the button its token when nobody gave the image a key. With an empty
  // one the widget refused it and the button stayed disabled for ever, for
  // everyone who pulled the image. It is now the captcha built into Kometio
  // (docs/adr/0103): a challenge from the API, solved in the page, with nothing
  // fetched from anywhere else, so the whole thing runs with no network.
  // What it submits is checked by the server, which is the point of the next
  // lines: the login has to be accepted, not only enabled.
  const second = await browser.newContext(trust);
  const login = await second.newPage();
  await login.goto(`${environment.editorUrl}login`);
  const logIn = login.getByRole('button', { name: 'Log in' });
  await expect(logIn).toBeEnabled({ timeout: 30_000 });
  await login.getByLabel('Email').fill(environment.adminEmail);
  await login.getByLabel('Password').fill(environment.adminPassword);
  await logIn.click();
  await expect(login).toHaveURL(/\/pages/);
  // Behind HTTPS the session cookie is `Secure`: a browser keeps it off any
  // plain connection. (A trial is plain HTTP and its cookie is not.)
  const session = (await second.cookies()).find(
    (cookie) => cookie.name === 'kometio_session',
  );
  expect(session?.secure).toBe(secure);

  // The whole site in one file, from Settings → Export: offered because this is
  // the single image, and downloaded by the browser itself (a link, so that a
  // large archive goes to disk as it arrives). The session cookie has to go with
  // it from the editor's name to the API's, which on a server are two.
  await login.goto(`${environment.editorUrl}settings`);
  await login.getByRole('link', { name: 'Export', exact: true }).click();
  await expect(
    login.getByRole('heading', { name: 'Export', level: 2 }),
  ).toBeVisible();
  const downloading = login.waitForEvent('download');
  await login.getByRole('link', { name: 'Download the site' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^kometio-site-\d{8}-\d{4}\.tar\.gz$/,
  );
  // What was saved is the archive and it is whole: a gzip of a tar that holds
  // its manifest, the database, and (here, nothing was uploaded) the uploads.
  expect(await download.failure()).toBeNull();
  const tarball = gunzipSync(readFileSync(await download.path()));
  expect(tarball.includes('manifest.json')).toBe(true);
  expect(tarball.includes('database.sql.gz')).toBe(true);

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

  // Forgot the password, before there is a session: told that no email will
  // come before asking, and after asking, the same whatever the address.
  const third = await browser.newContext(trust);
  const forgot = await third.newPage();
  await forgot.goto(`${environment.editorUrl}login`);
  await forgot.getByText('Forgot your password?').click();
  await expect(
    forgot.getByText('This installation cannot send email'),
  ).toBeVisible();
  await forgot.getByLabel('Email').fill(environment.adminEmail);
  const sendLink = forgot.getByRole('button', { name: 'Send reset link' });
  await expect(sendLink).toBeEnabled({ timeout: 30_000 });
  await sendLink.click();
  await expect(forgot.getByText(/it is in the server's log/)).toBeVisible();

  // A form on the site, sent by a visitor, with no captcha keys anywhere.
  const api = new KometioApi(
    await playwright.request.newContext({
      ...trust,
      baseURL: environment.apiUrl,
      storageState: await first.storageState(),
    }),
  );
  const formSite = await api.currentSite();
  const form = await api.createForm(formSite.id, 'First run form');
  await api.updateForm(form.id, {
    name: 'First run form',
    notificationEmails: [],
    fields: [{ id: 'message', label: 'Message', type: 'text', required: true }],
  });
  const { translation } = await api.createPage({
    siteId: formSite.id,
    locale: formSite.defaultLocale,
    slug: 'contact',
    title: 'Contact',
    content: [
      {
        type: 'Form',
        props: { form: { formId: form.id, formName: 'First run form' } },
      },
    ],
  });
  await api.publishTranslation(translation.id);

  const visitor = await browser.newContext(trust);
  const contact = await visitor.newPage();
  await contact.goto(
    `${environment.publicSiteUrl}${formSite.defaultLocale}/contact`,
  );
  const widget = contact.locator('.kometio-form altcha-widget');
  await expect(widget).toBeAttached();
  // Nothing is asked of the server for a visitor who only reads the page: the
  // challenge is fetched when they start on the form.
  expect(await widgetState(widget)).toBe('unverified');
  await contact.getByLabel('Message').fill('Hello from a visitor');
  await expect
    .poll(() => widgetState(widget), { timeout: 30_000 })
    .toBe('verified');
  await contact.locator('.kometio-form button[type="submit"]').click();
  await expect(contact.getByRole('status')).toBeVisible();
  await expect
    .poll(async () => (await api.formSubmissions(form.id)).length)
    .toBe(1);

  await first.close();
  await second.close();
  await third.close();
  await visitor.close();
});
