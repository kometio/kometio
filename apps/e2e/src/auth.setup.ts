import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { environment } from './support/environment';

/**
 * Logs the admin in once, through the API, and keeps the session for every
 * test that does not log in by itself.
 *
 * A session still valid from an earlier run is reused rather than
 * replaced: login is limited to five attempts per account every fifteen
 * minutes (per-account-throttler.guard.ts), and a developer running the
 * suite a few times in a row would otherwise lock the account out of its
 * own editor. CI starts from nothing every time, so it always logs in.
 *
 * The captcha token is a placeholder: the stack runs with Cloudflare's
 * "always passes" test keys wherever this suite runs.
 */
setup('log in as the admin', async ({ playwright }) => {
  const saved = await playwright.request
    .newContext({
      baseURL: environment.apiUrl,
      storageState: environment.storageStatePath,
    })
    .catch(() => null);
  if (saved) {
    const stillValid = (await saved.get('auth/session')).ok();
    await saved.dispose();
    if (stillValid) return;
  }

  const request = await playwright.request.newContext({
    baseURL: environment.apiUrl,
  });
  const response = await request.post('auth/login', {
    data: {
      email: environment.adminEmail,
      password: environment.adminPassword,
      captchaToken: 'e2e',
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await mkdir(dirname(environment.storageStatePath), { recursive: true });
  await request.storageState({ path: environment.storageStatePath });
  await request.dispose();
});
