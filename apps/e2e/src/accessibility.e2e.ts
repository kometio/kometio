import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { KometioApi } from './support/kometio-api';
import { CanvasEditor } from './support/canvas-editor';
import { Cleanup } from './support/cleanup';
import type { EditorCopy } from './support/editor-copy';
import { environment } from './support/environment';
import { expect, test } from './support/test';

/**
 * Every screen of the editor passes axe's WCAG 2.2 AA rules, in both
 * themes, at desktop and phone width. On 2026-09-26 the count was zero
 * everywhere, so any violation this reports is a new one.
 *
 * Every request a screen makes to the API has to succeed too: walking
 * every screen is the cheapest place to notice one that is refused.
 *
 * The page drawn inside the canvas is not audited here: it is the public
 * site's markup, sits on another origin, and would make every editor
 * screen answer for a theme's choices.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const THEMES = ['light', 'dark'] as const;
const WIDTHS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
] as const;

/** Screens that open on the canvas, which is ready only once its page is loaded. */
const CANVAS_SCREEN = /^(page-groups\/|layout\/(header|footer))/;

/** A 1×1 PNG: the smallest picture the library will take, so a file's panel has something to open. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQTX4NAAIkAXSaGkHUAAAAAElFTkSuQmCC',
  'base64',
);

// One page and one form of the suite's own, so the screens that edit one
// have something to open. Each is handed to `cleanup` the moment it
// exists: a setup that fails halfway still removes what it made.
let subjects: {
  pageGroupId: string;
  formId: string;
  mediaId: string;
  taxonomyId: string;
  termId: string;
  locale: string;
};

const cleanup = new Cleanup();

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: environment.apiUrl,
    storageState: environment.storageStatePath,
  });
  cleanup.add(() => request.dispose());
  const api = new KometioApi(request);
  const site = await api.currentSite();
  const name = `e2e-a11y-${test.info().workerIndex}-${Date.now()}`;
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: name,
    title: name,
    content: [{ type: 'Heading', props: { text: name, level: 'h2' } }],
  });
  cleanup.add(() => api.deletePage(group.id));
  const form = await api.createForm(site.id, name);
  cleanup.add(() => api.deleteForm(form.id));
  const media = await api.uploadMedia(site.id, {
    name: `${name}.png`,
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  cleanup.add(() => api.deleteMedia(media.id));
  // Deleting the category takes its term with it.
  // Named differently from the page: a category's address is made from its
  // name, and the page already answers at the page's.
  const taxonomy = await api.createTaxonomy(site.id, {
    locale: site.defaultLocale,
    text: `${name}-category`,
  });
  cleanup.add(() => api.deleteTaxonomy(taxonomy.id));
  const term = await api.createTerm(taxonomy.id, {
    locale: site.defaultLocale,
    text: `${name}-term`,
  });
  subjects = {
    pageGroupId: group.id,
    formId: form.id,
    mediaId: media.id,
    taxonomyId: taxonomy.id,
    termId: term.id,
    locale: site.defaultLocale,
  };
});

test.afterAll(() => cleanup.run());

function screens(): string[] {
  return [
    '',
    'pages',
    `page-groups/${subjects.pageGroupId}`,
    'media',
    // A file's panel, open over its folder.
    `media?kind=image&file=${subjects.mediaId}`,
    'forms',
    `forms/${subjects.formId}`,
    // The same form's answers, at their own address.
    `forms/${subjects.formId}?tab=submissions`,
    'layout',
    `layout/header?locale=${subjects.locale}`,
    `layout/footer?locale=${subjects.locale}`,
    'sections',
    // The other of its two lists.
    'sections?kind=template',
    'taxonomies',
    // A term, on the page of its own.
    `taxonomies/${subjects.taxonomyId}/terms/${subjects.termId}`,
    'style',
    // The settings area: a page per section, at its own address.
    'settings/general',
    'settings/languages',
    'settings/seo',
    'settings/business',
    'settings/collections',
    'settings/integrations',
    'settings/ai',
    'settings/cookies',
    'settings/cookies/legal-documents',
    'settings/retention',
    'settings/users',
    'imports',
    'account',
  ];
}

/**
 * The screens the folded sidebar is audited on: it is a different piece of
 * chrome on every one of them, so a few are enough to cover it — the
 * dashboard, the busiest list, and a settings section.
 */
const FOLDED_SIDEBAR_SCREENS = ['', 'pages', 'settings/general'];

/**
 * Walks `paths` in `page`, and returns everything wrong with them: an axe
 * violation, or an API request that was refused.
 */
async function audit(
  page: Page,
  copy: EditorCopy,
  paths: string[],
): Promise<string[]> {
  const failures: string[] = [];
  let screenPath = '';
  page.on('response', (response) => {
    if (
      response.url().startsWith(environment.apiUrl) &&
      response.status() >= 400
    ) {
      failures.push(
        `/${screenPath}: ${response.status()} from ${response.request().method()} ${response.url()}`,
      );
    }
  });
  for (const screen of paths) {
    screenPath = screen;
    await test.step(`/${screen}`, async () => {
      await page.goto(screen);
      await page.waitForLoadState('networkidle');
      // A lapsed session would put every screen on the login form,
      // which passes, and the gate with it.
      await expect(page).not.toHaveURL(/\/login/);
      if (CANVAS_SCREEN.test(screen)) {
        await new CanvasEditor(page, copy).waitUntilLoaded();
      }
      const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .exclude(`iframe[title="${copy.t('canvas.previewFrameTitle')}"]`)
        .analyze();
      for (const violation of results.violations) {
        failures.push(
          `/${screen}: ${violation.id} (${violation.impact}) — ${violation.help} — ${violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(' '))
            .join(', ')}`,
        );
      }
    });
  }
  return failures;
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`every editor screen passes axe and loads without an API error — ${theme} theme, ${width.name}`, async ({
      page,
      copy,
    }) => {
      // One test walks every screen: about a second and a half each,
      // more on a busy CI runner, well past the 30 seconds one flow gets.
      test.setTimeout(screens().length * 10_000);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize(width.viewport);

      expect(await audit(page, copy, screens())).toEqual([]);
    });
  }

  // The sidebar folded to its strip is different chrome: the same
  // screens, the same gate. Desktop only — below `md` it is not there.
  test(`the folded sidebar passes axe too — ${theme} theme, desktop`, async ({
    page,
    copy,
  }) => {
    test.setTimeout(FOLDED_SIDEBAR_SCREENS.length * 10_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize(WIDTHS[0].viewport);
    await page.addInitScript(() =>
      localStorage.setItem('kometio-sidebar-collapsed', 'true'),
    );

    expect(await audit(page, copy, FOLDED_SIDEBAR_SCREENS)).toEqual([]);
    // It really was folded: a folded sidebar offers to be unfolded.
    await expect(
      page.getByRole('button', { name: copy.t('shell.sidebar.expand') }),
    ).toBeVisible();
  });
}
