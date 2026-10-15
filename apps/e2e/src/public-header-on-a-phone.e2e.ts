import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * A header on a phone: a name and a menu in one row (the idiom the block is
 * made for, `HamburgerMenu` inside a `Nav`). Its wrapper is a flex item, and
 * the size containment the blocks carry for container queries left it no
 * width of its own: the toggle stood outside the header's right edge, so the
 * page scrolled sideways, and the panel — as wide as the wrapper — was a
 * strip nobody could read. The block's own sample is a menu alone on a page,
 * which is why the audit of every block never saw it.
 *
 * The row is put in a page's body: a `Nav` is drawn wherever it is, and the
 * header and footer of a site are not this test's to change.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('a menu inside a Nav row stays inside the screen, opens, and can be read', async ({
  page,
  api,
  cleanup,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const link = (label: string) => ({
    type: 'NavLink',
    props: {
      label,
      linkType: 'url',
      page: null,
      url: '/',
      icon: null,
      position: 'left',
      visibility: 'always',
    },
  });
  const { group, translation } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: `header-${uniqueName}`,
    title: 'Header',
    content: [
      {
        type: 'Nav',
        props: { visibility: 'always' },
        children: [
          link('Studio Bianchi'),
          {
            type: 'HamburgerMenu',
            props: { position: 'right', visibility: 'always' },
            children: [link('Servizi'), link('Chi siamo'), link('Contatti')],
          },
        ],
      },
    ],
  });
  cleanup.add(() => api.deletePage(group.id));
  await api.publishTranslation(translation.id);

  await page.goto(
    `${environment.publicSiteUrl}${site.defaultLocale}/header-${uniqueName}`,
  );

  const viewportWidth = 390;
  // The row this test made, in the page's body: a site may have a header of
  // its own with a menu in it, and that one is not what is asked about.
  const row = page.locator('#main-content');
  const toggle = row.locator('.kometio-hamburger-menu__toggle');
  await expect(toggle).toBeVisible();
  const closed = await toggle.boundingBox();
  expect(closed).not.toBeNull();
  expect((closed?.x ?? 0) + (closed?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewportWidth);

  await toggle.click();

  const panel = row.locator('.kometio-hamburger-menu__panel');
  await expect(panel).toBeVisible();
  const open = await panel.boundingBox();
  expect(open).not.toBeNull();
  expect(open?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((open?.x ?? 0) + (open?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth,
  );
  // Wide enough to hold a link, not a strip the width of the button.
  expect(open?.width ?? 0).toBeGreaterThan(150);
  await expect(panel.getByRole('link', { name: 'Chi siamo' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewportWidth);
});
