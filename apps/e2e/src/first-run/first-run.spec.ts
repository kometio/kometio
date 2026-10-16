import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { requireEnv } from '@kometio/env-config';
import { widgetState } from '../support/captcha';
import { environment } from '../support/environment';
import { KometioApi } from '../support/kometio-api';

/**
 * What a person meets in the first minutes, in a real browser, on an image
 * started the way the quickstart says: no mail server, nothing set up yet.
 *
 * It exists because that is the one path the rest of the suite cannot see.
 * Everything else runs on an installation somebody has already set up, with
 * the mail server the suite gives it, and the first run broke three times in
 * three days with all of that green: the login button stayed disabled for
 * everyone who pulled the image (it was waiting for a captcha key, which
 * the image did not have then), a login cookie
 * left on the host by another installation gave a white page (a 503), and a
 * site that was created without a domain answered "not found". Each was found
 * by walking it by hand.
 *
 * It also invites a person and asks for a password reset, with no mail
 * server: the invitation has to be made and its link given to the administrator
 * on the screen, once, as the way in for the person invited; the reset's link
 * has to be in the installation's log. The invitation's is not there
 * (docker/kometio/check.sh reads the log, for the address in
 * E2E_INVITEE_EMAIL and the administrator's own).
 *
 * And it downloads the site from Settings → Export (docs/adr/0105), which only
 * this image offers: the file has to arrive as a real download through the
 * browser, over plain ports and over HTTPS with the editor and the API on two
 * names, and be an archive.
 *
 * And it sends a form of the public site: the visitor's widget is the one
 * built into Kometio (docs/adr/0103), which asks this site for its challenge,
 * solves it once they start on the form, and the server has to accept the
 * solution it signed.
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

  // What the site starts from is asked once, right after the account (docs/adr/0136).
  // The blog: its home lists the articles by category, which is the starter that
  // needs the most of the site to be working (a section, a category, terms, and
  // the listing blocks that read them). It makes no page called "contact", which
  // the form below does.
  await expect(page).toHaveURL(/\/starter$/);
  await page.getByRole('radio', { name: 'Blog' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/pages/);

  // The site answers at its address at once, with the home page the wizard
  // made and the starter's words on it, and nothing was set by hand.
  const site = await first.request.get(environment.publicSiteUrl);
  expect(site.status()).toBe(200);
  const home = await site.text();
  expect(home).toContain(`<title>${siteName}`);
  expect(home).toContain('Notes, ideas and things learned along the way');
  // The articles are on it: found through their category, not typed in.
  expect(home).toContain('Where a good article starts');

  // Sign in again, in a clean browser, through the form: the captcha has to
  // give the button its token. It is the captcha built into Kometio
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
  // 500 after the person was already made; then it wrote the link to the log,
  // for whoever ran the server to find. Now the invitation is made and the
  // editor gives the link to the administrator who made it (docs/adr/0128).
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
  const issued = login.getByRole('dialog', {
    name: `Invitation for ${invitee}`,
  });
  await expect(issued).toBeVisible();
  const inviteLink = await issued.getByLabel('Invitation link').inputValue();
  expect(inviteLink).toContain(
    `${environment.editorUrl}accept-invite?inviteToken=`,
  );
  await issued.getByRole('button', { name: 'Done' }).click();

  // The link is the way in: the person it was passed to chooses a password with
  // it, in a browser that has never seen the editor.
  const invited = await browser.newContext(trust);
  const joining = await invited.newPage();
  await joining.goto(inviteLink);
  await joining
    .getByLabel('Password')
    .fill('a-long-passphrase-for-the-invitee');
  await joining.getByRole('button', { name: 'Complete registration' }).click();
  await expect(
    joining.getByText('Password set. You can log in now.'),
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

  // A form on the site, sent by a visitor.
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

  // A site that moves (docs/adr/0141). On the docs theme, whose manifest
  // asks for page transitions and whose tokens ask for a reveal: this is the
  // one place it runs against the built public site behind its strict CSP,
  // which is where an inlined script or a rejected style would show — as it
  // did once for the entrance (docs/adr/0060), when every unit test passed.
  await api.setThemePackage(formSite.id, 'docs-showcase');
  const homeUrl = `${environment.publicSiteUrl}${formSite.defaultLocale}/`;
  const sampleTitle = async (reducedMotion: 'reduce' | 'no-preference') => {
    const context = await browser.newContext({ ...trust, reducedMotion });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const seen: number[] = [];
      Object.assign(window, { seenOpacity: seen });
      const tick = () => {
        const title = document.querySelector('.kometio-docs-hero__title');
        if (title) seen.push(Number(getComputedStyle(title).opacity));
        if (seen.length < 120) requestAnimationFrame(tick);
      };
      document.addEventListener('DOMContentLoaded', () =>
        requestAnimationFrame(tick),
      );
    });
    await page.goto(homeUrl);
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => {
      const title = document.querySelector('.kometio-docs-hero__title');
      const seenOpacity: unknown = Reflect.get(window, 'seenOpacity');
      return {
        animation: title ? getComputedStyle(title).animationName : null,
        opacity: title ? Number(getComputedStyle(title).opacity) : null,
        seen: Array.isArray(seenOpacity) ? seenOpacity : [],
        ready: document.documentElement.classList.contains(
          'kometio-motion-ready',
        ),
      };
    });
    await context.close();
    return result;
  };

  const moving = await sampleTitle('no-preference');
  expect(moving.ready).toBe(true);
  expect(moving.animation).toBe('kometio-slide-up');
  // It was caught on its way in, and it arrived.
  expect(Math.min(...moving.seen)).toBeLessThan(1);
  expect(moving.opacity).toBe(1);

  const still = await sampleTitle('reduce');
  expect(still.ready).toBe(false);
  expect(still.animation).toBe('none');
  expect(still.opacity).toBe(1);
  expect(Math.min(...still.seen)).toBe(1);

  // Going to another page is a view transition, not a cut.
  const walker = await browser.newContext(trust);
  const walking = await walker.newPage();
  await walking.goto(homeUrl);
  await walking.evaluate(() => {
    window.addEventListener('pageswap', (event) => {
      sessionStorage.setItem(
        'kometio-swap',
        Reflect.get(event, 'viewTransition') ? 'view-transition' : 'cut',
      );
    });
  });
  await walking.locator('main a[href]').first().click();
  await walking.waitForLoadState('load');
  expect(
    await walking.evaluate(() => sessionStorage.getItem('kometio-swap')),
  ).toBe('view-transition');
  await walker.close();

  await first.close();
  await second.close();
  await third.close();
  await visitor.close();
});
