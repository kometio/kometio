import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { KometioApi } from './support/kometio-api';
import { Cleanup } from './support/cleanup';
import { environment } from './support/environment';
import { expect, test } from './support/test';
import type { Block } from './support/wire-schemas';
import samples from './fixtures/block-samples.json' with { type: 'json' };

/**
 * The PUBLIC site passes axe's WCAG 2.2 AA rules: a page of every block the
 * picker offers (with its default content, one page for each of the picker's
 * categories), the page that is not found, and the search.
 *
 * The editor's screens have had this gate since 2026-09-26 (accessibility.e2e);
 * what visitors read had none. The docs site, audited on 2026-10-13, uses
 * thirty-three of the hundred and sixteen blocks, so it says nothing about the
 * rest — which is why this does not use it.
 *
 * The blocks come from `fixtures/block-samples.json`, made from the registry
 * (`pnpm run e2e:block-samples`) and held current by a spec of the registry:
 * a block added tomorrow is on a page here the day it is added.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const WIDTHS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 } },
] as const;

/** A one-pixel PNG: the smallest picture the library takes, so a block that needs one has one. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQTX4NAAIkAXSaGkHUAAAAAElFTkSuQmCC',
  'base64',
);

/**
 * What a block needs before it draws anything: a default has no picture, no
 * form and no address, and a block with nothing to show shows nothing — which
 * an audit passes without having looked. A page of the samples alone left
 * twenty-seven of ninety-nine drawing nothing (2026-10-13); these are the
 * ones that take a picture, a form or a video address.
 */
function fillIns(media: { id: string; url: string }, form: { id: string }) {
  const picture = {
    mediaId: media.id,
    url: media.url,
    width: 1,
    height: 1,
    filename: 'pixel.png',
    mimeType: 'image/png',
    size: PIXEL_PNG.length,
  };
  const entry = { media: picture, alt: 'A single pixel', isDecorative: false };
  const fills: Record<string, Record<string, unknown>> = {
    Image: { media: picture, alt: 'A single pixel', caption: 'A caption' },
    ImageSlider: { images: [entry, entry] },
    LogoStrip: { logos: [entry, entry] },
    ProductGallery: { images: [entry, entry] },
    BeforeAfter: { beforeImage: picture, afterImage: picture },
    ImageHotspots: { image: picture, alt: 'A single pixel with hotspots' },
    FileDownload: { file: picture, label: 'Download the picture' },
    VideoFile: { media: picture, poster: picture },
    Audio: { media: picture, title: 'A sound' },
    Form: { form: { formId: form.id, formName: 'A form' } },
    VideoEmbed: {
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      caption: 'A video',
    },
  };
  return fills;
}

interface SamplePage {
  category: string;
  slug: string;
}

const cleanup = new Cleanup();
let locale: string;
const pages: SamplePage[] = [];

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: environment.apiUrl,
    storageState: environment.storageStatePath,
  });
  cleanup.add(() => request.dispose());
  const api = new KometioApi(request);
  const site = await api.currentSite();
  locale = site.defaultLocale;
  const run = `${test.info().workerIndex}-${Date.now()}`;
  const media = await api.uploadMedia(site.id, {
    name: `e2e-public-a11y-${run}.png`,
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  cleanup.add(() => api.deleteMedia(media.id));
  const form = await api.createForm(site.id, `e2e-public-a11y-${run}`);
  cleanup.add(() => api.deleteForm(form.id));
  await api.updateForm(form.id, {
    name: `e2e-public-a11y-${run}`,
    fields: [
      { id: 'name', label: 'Your name', type: 'text', required: true },
      { id: 'email', label: 'Your email', type: 'email', required: true },
      {
        id: 'message',
        label: 'Your message',
        type: 'textarea',
        required: false,
      },
    ],
    notificationEmails: [],
  });
  const fills = fillIns(media, form);
  for (const { category, blocks } of samples.categories) {
    const slug = `e2e-public-a11y-${category.toLowerCase()}-${run}`;
    const { group, translation } = await api.createPage({
      siteId: site.id,
      locale,
      slug,
      title: `Every ${category} block`,
      // One level of children is part of a sample; the wire type is the same.
      content: (blocks as Block[]).map((block) => ({
        ...block,
        props: { ...block.props, ...fills[block.type] },
      })),
    });
    cleanup.add(() => api.deletePage(group.id));
    await api.publishTranslation(translation.id);
    pages.push({ category, slug });
  }
});

test.afterAll(() => cleanup.run());

/**
 * Only this stack answers. A page of every block has a video, a map and a
 * calendar on it, and the internet's answer to those is neither ours to audit
 * nor the same twice (a widget that never goes idle, or a cookie banner of
 * somebody else's). Their frames stay on the page, with the titles we give
 * them: that is the part that is ours.
 */
async function keepToThisStack(page: Page): Promise<void> {
  const ours = new Set([
    new URL(environment.publicSiteUrl).origin,
    new URL(environment.apiUrl).origin,
  ]);
  await page.route('**/*', (route) =>
    ours.has(new URL(route.request().url()).origin) ||
    route.request().url().startsWith('data:')
      ? route.continue()
      : route.abort(),
  );
}

for (const width of WIDTHS) {
  test.describe(`${width.name}`, () => {
    test.use({ viewport: width.viewport });

    test('a page of every block of each category passes axe', async ({
      page,
    }) => {
      await keepToThisStack(page);
      const failures: string[] = [];
      for (const { category, slug } of pages) {
        await test.step(category, async () => {
          const response = await page.goto(
            `${environment.publicSiteUrl}${locale}/${slug}`,
          );
          expect(response?.status(), `${category} page`).toBe(200);
          await page.waitForLoadState('networkidle');
          const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          for (const violation of results.violations) {
            failures.push(
              `${category}: ${violation.id} (${violation.impact}) — ${violation.help} — ${violation.nodes
                .slice(0, 3)
                .map((node) => node.target.join(' '))
                .join(', ')}`,
            );
          }
        });
      }
      expect(failures).toEqual([]);
    });

    test('the page that is not found, and the search, pass axe', async ({
      page,
    }) => {
      await keepToThisStack(page);
      const failures: string[] = [];
      for (const path of [
        `${locale}/this-page-does-not-exist-${Date.now()}`,
        `${locale}/search?q=kometio`,
      ]) {
        await test.step(path, async () => {
          await page.goto(`${environment.publicSiteUrl}${path}`);
          await page.waitForLoadState('networkidle');
          const results = await new AxeBuilder({ page })
            .withTags(WCAG_TAGS)
            .analyze();
          for (const violation of results.violations) {
            failures.push(
              `${path}: ${violation.id} (${violation.impact}) — ${violation.help} — ${violation.nodes
                .slice(0, 3)
                .map((node) => node.target.join(' '))
                .join(', ')}`,
            );
          }
        });
      }
      expect(failures).toEqual([]);
    });
  });
}
