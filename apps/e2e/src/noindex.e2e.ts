import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * A page that asks to stay out of search engines (docs/adr/0134), asked
 * through the editor the way a person asks and then read from the public
 * site with no session — which is who it is for: the page says so, the
 * sitemap does not list it, and the page that did not ask is none of that.
 */
test('a page hidden from search engines says so and leaves the sitemap', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
  request,
}) => {
  const site = await api.currentSite();
  const made = [];
  for (const slug of [`visible-${uniqueName}`, `hidden-${uniqueName}`]) {
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug,
      title: slug,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    made.push({ group, slug });
  }
  const [visible, hidden] = made;
  if (!visible || !hidden) throw new Error('two pages were made');
  const address = (slug: string) => `/${site.defaultLocale}/${slug}`;

  await page.goto(`page-groups/${hidden.group.id}`);
  // The page's own actions are in the Page menu and, again, under "This
  // page" in the properties: either opens the same dialog.
  await page
    .getByRole('button', { name: copy.t('pages.seo.open'), exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: copy.t('pages.seo.title') });
  const toggle = dialog.getByRole('switch', {
    name: copy.t('pages.seo.noIndexLabel'),
  });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await dialog.getByRole('button', { name: copy.t('pages.seo.save') }).click();
  await expect(dialog).toBeHidden();

  const hiddenPage = await request.get(
    `${environment.publicSiteUrl}${address(hidden.slug).slice(1)}`,
  );
  expect(hiddenPage.status()).toBe(200);
  expect(hiddenPage.headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(await hiddenPage.text()).toContain(
    '<meta name="robots" content="noindex, nofollow">',
  );

  const visiblePage = await request.get(
    `${environment.publicSiteUrl}${address(visible.slug).slice(1)}`,
  );
  expect(visiblePage.status()).toBe(200);
  expect(visiblePage.headers()['x-robots-tag']).toBeUndefined();

  const sitemap = await (
    await request.get(`${environment.publicSiteUrl}sitemap.xml`)
  ).text();
  expect(sitemap).toContain(address(visible.slug));
  expect(sitemap).not.toContain(address(hidden.slug));

  // And it is a switch that goes back: the page is listed again.
  await page.reload();
  // The page's own actions are in the Page menu and, again, under "This
  // page" in the properties: either opens the same dialog.
  await page
    .getByRole('button', { name: copy.t('pages.seo.open'), exact: true })
    .first()
    .click();
  const again = page.getByRole('dialog', { name: copy.t('pages.seo.title') });
  await expect(
    again.getByRole('switch', { name: copy.t('pages.seo.noIndexLabel') }),
  ).toBeChecked();
  await again
    .getByRole('switch', { name: copy.t('pages.seo.noIndexLabel') })
    .click();
  await again.getByRole('button', { name: copy.t('pages.seo.save') }).click();
  await expect(again).toBeHidden();
  const relisted = await (
    await request.get(`${environment.publicSiteUrl}sitemap.xml`)
  ).text();
  expect(relisted).toContain(address(hidden.slug));
});
