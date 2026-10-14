import { expect, test } from './support/test';

/**
 * The history of the Import screen: an attempt that a person is done with is
 * taken away from it, after being asked. What a WordPress export would have
 * made of a site is read and kept there, and without this the list only ever
 * grew.
 */

const exportNamed = (title: string) => `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title><![CDATA[${title}]]></title><wp:base_blog_url>https://old.example</wp:base_blog_url>
<item>
  <title><![CDATA[Hello]]></title><link>https://old.example/hello/</link>
  <content:encoded><![CDATA[<p>Hello</p>]]></content:encoded>
  <wp:post_id>1</wp:post_id><wp:post_name><![CDATA[hello]]></wp:post_name>
  <wp:post_type><![CDATA[post]]></wp:post_type><wp:status><![CDATA[publish]]></wp:status>
</item>
</channel></rss>`;

test('an earlier attempt is deleted from the history, once confirmed', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const keptName = `kept-${uniqueName}.xml`;
  const goneName = `gone-${uniqueName}.xml`;
  // Made in this order, so that the second is the newest and is the one the
  // screen shows on arrival: the first is in the history.
  const gone = await api.analyseWordPressExport(
    site.id,
    goneName,
    exportNamed('Old'),
  );
  const kept = await api.analyseWordPressExport(
    site.id,
    keptName,
    exportNamed('New'),
  );
  for (const id of [gone, kept]) {
    cleanup.add(async () => {
      // Already gone when the test did what it was for.
      await api.deleteImportJob(id).catch(() => undefined);
    });
  }

  await page.goto('imports');
  await expect(page.getByRole('heading', { name: keptName })).toBeVisible();
  const row = page.getByRole('button', { name: new RegExp(`^${goneName}`) });
  await expect(row).toBeVisible();

  await page
    .getByRole('button', {
      name: copy.t('imports.delete.label', { name: goneName }),
    })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(
    dialog.getByText(copy.t('imports.delete.description')),
  ).toBeVisible();
  await dialog.getByRole('button', { name: copy.t('common.delete') }).click();

  await expect(row).toHaveCount(0);
  // Not only hidden: a new visit does not find it, and the other is left.
  await page.reload();
  await expect(page.getByRole('heading', { name: keptName })).toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${goneName}`) }),
  ).toHaveCount(0);
});
