import { CanvasEditor } from './support/canvas-editor';
import { environment } from './support/environment';
import { expect, test } from './support/test';
import type { Block } from './support/wire-schemas';

test('publishing a page with a block the site would leave out asks first, names it, and publishes when it is answered', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const kept = `Kept ${uniqueName}`;
  const left = `Left out ${uniqueName}`;
  // A heading level the site does not know. The API takes props as they come,
  // so a page written by a script or an import can hold it; the site skips the
  // block, alone, and the page is served without it (docs/adr/0124).
  const content: Block[] = [
    {
      id: `${uniqueName}-kept`,
      type: 'Heading',
      props: { text: kept, level: 'h2' },
    },
    {
      id: `${uniqueName}-left`,
      type: 'Heading',
      props: { text: left, level: 'h9' },
    },
  ];
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content,
  });
  cleanup.add(() => api.deletePage(group.id));

  await page.goto(`page-groups/${group.id}`);
  await new CanvasEditor(page, copy).waitUntilLoaded();
  await page
    .getByRole('button', { name: copy.t('canvas.publish'), exact: true })
    .click();

  // Asked, and nothing is online yet.
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(copy.t('canvas.publishSkipped.title')),
  ).toBeVisible();
  // The block by the name it is picked by, and the prop by the label it has in
  // the inspector: what to look for on the canvas.
  await expect(dialog).toContainText(copy.t('blocks.heading.label'));
  const [before] = await api.pageTranslations(group.id);
  expect(before.status).not.toBe('published');

  await dialog
    .getByRole('button', { name: copy.t('canvas.publishSkipped.action') })
    .click();
  await expect(
    page.getByText(copy.t('pages.editor.published'), { exact: true }),
  ).toBeVisible();

  const [after] = await api.pageTranslations(group.id);
  expect(after.status).toBe('published');
  // What the question said: the page is served, and the block is not on it.
  await page.goto(`${environment.publicSiteUrl}${after.locale}/${after.slug}`);
  await expect(page.getByRole('heading', { name: kept })).toBeVisible();
  await expect(page.getByText(left)).toHaveCount(0);
});

test('publishing a page whose blocks all pass asks nothing', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content: [
      {
        id: `${uniqueName}-ok`,
        type: 'Heading',
        props: { text: `Fine ${uniqueName}`, level: 'h2' },
      },
    ],
  });
  cleanup.add(() => api.deletePage(group.id));

  await page.goto(`page-groups/${group.id}`);
  const editor = new CanvasEditor(page, copy);
  await editor.waitUntilLoaded();

  await editor.publish();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
