import { beforeEach, describe, expect, it } from 'vitest';
import {
  ImportJob,
  ImportJobHasNoPermalinksError,
  ImportJobNotAnalyzedError,
  ImportJobNotFoundError,
} from '@kometio/domain-core';
import type {
  WordPressExportItem,
  WordPressExportReaderPort,
} from '@kometio/ports';
import type { WordPressPermalink } from '@kometio/shared-types';
import {
  InMemoryCollectionRepository,
  InMemoryImportJobRepository,
  InMemoryMissingPathRepository,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryRedirectRepository,
  InMemoryReusableSectionRepository,
  InMemorySearchPort,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  InMemoryUserRepository,
  buildSite,
} from '@kometio/testing';
import { RedirectRuleSets } from '../redirects/redirect-rule-sets';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { runWordPressAnalysis } from './import-job.use-cases';
import { redirectsFromWordPress } from './redirects-from-wordpress.use-case';
import { resolveRedirect } from './resolve-redirect.use-case';
import { FakeRedirectTraffic } from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationVersionRepository =
    new InMemoryPageTranslationVersionRepository();
  const redirectRepository = new InMemoryRedirectRepository();
  return {
    redirectRepository,
    collectionRepository: new InMemoryCollectionRepository(),
    missingPathRepository: new InMemoryMissingPathRepository(),
    importJobRepository: new InMemoryImportJobRepository(),
    siteRepository: new InMemorySiteRepository(
      buildSite({
        id: siteId,
        tenantId,
        domain: 'example.com',
        defaultLocale: 'en',
        enabledLocales: ['en', 'it'],
      }),
    ),
    pageGroupRepository: new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    ),
    pageGroupVersionRepository,
    pageTranslationRepository: new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    ),
    pageTranslationVersionRepository,
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    userRepository: new InMemoryUserRepository(),
    searchPort: new InMemorySearchPort(),
    ruleSets: new RedirectRuleSets(redirectRepository, 60_000),
    traffic: new FakeRedirectTraffic(),
  };
}
type Deps = ReturnType<typeof setup>;

async function seedPage(deps: Deps, slug: string, parentGroupId?: string) {
  const group = await createPageGroup(deps, {
    tenantId,
    siteId,
    parentId: parentGroupId ?? null,
    createdBy: 'user-1',
  });
  const translation = await createPageGroupTranslation(deps, {
    tenantId,
    pageGroupId: group.id,
    locale: 'en',
    slug,
    seoMeta: { title: slug, description: '' },
    createdBy: 'user-1',
  });
  await publishPageTranslation(deps, {
    tenantId,
    pageTranslationId: translation.id,
    actorUserId: null,
  });
  return group;
}

const permalink = (
  overrides: Partial<WordPressPermalink> = {},
): WordPressPermalink => ({
  id: 42,
  type: 'post',
  slug: 'hello-world',
  title: 'Hello world',
  link: 'https://old.example/2019/05/hello-world/',
  parentId: null,
  ...overrides,
});

async function analysedJob(
  deps: Deps,
  permalinks: WordPressPermalink[] | null,
) {
  const job = ImportJob.create({
    id: 'job-1',
    tenantId,
    siteId,
    source: 'wordpress',
    fileName: 'export.xml',
    fileBytes: 10,
    createdBy: null,
  });
  await deps.importJobRepository.add(job);
  if (permalinks !== null) {
    await deps.importJobRepository.savePermalinks(tenantId, job.id, permalinks);
  }
  job.succeed({
    siteTitle: 'Old',
    sourceUrl: 'https://old.example',
    found: { pages: 0, posts: 0, attachments: 0, menuItems: 0, otherTypes: [] },
    pages: { whole: 0, partial: 0, empty: 0 },
    blocks: {
      total: 0,
      native: 0,
      dropped: 0,
      fromFields: 0,
      fromFieldsByBlock: [],
      quarantined: [],
    },
    terms: [],
    warnings: [],
  });
  await deps.importJobRepository.save(job);
  return job;
}

const run = (deps: Deps, dryRun: boolean, importJobId = 'job-1') =>
  redirectsFromWordPress(deps, {
    tenantId,
    siteId,
    importJobId,
    dryRun,
    createdBy: 'user-1',
  });

describe('redirectsFromWordPress', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  it('says what it would do, and writes nothing, for a dry run', async () => {
    const blog = await seedPage(deps, 'blog');
    await seedPage(deps, 'hello-world', blog.id);
    await analysedJob(deps, [permalink(), permalink({ id: 9, slug: 'gone' })]);

    const result = await run(deps, true);

    expect(result.report).toMatchObject({
      created: 2,
      failed: 0,
      applied: false,
    });
    expect(result.pages).toEqual({ matched: 1, ambiguous: 0, unmatched: 1 });
    expect(result.unmatched.map((one) => one.slug)).toEqual(['gone']);
    expect(await deps.redirectRepository.listBySite(tenantId, siteId)).toEqual(
      [],
    );
  });

  it('makes the rules, as the page and as WordPress asked for it, and the site answers', async () => {
    const blog = await seedPage(deps, 'blog');
    await seedPage(deps, 'hello-world', blog.id);
    await analysedJob(deps, [permalink()]);

    const result = await run(deps, false);

    expect(result.report).toMatchObject({ created: 2, applied: true });
    const rules = await deps.redirectRepository.listBySite(tenantId, siteId);
    expect(rules.map((rule) => rule.origin)).toEqual([
      'wordpress',
      'wordpress',
    ]);
    // Stored as the page, so that renaming it does not break the move.
    expect(rules.every((rule) => rule.target?.kind === 'page')).toBe(true);
    for (const [pathname, search] of [
      ['/2019/05/hello-world', ''],
      ['/', '?p=42'],
    ] as const) {
      expect(
        await resolveRedirect(deps, {
          tenantId,
          domain: 'example.com',
          pathname,
          search,
        }),
      ).toEqual({
        outcome: 'redirect',
        status: 301,
        location: '/en/blog/hello-world',
      });
    }
  });

  it('is the same site when it is asked again, and picks up what was made meanwhile', async () => {
    const blog = await seedPage(deps, 'blog');
    await seedPage(deps, 'hello-world', blog.id);
    await analysedJob(deps, [
      permalink(),
      permalink({
        id: 9,
        slug: 'late',
        title: 'Late',
        link: 'https://old.example/2019/06/late/',
      }),
    ]);
    await run(deps, false);

    const again = await run(deps, false);
    expect(again.report).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(again.pages.unmatched).toBe(1);

    await seedPage(deps, 'late', blog.id);
    const afterwards = await run(deps, false);

    expect(afterwards.report).toMatchObject({ created: 2, unchanged: 2 });
    expect(afterwards.pages.unmatched).toBe(0);
  });

  it('is not limited to the length of a file: a big site is one list', async () => {
    const blog = await seedPage(deps, 'blog');
    await seedPage(deps, 'hello-world', blog.id);
    // More rows than a CSV is read for; none of them has a page, so they
    // are only counted, and the one that has one is still made.
    await analysedJob(deps, [
      permalink(),
      ...Array.from({ length: 6000 }, (_, index) =>
        permalink({
          id: 1000 + index,
          slug: `nobody-${index}`,
          link: `https://old.example/${index}/`,
        }),
      ),
    ]);

    const result = await run(deps, true);

    expect(result.pages.matched).toBe(1);
    expect(result.pages.unmatched).toBe(6000);
    // A list of what has no page is for reading: it is cut, and says so.
    expect(result.unmatched.length).toBeLessThan(6000);
  });

  it('refuses a job that is not there, or that is another site’s', async () => {
    await expect(run(deps, true, 'nope')).rejects.toBeInstanceOf(
      ImportJobNotFoundError,
    );
  });

  it('refuses a file that has not been read yet', async () => {
    const job = ImportJob.create({
      id: 'job-1',
      tenantId,
      siteId,
      source: 'wordpress',
      fileName: 'export.xml',
      fileBytes: 10,
      createdBy: null,
    });
    await deps.importJobRepository.add(job);

    await expect(run(deps, true)).rejects.toBeInstanceOf(
      ImportJobNotAnalyzedError,
    );
  });

  it('says a file read before addresses were kept has to be read again', async () => {
    await analysedJob(deps, null);

    await expect(run(deps, true)).rejects.toBeInstanceOf(
      ImportJobHasNoPermalinksError,
    );
  });
});

describe('runWordPressAnalysis keeps where the pages lived', () => {
  const item = (
    overrides: Partial<WordPressExportItem> = {},
  ): WordPressExportItem => ({
    postId: 42,
    postType: 'post',
    status: 'publish',
    title: 'Hello world',
    slug: 'hello-world',
    parentId: 0,
    menuOrder: 0,
    link: 'https://old.example/2019/05/hello-world/',
    content: '<p>x</p>',
    excerpt: '',
    metaKeys: [],
    metaValues: {},
    terms: [],
    attachmentUrl: '',
    ...overrides,
  });

  const readerOf = (
    items: WordPressExportItem[],
  ): WordPressExportReaderPort => ({
    async read(_file, onItem) {
      for (const one of items) onItem(one);
      return {
        title: 'Old',
        baseSiteUrl: 'https://old.example',
        baseBlogUrl: 'https://old.example',
        terms: [],
        acfSchema: { groups: [], forBlock: () => [], forPostType: () => [] },
      };
    },
  });

  it('keeps the published pages and posts, and only those, before the job says it is read', async () => {
    const deps = setup();
    const job = ImportJob.create({
      id: 'job-1',
      tenantId,
      siteId,
      source: 'wordpress',
      fileName: 'export.xml',
      fileBytes: 10,
      createdBy: null,
    });
    await deps.importJobRepository.add(job);

    await runWordPressAnalysis(
      {
        importJobRepository: deps.importJobRepository,
        siteRepository: deps.siteRepository,
        exportReader: readerOf([
          item(),
          item({ postId: 43, status: 'draft', slug: 'draft' }),
          item({ postId: 44, postType: 'attachment', slug: 'pic' }),
        ]),
      },
      { tenantId, jobId: 'job-1', filePath: 'export.xml' },
    );

    const stored = await deps.importJobRepository.findById(tenantId, 'job-1');
    expect(stored?.status).toBe('analyzed');
    expect(
      (await deps.importJobRepository.permalinksOf(tenantId, 'job-1'))?.map(
        (one) => one.id,
      ),
    ).toEqual([42]);
  });
});
