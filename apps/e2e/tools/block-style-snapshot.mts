/**
 * The computed style of every element of a page of every block, for each theme
 * and width, with the blocks' own defaults and with every `--kometio-override-*`
 * property set: the equivalence proof for a refactor of how a block maps those
 * properties onto CSS (docs/adr/0133).
 *
 *   pnpm exec tsx apps/e2e/tools/block-style-snapshot.mts snapshot out.json
 *   pnpm exec tsx apps/e2e/tools/block-style-snapshot.mts diff before.json after.json
 *
 * It drives a stack that is already running (the API, the public site, a
 * migrated and seeded database — see docs/development.md), like the browser
 * suite, and leaves it as it found it. Two snapshots of the same code are
 * identical, which `diff` is the check of: a difference between before and
 * after is a change of what a visitor sees.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, request, type Page } from '@playwright/test';
import { environment } from '../src/support/environment';
import { KometioApi } from '../src/support/kometio-api';
import type { Block } from '../src/support/wire-schemas';
import samples from '../src/fixtures/block-samples.json' with { type: 'json' };

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQTX4NAAIkAXSaGkHUAAAAAElFTkSuQmCC',
  'base64',
);

/** Every property a block's own CSS reads, set to a value that is not any block's default. */
const OVERRIDES = [
  '--kometio-override-bg: rgb(12, 34, 56)',
  '--kometio-override-text: rgb(210, 220, 230)',
  '--kometio-override-radius: 7px',
  '--kometio-override-padding-x: 13px',
  '--kometio-override-padding-y: 11px',
  '--kometio-override-border-width: 3px',
  '--kometio-override-border-style: dashed',
  '--kometio-override-border-color: rgb(200, 10, 10)',
  '--kometio-override-shadow: 1px 2px 3px rgb(0, 0, 0)',
  '--kometio-override-bg-position: left top',
  '--kometio-override-bg-size: contain',
  '--kometio-override-bg-repeat: repeat-x',
  '--kometio-override-overlay: rgba(1, 2, 3, 0.5)',
  '--kometio-override-min-height: 77px',
  '--kometio-override-max-width: 555px',
  '--kometio-override-gap: 9px',
  '--kometio-override-align: flex-end',
  '--kometio-override-justify: flex-end',
  '--kometio-override-direction: row-reverse',
].join('; ');

const CONDITIONS = [
  { name: 'defaults', css: '' },
  { name: 'overridden', css: OVERRIDES },
] as const;

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

interface Entry {
  key: string;
  hash: string;
}

interface PageSnapshot {
  elements: Entry[];
  styles: Record<string, Record<string, string>>;
}

type Snapshot = Record<string, PageSnapshot>;

/**
 * Runs in the page: the computed style of every element and its two
 * pseudo-elements, deduplicated by content. A string and not a function, so
 * that the bundler's own helpers (`__name`) are not in what the page is given.
 */
const PAGE_SCRIPT = `async (css) => {
  const style = document.createElement('style');
  // Nothing moves while it is read: an entrance animation half-way is a
  // different style every run.
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}' + (css ? ':root{' + css + '}' : '');
  document.head.appendChild(style);
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','LINK','META','TITLE','HEAD']);
  const elements = [];
  const styles = {};
  async function sha1(text) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function record(key, computed) {
    const props = {};
    for (const name of Array.from(computed).sort()) props[name] = computed.getPropertyValue(name);
    const hash = await sha1(JSON.stringify(props));
    styles[hash] = props;
    elements.push({ key: key, hash: hash });
  }
  const all = Array.from(document.body.querySelectorAll('*')).filter((el) => !skip.has(el.tagName));
  let index = 0;
  for (const el of all) {
    const classes = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    const label = index + ':' + el.tagName.toLowerCase() + classes;
    await record(label, getComputedStyle(el));
    for (const pseudo of ['::before', '::after']) {
      const computed = getComputedStyle(el, pseudo);
      if (computed.content && computed.content !== 'none' && computed.content !== 'normal') {
        await record(label + pseudo, computed);
      }
    }
    index += 1;
  }
  return { elements: elements, styles: styles };
}`;

async function describePage(
  page: Page,
  injected: string,
): Promise<PageSnapshot> {
  return page.evaluate(`(${PAGE_SCRIPT})(${JSON.stringify(injected)})`);
}

async function snapshot(out: string): Promise<void> {
  const api = await request.newContext({ baseURL: environment.apiUrl });
  const login = await api.post('auth/login', {
    data: {
      email: environment.adminEmail,
      password: environment.adminPassword,
      captchaToken: 'e2e',
    },
  });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  const kometio = new KometioApi(api);
  const site = await kometio.currentSite();
  const siteRecord = (await (await api.get('sites/current')).json()) as {
    themeName: string;
  };
  const originalTheme = siteRecord.themeName;
  const themes = (
    (await (await api.get('sites/themes/available')).json()) as {
      name: string;
    }[]
  ).map((theme) => theme.name);

  const run = Date.now().toString(36);
  const media = await kometio.uploadMedia(site.id, {
    name: `snapshot-${run}.png`,
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  });
  const form = await kometio.createForm(site.id, `snapshot-${run}`);
  await kometio.updateForm(form.id, {
    name: `snapshot-${run}`,
    fields: [
      { id: 'name', label: 'Your name', type: 'text', required: true },
      { id: 'email', label: 'Your email', type: 'email', required: true },
    ],
    notificationEmails: [],
  });
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

  const groups: string[] = [];
  const pages: { category: string; slug: string }[] = [];
  for (const { category, blocks } of samples.categories) {
    const slug = `snapshot-${category.toLowerCase()}-${run}`;
    const { group, translation } = await kometio.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug,
      title: `Every ${category} block`,
      content: (blocks as Block[]).map((block) => ({
        ...block,
        props: { ...block.props, ...fills[block.type] },
      })),
    });
    groups.push(group.id);
    await kometio.publishTranslation(translation.id);
    pages.push({ category, slug });
  }

  const result: Snapshot = {};
  const browser = await chromium.launch();
  try {
    for (const theme of themes) {
      await api.patch(`sites/${site.id}/theme-package`, {
        data: { themeName: theme },
      });
      for (const width of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width: width.width, height: width.height },
          reducedMotion: 'reduce',
        });
        const ours = new Set([
          new URL(environment.publicSiteUrl).origin,
          new URL(environment.apiUrl).origin,
        ]);
        await context.route('**/*', (route) =>
          ours.has(new URL(route.request().url()).origin) ||
          route.request().url().startsWith('data:')
            ? route.continue()
            : route.abort(),
        );
        const page = await context.newPage();
        for (const { category, slug } of pages) {
          for (const condition of CONDITIONS) {
            await page.goto(
              `${environment.publicSiteUrl}${site.defaultLocale}/${slug}`,
            );
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(300);
            const key = `${theme}/${width.name}/${category}/${condition.name}`;
            result[key] = await describePage(page, condition.css);
            console.log(`${key}: ${result[key].elements.length} elements`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    for (const id of groups)
      await kometio.deletePage(id).catch(() => undefined);
    await kometio.deleteForm(form.id).catch(() => undefined);
    await kometio.deleteMedia(media.id).catch(() => undefined);
    await api
      .patch(`sites/${site.id}/theme-package`, {
        data: { themeName: originalTheme },
      })
      .catch(() => undefined);
    await api.dispose();
  }
  writeFileSync(out, JSON.stringify(result));
  const digest = createHash('sha1')
    .update(JSON.stringify(Object.values(result).map((p) => p.elements)))
    .digest('hex');
  console.log(
    `written ${out} (${Object.keys(result).length} pages, ${digest})`,
  );
}

function diff(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snapshot;
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snapshot;
  let differing = 0;
  let compared = 0;
  for (const key of Object.keys(before)) {
    const a = before[key];
    const b = after[key];
    if (!b) {
      console.log(`${key}: missing after`);
      differing += 1;
      continue;
    }
    if (a.elements.length !== b.elements.length) {
      console.log(
        `${key}: ${a.elements.length} elements before, ${b.elements.length} after`,
      );
      differing += 1;
      continue;
    }
    a.elements.forEach((element, i) => {
      const other = b.elements[i];
      // A countdown's digits are the time of day: its boxes change every
      // second, in the same code run twice.
      if (/kometio-countdown/.test(element.key)) return;
      compared += 1;
      if (element.key !== other.key) {
        console.log(`${key}[${i}]: ${element.key} → ${other.key}`);
        differing += 1;
        return;
      }
      if (element.hash === other.hash) return;
      differing += 1;
      const was = a.styles[element.hash];
      const now = b.styles[other.hash];
      const changed = Object.keys({ ...was, ...now })
        .filter((name) => was[name] !== now[name])
        .map((name) => `${name}: ${was[name]} → ${now[name]}`);
      console.log(`${key}[${i}] ${element.key}\n    ${changed.join('\n    ')}`);
    });
  }
  console.log(
    differing === 0
      ? `IDENTICAL: ${compared} elements compared`
      : `${differing} differences in ${compared} elements`,
  );
  process.exitCode = differing === 0 ? 0 : 1;
}

const [command, first, second] = process.argv.slice(2);
if (command === 'snapshot' && first) {
  await snapshot(first);
} else if (command === 'diff' && first && second) {
  diff(first, second);
} else {
  console.error(
    'usage: block-style-snapshot.mts snapshot <out.json> | diff <before.json> <after.json>',
  );
  process.exitCode = 2;
}
