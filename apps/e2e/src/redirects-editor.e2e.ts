import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { KometioApi } from './support/kometio-api';
import type { Cleanup } from './support/cleanup';
import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * The Redirects screen of the settings (docs/adr/0127), used the way a
 * person who has just moved a site uses it — and each thing it does is then
 * asked of the public site, with no session and without following the
 * answer, because what it promises is what a visitor and a search engine
 * get.
 */

/** Removes whatever rules a test made through the screen, found by what they were called, however the test ends. */
function removeRulesNamed(
  cleanup: Cleanup,
  api: KometioApi,
  siteId: string,
  name: string,
) {
  cleanup.add(async () => {
    for (const rule of await api.redirects(siteId, name)) {
      await api.deleteRedirect(rule.id);
    }
  });
}

test.describe('the redirects screen', () => {
  test('adds a rule to a page, answers for the address, and takes it away', async ({
    page,
    api,
    cleanup,
    copy,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug: uniqueName,
      title: `Offer ${uniqueName}`,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    const oldPath = `/2019/05/old-${uniqueName}`;
    removeRulesNamed(cleanup, api, site.id, uniqueName);

    await page.goto('settings/redirects');
    await page
      .getByRole('button', { name: copy.t('redirects.actions.add') })
      .click();
    const dialog = page.getByRole('dialog', {
      name: copy.t('redirects.dialog.addTitle'),
    });
    await dialog
      .getByLabel(copy.t('redirects.dialog.from.label'), { exact: true })
      .fill(`https://Old-Site.example${oldPath}/`);
    // What will be kept is said before it is saved.
    await expect(
      dialog.getByText(
        copy.t('redirects.dialog.from.exact', { address: oldPath }),
      ),
    ).toBeVisible();
    await dialog
      .getByRole('button', { name: copy.t('redirects.dialog.to.page.choose') })
      .click();
    const picker = page.getByRole('dialog', {
      name: copy.t('pages.picker.title'),
    });
    await picker
      .getByLabel(copy.t('pages.picker.search'))
      .fill(`Offer ${uniqueName}`);
    await picker.getByRole('button', { name: new RegExp(uniqueName) }).click();
    await dialog
      .getByRole('button', {
        name: copy.t('redirects.dialog.add'),
        exact: true,
      })
      .click();

    const row = page.getByRole('listitem').filter({ hasText: oldPath });
    await expect(row).toBeVisible();
    await expect(row.getByText(`Offer ${uniqueName}`)).toBeVisible();

    const answer = await request.get(
      `${environment.publicSiteUrl}${oldPath.slice(1)}`,
      {
        maxRedirects: 0,
      },
    );
    expect(answer.status()).toBe(301);
    expect(answer.headers()['location']).toBe(
      `/${site.defaultLocale}/${uniqueName}`,
    );

    // Asked of the screen, which asks the site's own function.
    await page
      .getByRole('button', { name: copy.t('redirects.actions.test') })
      .click();
    const check = page.getByRole('dialog', {
      name: copy.t('redirects.test.title'),
    });
    await check.getByLabel(copy.t('redirects.test.label')).fill(oldPath);
    await check
      .getByRole('button', { name: copy.t('redirects.test.run'), exact: true })
      .click();
    await expect(
      check.getByText(
        copy.t('redirects.test.result.redirect301', {
          location: `/${site.defaultLocale}/${uniqueName}`,
        }),
      ),
    ).toBeVisible();
    await check
      .getByRole('button', { name: copy.t('redirects.test.done'), exact: true })
      .click();

    // Taken away: ticked, asked about, and the address is a 404 again.
    await row
      .getByRole('checkbox', {
        name: copy.t('redirects.row.select', { from: oldPath }),
      })
      .check();
    await page
      .getByRole('button', { name: copy.t('redirects.selection.delete') })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: copy.t('common.delete') })
      .click();
    await expect(row).toBeHidden();
    const after = await request.get(
      `${environment.publicSiteUrl}${oldPath.slice(1)}`,
      { maxRedirects: 0 },
    );
    expect(after.status()).toBe(404);
  });

  test('imports a list after showing what it would do, and says the line it cannot use', async ({
    page,
    api,
    cleanup,
    copy,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    removeRulesNamed(cleanup, api, site.id, uniqueName);
    const csv = [
      'old address,new address,type',
      `/${uniqueName}-a,/${site.defaultLocale}/a,301`,
      `/${uniqueName}-b,/${site.defaultLocale}/b,302`,
      `/api/${uniqueName},/${site.defaultLocale}/c,301`,
    ].join('\n');

    await page.goto('settings/redirects');
    await page
      .getByRole('button', { name: copy.t('redirects.actions.import') })
      .click();
    const dialog = page.getByRole('dialog', {
      name: copy.t('redirects.import.title'),
    });
    await dialog.getByLabel(copy.t('redirects.import.pasteLabel')).fill(csv);
    await dialog
      .getByRole('button', { name: copy.t('redirects.import.check') })
      .click();

    // Judged, not written: the site still has nothing for it.
    await expect(dialog.getByText(/2 .*1 /)).toBeVisible();
    await expect(
      dialog.getByText(copy.t('redirects.import.line', { line: 4 })),
    ).toBeVisible();
    const before = await request.get(
      `${environment.publicSiteUrl}${uniqueName}-a`,
      { maxRedirects: 0 },
    );
    expect(before.status()).toBe(404);

    await dialog
      .getByRole('button', {
        name: copy.t('redirects.import.apply', { count: 2 }),
      })
      .click();

    await expect(
      page.getByRole('listitem').filter({ hasText: `/${uniqueName}-a` }),
    ).toBeVisible();
    const temporary = await request.get(
      `${environment.publicSiteUrl}${uniqueName}-b`,
      { maxRedirects: 0 },
    );
    expect(temporary.status()).toBe(302);
    expect(temporary.headers()['location']).toBe(`/${site.defaultLocale}/b`);
  });

  test('turns an address visitors did not find into a rule', async ({
    page,
    api,
    cleanup,
    copy,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    removeRulesNamed(cleanup, api, site.id, uniqueName);
    const lost = `/${uniqueName}-lost`;
    // A visitor asks. What is not found is counted every few seconds, not
    // for each request.
    const asked = await request.get(
      `${environment.publicSiteUrl}${lost.slice(1)}`,
      {
        maxRedirects: 0,
      },
    );
    expect(asked.status()).toBe(404);
    await expect
      .poll(
        async () => (await api.missingPaths(site.id)).map((one) => one.path),
        {
          timeout: 30_000,
        },
      )
      .toContain(lost);

    await page.goto('settings/redirects?tab=missing');
    const row = page.getByRole('listitem').filter({ hasText: lost });
    await expect(row).toBeVisible();
    await row
      .getByRole('button', {
        name: copy.t('redirects.missing.redirectLabel', { path: lost }),
      })
      .click();
    const dialog = page.getByRole('dialog', {
      name: copy.t('redirects.dialog.addTitle'),
    });
    // Its address is already in.
    await expect(
      dialog.getByLabel(copy.t('redirects.dialog.from.label'), { exact: true }),
    ).toHaveValue(lost);
    await dialog
      .getByRole('radio', { name: copy.t('redirects.dialog.to.gone.label') })
      .click();
    await dialog
      .getByRole('button', {
        name: copy.t('redirects.dialog.add'),
        exact: true,
      })
      .click();

    // It is not "not found" any more, in the list or at the site.
    await expect(row).toBeHidden();
    const answer = await request.get(
      `${environment.publicSiteUrl}${lost.slice(1)}`,
      {
        maxRedirects: 0,
      },
    );
    expect(answer.status()).toBe(410);
  });

  test('says in words what the server refused, under the field it is about', async ({
    page,
    copy,
  }) => {
    await page.goto('settings/redirects');
    await page
      .getByRole('button', { name: copy.t('redirects.actions.add') })
      .click();
    const dialog = page.getByRole('dialog', {
      name: copy.t('redirects.dialog.addTitle'),
    });

    await dialog
      .getByLabel(copy.t('redirects.dialog.from.label'), { exact: true })
      .fill('/api/forms');
    await dialog
      .getByRole('radio', { name: copy.t('redirects.dialog.to.url.label') })
      .click();
    await dialog
      .getByLabel(copy.t('redirects.dialog.to.url.field'), { exact: true })
      .fill('/en/x');
    await dialog
      .getByRole('button', {
        name: copy.t('redirects.dialog.add'),
        exact: true,
      })
      .click();

    await expect(
      dialog.getByText(
        copy.t('redirects.problems.source.reserved', { detail: 'api' }),
      ),
    ).toBeVisible();
    // Nothing of what was typed is lost.
    await expect(
      dialog.getByLabel(copy.t('redirects.dialog.from.label'), { exact: true }),
    ).toHaveValue('/api/forms');
  });
});

test.describe('the dialogs of the screen', () => {
  const THEMES = ['light', 'dark'] as const;
  const WIDTHS = [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'phone', viewport: { width: 390, height: 844 } },
  ] as const;
  const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

  async function violationsOf(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    return results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(', ')}`,
    );
  }

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`pass axe, with their answers on screen — ${theme}, ${width.name}`, async ({
        page,
        copy,
      }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize(width.viewport);
        await page.goto('settings/redirects');
        const failures: string[] = [];

        // A pattern and a refused address, so that the reading and the error
        // are on screen when the page is looked at.
        await page
          .getByRole('button', { name: copy.t('redirects.actions.add') })
          .click();
        const add = page.getByRole('dialog', {
          name: copy.t('redirects.dialog.addTitle'),
        });
        await add
          .getByLabel(copy.t('redirects.dialog.from.label'), { exact: true })
          .fill('/:year/:month/:slug');
        await add
          .getByRole('radio', { name: copy.t('redirects.dialog.to.url.label') })
          .click();
        await add
          .getByLabel(copy.t('redirects.dialog.to.url.field'), { exact: true })
          .fill('/en/:nope');
        await add
          .getByRole('button', {
            name: copy.t('redirects.dialog.add'),
            exact: true,
          })
          .click();
        await expect(add.getByRole('alert')).toBeVisible();
        failures.push(...(await violationsOf(page)).map((v) => `add: ${v}`));
        await page.keyboard.press('Escape');

        await page
          .getByRole('button', { name: copy.t('redirects.actions.import') })
          .click();
        const importing = page.getByRole('dialog', {
          name: copy.t('redirects.import.title'),
        });
        await importing
          .getByLabel(copy.t('redirects.import.pasteLabel'))
          .fill('/api/x,/en/x\n/a,/en/a');
        await importing
          .getByRole('button', { name: copy.t('redirects.import.check') })
          .click();
        await expect(
          importing.getByText(copy.t('redirects.import.problemsTitle')),
        ).toBeVisible();
        failures.push(...(await violationsOf(page)).map((v) => `import: ${v}`));
        await page.keyboard.press('Escape');

        await page
          .getByRole('button', { name: copy.t('redirects.actions.test') })
          .click();
        const check = page.getByRole('dialog', {
          name: copy.t('redirects.test.title'),
        });
        await check
          .getByLabel(copy.t('redirects.test.label'))
          .fill('/nothing-here');
        await check
          .getByRole('button', {
            name: copy.t('redirects.test.run'),
            exact: true,
          })
          .click();
        await expect(check.getByRole('status')).toBeVisible();
        failures.push(...(await violationsOf(page)).map((v) => `test: ${v}`));

        expect(failures).toEqual([]);
      });
    }
  }
});

test.describe('the redirects of a WordPress move', () => {
  const item = (id: number, slug: string, link: string) => `<item>
  <title><![CDATA[${slug}]]></title><link>${link}</link>
  <content:encoded><![CDATA[<p>${slug}</p>]]></content:encoded>
  <wp:post_id>${id}</wp:post_id><wp:post_name><![CDATA[${slug}]]></wp:post_name>
  <wp:post_type><![CDATA[post]]></wp:post_type><wp:status><![CDATA[publish]]></wp:status>
</item>`;

  const exportOf = (items: string[]) => `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title><![CDATA[The old site]]></title><wp:base_blog_url>https://old.example</wp:base_blog_url>
${items.join('\n')}
</channel></rss>`;

  test('are judged against the pages the site has, made, and answer for the old address', async ({
    page,
    api,
    cleanup,
    copy,
    uniqueName,
    request,
  }) => {
    const site = await api.currentSite();
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug: `post-${uniqueName}`,
      title: `Post ${uniqueName}`,
      content: [],
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    removeRulesNamed(cleanup, api, site.id, uniqueName);
    const job = await api.analyseWordPressExport(
      site.id,
      `e2e-${uniqueName}.xml`,
      exportOf([
        item(
          101,
          `post-${uniqueName}`,
          `https://old.example/2019/05/post-${uniqueName}/`,
        ),
        item(
          102,
          `missing-${uniqueName}`,
          `https://old.example/2019/06/missing-${uniqueName}/`,
        ),
      ]),
    );
    cleanup.add(() => api.deleteImportJob(job));

    await page.goto('settings/redirects');
    await page
      .getByRole('button', { name: copy.t('redirects.actions.import') })
      .click();
    const dialog = page.getByRole('dialog', {
      name: copy.t('redirects.import.title'),
    });
    await dialog
      .getByRole('tab', { name: copy.t('redirects.import.sources.wordpress') })
      .click();
    await dialog
      .getByRole('button', {
        name: copy.t('redirects.import.wordpress.check'),
      })
      .click();

    // Judged against the site's own pages, with what is left over named.
    await expect(
      dialog.getByText(
        copy.t('redirects.import.wordpress.found', { matched: 1, total: 2 }),
      ),
    ).toBeVisible();
    await expect(
      dialog.getByText(`https://old.example/2019/06/missing-${uniqueName}/`),
    ).toBeVisible();
    const before = await request.get(
      `${environment.publicSiteUrl}2019/05/post-${uniqueName}`,
      { maxRedirects: 0 },
    );
    expect(before.status()).toBe(404);

    await dialog
      .getByRole('button', {
        name: copy.t('redirects.import.apply', { count: 2 }),
      })
      .click();

    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: `/2019/05/post-${uniqueName}` }),
    ).toBeVisible();
    const after = await request.get(
      `${environment.publicSiteUrl}2019/05/post-${uniqueName}`,
      { maxRedirects: 0 },
    );
    expect(after.status()).toBe(301);
    expect(after.headers()['location']).toBe(
      `/${site.defaultLocale}/post-${uniqueName}`,
    );
    // And by its number, which is what WordPress answered at its front door.
    const byNumber = await request.get(`${environment.publicSiteUrl}?p=101`, {
      maxRedirects: 0,
    });
    expect(byNumber.status()).toBe(301);
    expect(byNumber.headers()['location']).toBe(
      `/${site.defaultLocale}/post-${uniqueName}`,
    );
  });
});
