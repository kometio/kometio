import { CanvasEditor } from './support/canvas-editor';
import { environment } from './support/environment';
import { expect, test } from './support/test';

// This one test logs in through the form itself, so it starts with no
// session; every other test borrows the one auth.setup.ts made.
test.use({ storageState: { cookies: [], origins: [] } });

test('a new page gets a block, its text is edited in the canvas, and it is published to the site', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const headline = `Headline ${uniqueName}`;
  const editor = new CanvasEditor(page, copy);

  // The sign-in form is drawn before there is an account to say a language:
  // it is always English, unlike every screen after it.
  await page.goto('login');
  await page.getByLabel('Email').fill(environment.adminEmail);
  await page.getByLabel('Password').fill(environment.adminPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto('pages');
  await page
    .getByRole('button', { name: copy.t('pages.list.newPage') })
    .click();
  await page
    .getByLabel(copy.t('pages.newPageDialog.nameLabel'))
    .fill(uniqueName);
  await page
    .getByRole('button', {
      name: copy.t('pages.newPageDialog.create'),
      exact: true,
    })
    .click();
  await page.waitForURL(/\/page-groups\/[0-9a-f-]{36}/);
  const groupId = new URL(page.url()).pathname.split('/').pop() ?? '';
  cleanup.add(() => api.deletePage(groupId));

  await editor.waitUntilLoaded();
  await editor.insertBlock(copy.t('blocks.heading.label'));
  await editor.replaceText('Section heading', headline);
  await expect(
    editor.canvas.getByRole('heading', { name: headline }),
  ).toBeVisible();
  await editor.waitUntilSaved();
  await editor.publish();

  const [translation] = await api.pageTranslations(groupId);
  expect(translation.status).toBe('published');
  await page.goto(
    `${environment.publicSiteUrl}${translation.locale}/${translation.slug}`,
  );
  await expect(page.getByRole('heading', { name: headline })).toBeVisible();
});
