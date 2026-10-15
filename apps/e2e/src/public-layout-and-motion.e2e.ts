import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * How a page of the public site sits in a window, and the owner's switch for
 * whether it moves (docs/adr/0143, 0142). Against the built site and its
 * CSP, which is where a rule that only works in the dev server shows.
 *
 * The page is made by the test: a site's own home is not this test's to
 * assume, and a Text block is all the column needs to be measured by.
 */
test('the column grows with a large window and does not move below 1440', async ({
  page,
  api,
  cleanup,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const { group, translation } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: `window-${uniqueName}`,
    title: 'Window',
    content: [
      {
        type: 'Text',
        props: { body: '<p>A column.</p>', visibility: 'always' },
      },
    ],
  });
  cleanup.add(() => api.deletePage(group.id));
  await api.publishTranslation(translation.id);
  const address = `${environment.publicSiteUrl}${site.defaultLocale}/window-${uniqueName}`;

  const measure = () =>
    page.evaluate(() => {
      const block = document.querySelector('#main-content .kometio-root-block');
      const header = document.querySelector('header.kometio-shell-inset');
      return {
        rootSize: parseFloat(
          getComputedStyle(document.documentElement).fontSize,
        ),
        column: block?.getBoundingClientRect().width ?? 0,
        headerInset: header
          ? parseFloat(getComputedStyle(header).paddingLeft)
          : null,
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      };
    });

  // At 1440 nothing is different from before: 16px, a 64rem column, 24px.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(address);
  const standard = await measure();
  expect(standard.rootSize).toBe(16);
  expect(standard.column).toBe(1024);
  if (standard.headerInset !== null) expect(standard.headerInset).toBe(24);
  expect(standard.overflow).toBe(false);

  // At 2560 the page has grown by a quarter, and so has the column.
  await page.setViewportSize({ width: 2560, height: 1000 });
  const large = await measure();
  expect(large.rootSize).toBe(20);
  expect(large.column).toBe(1280);
  // The header's content stops at 90rem (1800px) and sits on the gutter: 30px.
  if (large.headerInset !== null) expect(large.headerInset).toBe(410);
  expect(large.overflow).toBe(false);

  // The same window, made small again in place, is the phone's layout.
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await measure();
  expect(phone.rootSize).toBe(16);
  expect(phone.column).toBe(390);
  expect(phone.overflow).toBe(false);
});

test('a site whose owner turned motion off holds still, and gets it back when it is turned on', async ({
  page,
  api,
  cleanup,
  uniqueName,
}) => {
  const site = await api.currentSite();
  // The docs theme is the one that moves; the cross-fade and the part by
  // part arrival are what the switch has to answer.
  await api.setThemePackage(site.id, 'docs-showcase');
  cleanup.add(() => api.setThemePackage(site.id, site.themeName));
  cleanup.add(() => api.setMotion(site.id, true));
  const { group, translation } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: `still-${uniqueName}`,
    title: 'Still',
    content: [
      {
        type: 'Text',
        props: { body: '<p>Some words.</p>', visibility: 'always' },
      },
    ],
  });
  cleanup.add(() => api.deletePage(group.id));
  await api.publishTranslation(translation.id);
  const address = `${environment.publicSiteUrl}${site.defaultLocale}/still-${uniqueName}`;

  const state = () =>
    page.evaluate(() => ({
      attribute: document.documentElement.getAttribute('data-kometio-motion'),
      ready: document.documentElement.classList.contains(
        'kometio-motion-ready',
      ),
      crossFade: [...document.querySelectorAll('style')].some((style) =>
        style.textContent?.includes('@view-transition'),
      ),
    }));

  await api.setMotion(site.id, false);
  await page.goto(address);
  await expect(page.locator('#main-content')).toContainText('Some words.');
  const still = await state();
  expect(still.attribute).toBe('off');
  expect(still.ready).toBe(false);
  expect(still.crossFade).toBe(false);

  await api.setMotion(site.id, true);
  await page.goto(address);
  await expect(page.locator('html.kometio-motion-ready')).toHaveCount(1);
  const moving = await state();
  expect(moving.attribute).toBeNull();
  expect(moving.crossFade).toBe(true);
});
