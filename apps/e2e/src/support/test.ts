import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { KometioApi } from './kometio-api';
import { Cleanup } from './cleanup';
import { EditorCopy } from './editor-copy';
import { environment } from './environment';
import { Mailpit } from './mailpit';

/**
 * The suite's `test`: Playwright's own, plus the API as the logged-in
 * admin, the editor's words in the language the admin's account has, the
 * mailbox, and a name no other run has used.
 *
 * Locally the suite runs against the developer's own database, so nothing
 * a test creates may collide with real content or outlive the test: every
 * page, form and address carries `uniqueName`, and `cleanup` removes what
 * each test made however the test ends.
 */
export const test = base.extend<{
  api: KometioApi;
  cleanup: Cleanup;
  copy: EditorCopy;
  mailpit: Mailpit;
  uniqueName: string;
}>({
  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      baseURL: environment.apiUrl,
      storageState: environment.storageStatePath,
    });
    await use(new KometioApi(request));
    await request.dispose();
  },
  // Asks for what its steps call only so Playwright tears those down
  // after it, not before.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cleanup: async ({ api, mailpit }, use) => {
    const cleanup = new Cleanup();
    await use(cleanup);
    await cleanup.run();
  },
  copy: async ({ api }, use) => {
    await use(await EditorCopy.load((await api.accountLanguage()) ?? 'en'));
  },
  mailpit: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      baseURL: environment.mailpitUrl,
    });
    await use(new Mailpit(request));
    await request.dispose();
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this destructuring, and this one has none.
  uniqueName: async ({}, use) => {
    await use(`e2e-${randomUUID().slice(0, 8)}`);
  },
});

export { expect };
