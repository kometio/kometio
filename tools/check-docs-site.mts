#!/usr/bin/env -S pnpm exec tsx
/**
 * Reads the documentation site through the API and says what is wrong with
 * its pages, in the terms of docs/writing-user-docs.md and docs/adr/0140.
 * Nothing is written: it logs in, reads, and prints.
 *
 *   KOMETIO_EMAIL=… KOMETIO_PASSWORD=… \
 *     pnpm exec tsx tools/check-docs-site.mts --api http://localhost:3000/api [--json]
 *
 * The pages of the documentation site live in the database and are edited in
 * the editor, which is the point of running the site on the product (the
 * reasons are in docs/writing-user-docs.md). So nothing can check them while
 * they are written, and what a reader finds out first is the thing nobody
 * looked at: a block with no Italian text, which renders in English on the
 * Italian page without a word, a page with no title, a button called by a
 * name the editor does not use. This is the check that stands where a test
 * would.
 *
 * Exit status 1 when there is an error; warnings are printed and do not fail.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// By path, not by package name: `tools/` is outside the pnpm workspace, so
// `@kometio/*` does not resolve from here (the same as the other tools).
import { pageBlocks } from '../libs/block-registry/src/index';
import { captchaTokenFrom } from './solve-captcha.mjs';

export type Severity = 'error' | 'warning';

export interface Finding {
  severity: Severity;
  rule: string;
  /** The page, with the language and the block when there is one. */
  where: string;
  message: string;
}

export interface DocsBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children?: DocsBlock[];
}

export interface DocsTranslation {
  slug: string;
  status: string;
  /** Block id → field → the text of this language. */
  fieldValues: Record<string, Record<string, string>>;
}

export interface DocsPage {
  /** The default language's address, parents included: `themes/install-a-theme`. */
  path: string;
  hasChildren: boolean;
  blocks: DocsBlock[];
  translations: Record<string, DocsTranslation>;
}

export interface StyleRule {
  name: string;
  pattern: string;
  flags: string;
}

export interface CheckContext {
  defaultLocale: string;
  locales: string[];
  /** Block type → the keys of the fields whose text differs per language. */
  translatable: Record<string, string[]>;
  /** Every text the editor shows, by language: what a button is called. */
  labels: Record<string, Set<string>>;
  typography: StyleRule[];
  words: Record<string, StyleRule[]>;
}

const LONG_PARAGRAPH = 4;
const MANY_PARAGRAPHS_WITHOUT_A_SECTION = 4;
const THIN_PAGE_WORDS = 60;
const VAGUE_ENGLISH = /\b(simply|just|easily|and so on)\b|\betc\b\.?/i;

/** The text of some HTML, as a reader meets it. */
export function textOf(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|div|tr)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentencesIn(text: string): number {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«“"'(])/);
  return parts.filter((part) => part.trim() !== '').length;
}

function wordsIn(text: string): number {
  return text === '' ? 0 : text.split(/\s+/).length;
}

function* walk(blocks: DocsBlock[]): Generator<DocsBlock> {
  for (const block of blocks) {
    yield block;
    if (block.children) yield* walk(block.children);
  }
}

/** The text of one field in one language: the page's own for the default one, the overlay's for the others. */
function valueIn(
  page: DocsPage,
  context: CheckContext,
  locale: string,
  block: DocsBlock,
  key: string,
): string {
  if (locale === context.defaultLocale) {
    const value = block.props[key];
    return typeof value === 'string' ? value : '';
  }
  return page.translations[locale]?.fieldValues[block.id]?.[key] ?? '';
}

function excerpt(text: string): string {
  const plain = textOf(text);
  return plain.length > 48 ? `${plain.slice(0, 47)}…` : plain;
}

/** What is wrong with one page, in every language it has or should have. */
export function findingsFor(page: DocsPage, context: CheckContext): Finding[] {
  const findings: Finding[] = [];
  const add = (
    severity: Severity,
    rule: string,
    locale: string,
    message: string,
    block?: DocsBlock,
  ) => {
    const where = block
      ? `${page.path} [${locale}] ${block.type} “${excerpt(
          valueIn(page, context, locale, block, 'text') ||
            valueIn(page, context, locale, block, 'body') ||
            '',
        )}”`
      : `${page.path} [${locale}]`;
    findings.push({ severity, rule, where, message });
  };

  const blocks = [...walk(page.blocks)];

  for (const locale of context.locales) {
    if (locale !== context.defaultLocale && !page.translations[locale]) {
      add(
        'error',
        'missing-translation',
        locale,
        'the page has no translation',
      );
      continue;
    }

    // A block with a text in the default language and none in this one
    // renders in the default language, silently.
    if (locale !== context.defaultLocale) {
      for (const block of blocks) {
        // A snippet that is the same in every language needs no overlay.
        if (block.type === 'Code') continue;
        for (const key of context.translatable[block.type] ?? []) {
          const original = block.props[key];
          if (typeof original !== 'string' || textOf(original) === '') continue;
          if (textOf(valueIn(page, context, locale, block, key)) === '') {
            add(
              'error',
              'missing-text',
              locale,
              `the “${key}” of this block has no text in this language; the page shows the ${context.defaultLocale} one`,
              block,
            );
          }
        }
      }
    }

    const headings = blocks.filter((block) => block.type === 'Heading');
    const titles = headings.filter((block) => block.props['level'] === 'h1');
    const first = page.blocks[0];
    const startsWithTitle =
      first?.type === 'Hero' ||
      (first?.type === 'Heading' && first.props['level'] === 'h1');
    if (!startsWithTitle) {
      add(
        'error',
        'no-title',
        locale,
        'the page does not start with its title (a Heading, level 1, or a Hero)',
      );
    }
    if (titles.length > 1) {
      add(
        'error',
        'many-titles',
        locale,
        `the page has ${titles.length} titles (level 1 headings); it has one`,
      );
    }

    const paragraphs = blocks.filter((block) => block.type === 'Text');
    const sections = headings.filter((block) => block.props['level'] === 'h2');
    if (
      paragraphs.length >= MANY_PARAGRAPHS_WITHOUT_A_SECTION &&
      sections.length === 0
    ) {
      add(
        'warning',
        'no-sections',
        locale,
        `${paragraphs.length} paragraphs and no heading above level 1: nobody can find the part they came for`,
      );
    }

    let words = 0;
    for (const block of blocks) {
      const proseKeys = context.translatable[block.type] ?? [];
      if (block.type === 'Code') continue;
      for (const key of proseKeys) {
        const value = valueIn(page, context, locale, block, key);
        const plain = textOf(value);
        if (plain === '') continue;
        words += wordsIn(plain);
        styleFindings(plain, locale, block, add, context);
        if (block.type === 'Text' && key === 'body') {
          bodyFindings(value, locale, block, add, context);
        }
      }
    }

    // A page that is the parent of others is an index, and a short one is what
    // it is for.
    if (words < THIN_PAGE_WORDS && !page.hasChildren) {
      add(
        'warning',
        'thin-page',
        locale,
        `${words} words: a page this short is a signpost, and says so only to the reader who has already arrived`,
      );
    }
  }
  return findings;
}

function styleFindings(
  plain: string,
  locale: string,
  block: DocsBlock,
  add: (
    s: Severity,
    rule: string,
    locale: string,
    message: string,
    block?: DocsBlock,
  ) => void,
  context: CheckContext,
) {
  const rules = [...context.typography, ...(context.words[locale] ?? [])];
  for (const rule of rules) {
    if (new RegExp(rule.pattern, rule.flags).test(plain)) {
      add('warning', 'style', locale, `has ${rule.name}`, block);
    }
  }
  if (locale === 'en' && VAGUE_ENGLISH.test(plain)) {
    add(
      'warning',
      'vague-english',
      locale,
      'says “simply”, “just”, “easily”, “etc.” or “and so on”: either it is easy and there is no need to say so, or it is not',
      block,
    );
  }
}

function bodyFindings(
  html: string,
  locale: string,
  block: DocsBlock,
  add: (
    s: Severity,
    rule: string,
    locale: string,
    message: string,
    block?: DocsBlock,
  ) => void,
  context: CheckContext,
) {
  const paragraphs = html.split(/<\/p>/i).map(textOf).filter(Boolean);
  for (const paragraph of paragraphs) {
    const sentences = sentencesIn(paragraph);
    if (sentences > LONG_PARAGRAPH) {
      add(
        'warning',
        'long-paragraph',
        locale,
        `a paragraph of ${sentences} sentences (at most ${LONG_PARAGRAPH})`,
        block,
      );
    }
    if (/:\s[^.:]*,[^.:]*,[^.:]*,[^.:]*\./.test(paragraph)) {
      add(
        'warning',
        'list-as-sentence',
        locale,
        'a sentence that lists four things or more: it is a list',
        block,
      );
    }
  }
  const labels = context.labels[locale];
  if (labels) {
    for (const match of html.matchAll(/<strong>(.*?)<\/strong>/gi)) {
      const label = plainLabel(textOf(match[1] ?? ''));
      // Bold is also for a sentence that is emphasised: only a short one
      // that is not a sentence can be a button's name.
      if (label !== '' && !isEmphasis(label) && !labels.has(label)) {
        add(
          'warning',
          'ui-label',
          locale,
          `“${label}” is in bold and is not a text the editor shows in this language`,
          block,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reading the site

type Json = unknown;

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOf(value: Json, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what}: expected a string`);
  return value;
}

/** A label as it is compared: the editor writes ’ and “, a page may have typed ' and ". */
function plainLabel(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/…$|\.\.\.$/, '')
    .trim();
}

/** What bold is used for that is not a button's name: a sentence, a key on the keyboard, a term in the middle of a sentence. */
function isEmphasis(label: string): boolean {
  return (
    wordsIn(label) > 5 ||
    /[.!?:;]$/.test(label) ||
    /\+|[↑↓←→]|^(Cmd|Ctrl|Shift|Alt|Backspace|Enter|Esc|Tab|Space)\b/.test(
      label,
    ) ||
    !/^\p{Lu}/u.test(label)
  );
}

function flattenStrings(node: Json, into: Set<string>) {
  if (typeof node === 'string') into.add(plainLabel(node));
  else if (isRecord(node))
    for (const child of Object.values(node)) flattenStrings(child, into);
}

function toBlock(value: Json): DocsBlock {
  if (!isRecord(value)) throw new Error('a block is not an object');
  const children = Array.isArray(value['children'])
    ? value['children'].map(toBlock)
    : undefined;
  return {
    id: stringOf(value['id'], 'block id'),
    type: stringOf(value['type'], 'block type'),
    props: isRecord(value['props']) ? value['props'] : {},
    ...(children ? { children } : {}),
  };
}

function toFieldValues(value: Json): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!isRecord(value)) return out;
  for (const [id, fields] of Object.entries(value)) {
    if (!isRecord(fields)) continue;
    out[id] = {};
    for (const [key, text] of Object.entries(fields)) {
      if (typeof text === 'string') out[id][key] = text;
    }
  }
  return out;
}

async function getJson(
  api: string,
  path: string,
  cookie: string,
): Promise<Json> {
  const response = await fetch(api + path, { headers: { cookie } });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

async function login(api: string): Promise<string> {
  const email = process.env['KOMETIO_EMAIL'];
  const password = process.env['KOMETIO_PASSWORD'];
  if (!email || !password)
    throw new Error('Set KOMETIO_EMAIL and KOMETIO_PASSWORD');
  const response = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: process.env['KOMETIO_EDITOR_ORIGIN'] ?? 'http://localhost:4200',
    },
    body: JSON.stringify({
      email,
      password,
      captchaToken: await captchaTokenFrom(api),
    }),
  });
  if (!response.ok) throw new Error(`login: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

export async function readSite(
  api: string,
): Promise<{ pages: DocsPage[]; defaultLocale: string; locales: string[] }> {
  const cookie = await login(api);
  const site = await getJson(api, '/sites/current', cookie);
  if (!isRecord(site)) throw new Error('/sites/current: expected an object');
  const siteId = stringOf(site['id'], 'site id');
  const defaultLocale = stringOf(site['defaultLocale'], 'default locale');
  const enabled = Array.isArray(site['enabledLocales'])
    ? site['enabledLocales'].map((l) => stringOf(l, 'locale'))
    : [defaultLocale];

  const groups: Record<string, Json>[] = [];
  for (let page = 1; ; page += 1) {
    const result = await getJson(
      api,
      `/page-groups?siteId=${siteId}&page=${page}&pageSize=100`,
      cookie,
    );
    if (!isRecord(result) || !Array.isArray(result['items']))
      throw new Error('/page-groups: expected a page of items');
    for (const item of result['items']) if (isRecord(item)) groups.push(item);
    if (result['items'].length < 100) break;
  }

  const slugOf = new Map<string, string>();
  const parentOf = new Map<string, string | null>();
  for (const group of groups) {
    const id = stringOf(group['id'], 'group id');
    parentOf.set(
      id,
      typeof group['parentId'] === 'string' ? group['parentId'] : null,
    );
    const translations = Array.isArray(group['translations'])
      ? group['translations']
      : [];
    const own = translations.find(
      (t) => isRecord(t) && t['locale'] === defaultLocale,
    );
    if (isRecord(own)) slugOf.set(id, stringOf(own['slug'], 'slug'));
  }
  const pathOf = (id: string): string => {
    const parent = parentOf.get(id) ?? null;
    const own = slugOf.get(id) ?? id;
    return parent ? `${pathOf(parent)}/${own}` : own;
  };
  const parents = new Set(
    [...parentOf.values()].filter((id): id is string => id !== null),
  );

  const pages: DocsPage[] = [];
  for (const group of groups) {
    const id = stringOf(group['id'], 'group id');
    const full = await getJson(api, `/page-groups/${id}`, cookie);
    const translationsResponse = await getJson(
      api,
      `/page-groups/${id}/translations`,
      cookie,
    );
    const translations: Record<string, DocsTranslation> = {};
    for (const entry of Array.isArray(translationsResponse)
      ? translationsResponse
      : []) {
      if (!isRecord(entry)) continue;
      translations[stringOf(entry['locale'], 'locale')] = {
        slug: stringOf(entry['slug'], 'slug'),
        status: stringOf(entry['status'], 'status'),
        fieldValues: toFieldValues(entry['fieldValues']),
      };
    }
    pages.push({
      path: pathOf(id),
      hasChildren: parents.has(id),
      blocks:
        isRecord(full) && Array.isArray(full['content'])
          ? full['content'].map(toBlock)
          : [],
      translations,
    });
  }
  return { pages, defaultLocale, locales: enabled };
}

function readRules(): {
  typography: StyleRule[];
  words: Record<string, StyleRule[]>;
} {
  const rules: Json = JSON.parse(
    readFileSync(join(import.meta.dirname, 'locale-style-rules.json'), 'utf8'),
  );
  const asRules = (value: Json): StyleRule[] =>
    Array.isArray(value)
      ? value.flatMap((rule) =>
          isRecord(rule) &&
          typeof rule['name'] === 'string' &&
          typeof rule['pattern'] === 'string' &&
          typeof rule['flags'] === 'string'
            ? [
                {
                  name: rule['name'],
                  pattern: rule['pattern'],
                  flags: rule['flags'],
                },
              ]
            : [],
        )
      : [];
  if (!isRecord(rules) || !isRecord(rules['words']))
    throw new Error('locale-style-rules.json: unexpected shape');
  return {
    typography: asRules(rules['typography']),
    words: Object.fromEntries(
      Object.entries(rules['words']).map(([language, list]) => [
        language,
        asRules(list),
      ]),
    ),
  };
}

export function contextFor(
  defaultLocale: string,
  locales: string[],
): CheckContext {
  const root = join(import.meta.dirname, '..');
  const labels: Record<string, Set<string>> = {};
  for (const language of ['en', 'it']) {
    labels[language] = new Set();
    flattenStrings(
      JSON.parse(
        readFileSync(
          join(root, 'apps/editor-app/src/locales', `${language}.json`),
          'utf8',
        ),
      ),
      labels[language],
    );
  }
  const translatable: Record<string, string[]> = {};
  for (const block of pageBlocks) {
    translatable[block.type] = block.fields
      .filter((field) => 'translatable' in field && field.translatable === true)
      .map((field) => field.key);
  }
  const { typography, words } = readRules();
  return { defaultLocale, locales, translatable, labels, typography, words };
}

function report(findings: Finding[], pages: number): string {
  const byPage = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.where.split(' [')[0] ?? finding.where;
    byPage.set(key, [...(byPage.get(key) ?? []), finding]);
  }
  const lines: string[] = [];
  for (const [page, list] of byPage) {
    lines.push(page);
    // One line a rule: the count, the first place and what it says. All of
    // them are in --json.
    const byRule = new Map<string, Finding[]>();
    for (const finding of list)
      byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding]);
    for (const [rule, same] of byRule) {
      const [first] = same;
      if (!first) continue;
      const mark = first.severity === 'error' ? '✖' : '!';
      const times = same.length > 1 ? ` ×${same.length}` : '';
      lines.push(
        `  ${mark} ${rule}${times}: ${first.where.slice(page.length + 1)} — ${first.message}`,
      );
    }
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const rules = new Map<string, number>();
  for (const finding of findings)
    rules.set(finding.rule, (rules.get(finding.rule) ?? 0) + 1);
  lines.push(
    '',
    `${pages} pages: ${errors} errors, ${findings.length - errors} warnings`,
  );
  for (const [rule, count] of [...rules].sort((a, b) => b[1] - a[1]))
    lines.push(`  ${String(count).padStart(5)}  ${rule}`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const apiFlag = process.argv.indexOf('--api');
  const api =
    apiFlag >= 0 ? process.argv[apiFlag + 1] : process.env['KOMETIO_API_URL'];
  if (!api) {
    console.error(
      'Name the API: --api http://localhost:3000/api (or KOMETIO_API_URL)',
    );
    process.exit(2);
  }
  const { pages, defaultLocale, locales } = await readSite(api);
  const context = contextFor(defaultLocale, locales);
  const published = pages.filter(
    (page) => page.translations[defaultLocale]?.status === 'published',
  );
  const findings = published.flatMap((page) => findingsFor(page, context));
  console.log(
    process.argv.includes('--json')
      ? JSON.stringify(
          {
            pages: published.length,
            drafts: pages.length - published.length,
            findings,
          },
          null,
          2,
        )
      : `${report(findings, published.length)}\n  (${pages.length - published.length} draft pages are not checked)`,
  );
  process.exit(
    findings.some((finding) => finding.severity === 'error') ? 1 : 0,
  );
}
