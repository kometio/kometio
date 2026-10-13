import { beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidRedirectError,
  LocaleNotEnabledError,
  PageGroupNotFoundError,
  Redirect,
  RedirectLimitReachedError,
  RedirectNotFoundError,
  RedirectSourceTakenError,
} from '@kometio/domain-core';
import { REDIRECT_LIMITS } from '@kometio/shared-types';
import {
  FakeRedirectTraffic,
  InMemoryCollectionRepository,
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
import { createRedirect } from './create-redirect.use-case';
import { deleteRedirect } from './delete-redirect.use-case';
import { importRedirects } from './import-redirects.use-case';
import { listRedirects } from './list-redirects.use-case';
import { dismissMissingPath, listMissingPaths } from './missing-paths.use-case';
import { publishPageTranslation } from './publish-page-translation.use-case';
import { renamePageTranslation } from './rename-page-translation.use-case';
import { resolveRedirect } from './resolve-redirect.use-case';
import { testRedirectAddress } from './test-redirect-address.use-case';
import { updateRedirect } from './update-redirect.use-case';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
  const pageTranslationVersionRepository =
    new InMemoryPageTranslationVersionRepository();
  const redirectRepository = new InMemoryRedirectRepository();
  const traffic = new FakeRedirectTraffic();
  const siteRepository = new InMemorySiteRepository(
    buildSite({
      id: siteId,
      tenantId,
      domain: 'example.com',
      defaultLocale: 'en',
      enabledLocales: ['en', 'it'],
    }),
  );
  return {
    redirectRepository,
    collectionRepository: new InMemoryCollectionRepository(),
    missingPathRepository: new InMemoryMissingPathRepository(),
    siteRepository,
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
    traffic,
  };
}
type Deps = ReturnType<typeof setup>;

async function seedPage(
  deps: Deps,
  slug: string,
  options: {
    locale?: string;
    parentGroupId?: string | null;
    publish?: boolean;
  } = {},
) {
  const group = await createPageGroup(deps, {
    tenantId,
    siteId,
    parentId: options.parentGroupId ?? null,
    createdBy: 'user-1',
  });
  const translation = await createPageGroupTranslation(deps, {
    tenantId,
    pageGroupId: group.id,
    locale: options.locale ?? 'en',
    slug,
    seoMeta: { title: `Title of ${slug}`, description: '' },
    createdBy: 'user-1',
  });
  if (options.publish !== false) {
    await publishPageTranslation(deps, {
      tenantId,
      pageTranslationId: translation.id,
      actorUserId: null,
    });
  }
  return { group, translation };
}

const toUrl = (url: string) => ({ kind: 'url' as const, url });

async function rule(
  deps: Deps,
  from: string,
  to: Parameters<typeof createRedirect>[1]['to'],
  status: 301 | 302 | 410 = 301,
) {
  return createRedirect(deps, {
    tenantId,
    siteId,
    from,
    to,
    status,
    createdBy: 'user-1',
  });
}

const ask = (
  deps: Deps,
  pathname: string,
  search = '',
  domain = 'example.com',
) => resolveRedirect(deps, { tenantId, domain, pathname, search });

describe('createRedirect', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  it('stores the rule, with the old address read as a pasted link', async () => {
    const created = await rule(
      deps,
      'https://old-site.com/2019/05/Old-Post/',
      toUrl('/en/post'),
    );

    expect(created.source).toEqual({ path: '/2019/05/old-post', query: '' });
    expect(
      await deps.redirectRepository.findById(tenantId, created.id),
    ).not.toBeNull();
  });

  it('stores a path that is a page of the site as that page, so that renaming it does not break the rule', async () => {
    const { group } = await seedPage(deps, 'news');
    const child = await seedPage(deps, 'post', {
      parentGroupId: group.id,
    });

    const created = await rule(deps, '/old', toUrl('/en/news/post'));

    expect(created.target).toEqual({
      kind: 'page',
      pageGroupId: child.group.id,
      locale: 'en',
    });
  });

  it('keeps an address that is not a page of the site as an address', async () => {
    const created = await rule(deps, '/old', toUrl('/en/nothing-here'));

    expect(created.target).toEqual({ kind: 'url', url: '/en/nothing-here' });
  });

  it('takes the site’s own address, with its scheme, as a path of the site', async () => {
    const { group } = await seedPage(deps, 'about');

    const created = await rule(
      deps,
      '/old',
      toUrl('https://www.example.com/en/about'),
    );

    expect(created.target).toMatchObject({
      kind: 'page',
      pageGroupId: group.id,
    });
  });

  it('holds a page chosen, checked to be a page of this site in a language it has', async () => {
    const { group } = await seedPage(deps, 'about');

    const created = await rule(deps, '/old', {
      kind: 'page',
      pageGroupId: group.id,
      locale: 'it',
    });
    expect(created.target).toEqual({
      kind: 'page',
      pageGroupId: group.id,
      locale: 'it',
    });

    await expect(
      rule(deps, '/other', { kind: 'page', pageGroupId: 'nope', locale: 'en' }),
    ).rejects.toBeInstanceOf(PageGroupNotFoundError);
    await expect(
      rule(deps, '/third', {
        kind: 'page',
        pageGroupId: group.id,
        locale: 'fr',
      }),
    ).rejects.toBeInstanceOf(LocaleNotEnabledError);
  });

  it('refuses a second rule for one address', async () => {
    await rule(deps, '/old', toUrl('/a'));

    await expect(rule(deps, '/OLD/', toUrl('/b'))).rejects.toBeInstanceOf(
      RedirectSourceTakenError,
    );
  });

  it('refuses a circle, and names the target', async () => {
    await rule(deps, '/a', toUrl('/b'));

    await expect(rule(deps, '/b', toUrl('/a'))).rejects.toMatchObject({
      name: 'InvalidRedirectError',
      side: 'target',
      problem: 'loop',
    });
  });

  it('refuses what cannot work, as the entity says', async () => {
    await expect(rule(deps, '/api/forms', toUrl('/x'))).rejects.toBeInstanceOf(
      InvalidRedirectError,
    );
    await expect(rule(deps, '/old', toUrl('/old'))).rejects.toBeInstanceOf(
      InvalidRedirectError,
    );
  });

  it('refuses the rule that would be one too many for a site', async () => {
    for (let index = 0; index < REDIRECT_LIMITS.rulesPerSite; index += 1) {
      await deps.redirectRepository.add(
        Redirect.create({
          id: `r-${index}`,
          tenantId,
          siteId,
          from: `/old-${index}`,
          to: toUrl('/x'),
          status: 301,
          origin: 'list',
          createdBy: null,
        }),
      );
    }

    await expect(rule(deps, '/one-more', toUrl('/x'))).rejects.toBeInstanceOf(
      RedirectLimitReachedError,
    );
  });

  it('takes the address off the list of what visitors did not find', async () => {
    await deps.missingPathRepository.record([
      { tenantId, siteId, path: '/old', hits: 4, at: new Date() },
    ]);

    await rule(deps, '/old', toUrl('/new'));

    expect(deps.missingPathRepository.all()).toEqual([]);
  });
});

describe('updateRedirect and deleteRedirect', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  it('changes where it goes, and the visitor is sent there at once', async () => {
    const created = await rule(deps, '/old', toUrl('/a'));
    expect(await ask(deps, '/old')).toMatchObject({ location: '/a' });

    await updateRedirect(deps, {
      tenantId,
      redirectId: created.id,
      to: toUrl('/b'),
      status: 302,
    });

    expect(await ask(deps, '/old')).toEqual({
      outcome: 'redirect',
      status: 302,
      location: '/b',
    });
  });

  it('moves a rule to another old address', async () => {
    const created = await rule(deps, '/old', toUrl('/a'));

    await updateRedirect(deps, {
      tenantId,
      redirectId: created.id,
      from: '/older',
      to: toUrl('/a'),
      status: 301,
    });

    expect(await ask(deps, '/old')).toBeNull();
    expect(await ask(deps, '/older')).toMatchObject({ location: '/a' });
  });

  it('can say an address is gone', async () => {
    const created = await rule(deps, '/old', toUrl('/a'));

    await updateRedirect(deps, {
      tenantId,
      redirectId: created.id,
      to: null,
      status: 410,
    });

    expect(await ask(deps, '/old')).toEqual({ outcome: 'gone' });
  });

  it('does not find a rule that is not there', async () => {
    await expect(
      updateRedirect(deps, {
        tenantId,
        redirectId: 'nope',
        to: toUrl('/a'),
        status: 301,
      }),
    ).rejects.toBeInstanceOf(RedirectNotFoundError);
    await expect(
      deleteRedirect(deps, { tenantId, redirectId: 'nope' }),
    ).rejects.toBeInstanceOf(RedirectNotFoundError);
  });

  it('stops answering when it is deleted', async () => {
    const created = await rule(deps, '/old', toUrl('/a'));
    expect(await ask(deps, '/old')).not.toBeNull();

    await deleteRedirect(deps, { tenantId, redirectId: created.id });

    expect(await ask(deps, '/old')).toBeNull();
  });
});

describe('resolveRedirect', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  it('answers an address with a rule, and counts the visit', async () => {
    const created = await rule(deps, '/2019/05/old', toUrl('/en/new'));

    const answer = await ask(deps, '/2019/05/Old/');

    expect(answer).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/en/new',
    });
    expect(deps.traffic.hits).toEqual([{ tenantId, redirectId: created.id }]);
    expect(deps.traffic.misses).toEqual([]);
  });

  it('sends to the page a rule holds, at the address it has now', async () => {
    const parent = await seedPage(deps, 'blog');
    const post = await seedPage(deps, 'my-post', {
      parentGroupId: parent.group.id,
    });
    await rule(deps, '/?p=123', {
      kind: 'page',
      pageGroupId: post.group.id,
      locale: 'en',
    });

    expect(await ask(deps, '/', '?p=123')).toMatchObject({
      location: '/en/blog/my-post',
    });

    // Renamed: the rule still goes to the page, at its new address.
    await renamePageTranslation(deps, {
      tenantId,
      pageTranslationId: post.translation.id,
      slug: 'renamed-post',
      parentGroupId: parent.group.id,
      actorUserId: null,
    });
    deps.ruleSets.invalidate(siteId);

    expect(await ask(deps, '/', '?p=123')).toMatchObject({
      location: '/en/blog/renamed-post',
    });
  });

  it('answers the front door with a number, and keeps what else the link carried', async () => {
    await rule(deps, '/?p=123', toUrl('/en/post'));

    const answer = await ask(deps, '/', '?p=123&utm_source=mail');

    expect(answer).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/en/post?utm_source=mail',
    });
  });

  it('answers a pattern with what it took, where that is a page', async () => {
    const blog = await seedPage(deps, 'blog');
    await seedPage(deps, 'my-post', { parentGroupId: blog.group.id });
    await rule(deps, '/:year/:month/:slug', toUrl('/en/blog/:slug'));

    expect(await ask(deps, '/2019/05/My-Post')).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/en/blog/my-post',
    });
  });

  // `/:year/:month/:slug` matches `/en/blog/x` too. Where x is a page the
  // site serves it and the rule is not asked; where it is not, sending the
  // visitor there would send them to the same rule, round and round.
  it('does not send a visitor round in a circle where a pattern matches its own output', async () => {
    await rule(deps, '/:year/:month/:slug', toUrl('/en/blog/:slug'));

    expect(await ask(deps, '/2019/05/not-a-page')).toBeNull();
    expect(await ask(deps, '/en/blog/not-a-page')).toBeNull();
  });

  it('answers with one redirect where the target is itself redirected', async () => {
    await rule(deps, '/a', toUrl('/b'));
    await rule(deps, '/b', toUrl('/c'));
    await rule(deps, '/c', toUrl('/en/final'));

    expect(await ask(deps, '/a')).toEqual({
      outcome: 'redirect',
      status: 301,
      location: '/en/final',
    });
  });

  it('is temporary when any step of the chain is', async () => {
    await rule(deps, '/a', toUrl('/b'), 302);
    await rule(deps, '/b', toUrl('/en/final'));

    expect(await ask(deps, '/a')).toMatchObject({ status: 302 });
  });

  it('says gone, and counts it', async () => {
    const created = await rule(deps, '/removed', null, 410);

    expect(await ask(deps, '/removed')).toEqual({ outcome: 'gone' });
    expect(deps.traffic.hits).toEqual([{ tenantId, redirectId: created.id }]);
  });

  it('answers nothing for a page that is not published, and counts the address as not found', async () => {
    const draft = await seedPage(deps, 'draft', { publish: false });
    await rule(deps, '/old', {
      kind: 'page',
      pageGroupId: draft.group.id,
      locale: 'en',
    });

    expect(await ask(deps, '/old')).toBeNull();
    expect(deps.traffic.misses).toEqual([{ tenantId, siteId, path: '/old' }]);
  });

  it('counts what has no rule, and not what only bots ask for', async () => {
    expect(await ask(deps, '/some/lost/page')).toBeNull();
    expect(await ask(deps, '/wp-login.php')).toBeNull();
    expect(await ask(deps, '/.env')).toBeNull();

    expect(deps.traffic.misses.map((miss) => miss.path)).toEqual([
      '/some/lost/page',
    ]);
  });

  it('keeps a front door with a campaign tag out of the list, and a number in it', async () => {
    await ask(deps, '/', '?utm_source=mail');
    await ask(deps, '/', '?p=999');

    expect(deps.traffic.misses.map((miss) => miss.path)).toEqual(['/?p=999']);
  });

  it('knows no site by another name', async () => {
    await rule(deps, '/old', toUrl('/new'));

    expect(await ask(deps, '/old', '', 'someone-else.test')).toBeNull();
  });

  it('reads the rules once for a flood of requests', async () => {
    await rule(deps, '/old', toUrl('/new'));
    const before = deps.redirectRepository.listBySiteCalls;

    await Promise.all([
      ask(deps, '/nothing-1'),
      ask(deps, '/nothing-2'),
      ask(deps, '/nothing-3'),
    ]);
    await ask(deps, '/nothing-4');

    // `createRedirect` itself read it once; the cache read it once more.
    expect(
      deps.redirectRepository.listBySiteCalls - before,
    ).toBeLessThanOrEqual(1);
  });
});

describe('testRedirectAddress', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  const test = (address: string) =>
    testRedirectAddress(deps, { tenantId, siteId, address });

  it('says a page answers at an address, and that a rule there would not be asked', async () => {
    await seedPage(deps, 'about');
    await rule(deps, '/en/about', toUrl('/elsewhere'));

    expect(await test('https://example.com/en/about')).toEqual({
      outcome: 'page',
      path: '/en/about',
    });
  });

  it('says where an old address goes', async () => {
    const created = await rule(deps, '/old', toUrl('/en/new'));

    const result = await test('/old?utm_source=mail');

    expect(result).toMatchObject({
      outcome: 'redirect',
      status: 301,
      location: '/en/new?utm_source=mail',
    });
    expect(result.outcome === 'redirect' && result.rule.id).toBe(created.id);
  });

  it('reads `?p=123` as the front door asked it', async () => {
    await rule(deps, '/?p=5', toUrl('/en/five'));

    expect(await test('?p=5')).toMatchObject({
      outcome: 'redirect',
      location: '/en/five',
    });
  });

  it('says there is nothing', async () => {
    expect(await test('/en/nothing')).toEqual({ outcome: 'none' });
  });
});

describe('listRedirects', () => {
  it('says what page a rule goes to, and whether it answers', async () => {
    const deps = setup();
    const live = await seedPage(deps, 'about');
    const draft = await seedPage(deps, 'soon', { publish: false });
    await rule(deps, '/a', {
      kind: 'page',
      pageGroupId: live.group.id,
      locale: 'en',
    });
    await rule(deps, '/b', {
      kind: 'page',
      pageGroupId: draft.group.id,
      locale: 'en',
    });
    await rule(deps, '/c', toUrl('/elsewhere'));

    const result = await listRedirects(deps, {
      tenantId,
      siteId,
      filter: {},
      page: 1,
      pageSize: 50,
    });

    const byFrom = Object.fromEntries(
      result.items.map((item) => [item.redirect.source.path, item.page]),
    );
    expect(byFrom['/a']).toEqual({
      title: 'Title of about',
      path: '/en/about',
      isPublished: true,
    });
    expect(byFrom['/b']).toEqual({
      title: 'Title of soon',
      path: null,
      isPublished: false,
    });
    expect(byFrom['/c']).toBeNull();
    expect(result.total).toBe(3);
  });
});

describe('missing paths', () => {
  it('lists what was not found and dismisses what is not worth a rule', async () => {
    const deps = setup();
    await deps.missingPathRepository.record([
      { tenantId, siteId, path: '/lost', hits: 3, at: new Date() },
    ]);

    const before = await listMissingPaths(deps, {
      tenantId,
      siteId,
      page: 1,
      pageSize: 20,
    });
    expect(before.items.map((item) => item.path)).toEqual(['/lost']);

    await dismissMissingPath(deps, {
      tenantId,
      missingPathId: before.items[0]?.id ?? '',
    });

    const after = await listMissingPaths(deps, {
      tenantId,
      siteId,
      page: 1,
      pageSize: 20,
    });
    expect(after.items).toEqual([]);
  });
});

describe('importRedirects', () => {
  let deps: Deps;
  beforeEach(() => {
    deps = setup();
  });

  const run = (csv: string, dryRun = false) =>
    importRedirects(deps, {
      tenantId,
      siteId,
      csv,
      dryRun,
      createdBy: 'user-1',
    });

  it('creates what is new, and says so line by line', async () => {
    const report = await run('from,to\n/old-a,/en/a\n/old-b,/en/b\n');

    expect(report).toMatchObject({
      created: 2,
      updated: 0,
      failed: 0,
      applied: true,
    });
    expect(report.rows.map((row) => [row.line, row.outcome])).toEqual([
      [2, 'created'],
      [3, 'created'],
    ]);
    expect(await ask(deps, '/old-a')).toMatchObject({ location: '/en/a' });
  });

  it('is the same site when the same file is imported again', async () => {
    const csv = 'from,to\n/old-a,/en/a\n';
    await run(csv);

    const again = await run(csv);

    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  });

  it('changes where an address goes when the file says another place', async () => {
    await run('from,to\n/old-a,/en/a\n');

    const report = await run('from,to\n/old-a,/en/other\n');

    expect(report).toMatchObject({ created: 0, updated: 1 });
    expect(await ask(deps, '/old-a')).toMatchObject({ location: '/en/other' });
  });

  it('judges a dry run as the real one and writes nothing', async () => {
    const csv = 'from,to\n/old-a,/en/a\n,/en/b\n/old-c,\n';

    const dry = await run(csv, true);

    expect(dry).toMatchObject({ created: 1, failed: 2, applied: false });
    expect(await deps.redirectRepository.listBySite(tenantId, siteId)).toEqual(
      [],
    );
  });

  it('names the line and the reason of a row it cannot use, and does the others', async () => {
    const report = await run(
      'from,to,status\n/api/x,/en/a,301\n/good,/en/g,301\n/loop,/loop,301\n/bad,javascript:alert(1),301\n',
    );

    const byLine = Object.fromEntries(
      report.rows.map((row) => [row.line, row]),
    );
    expect(byLine[2]).toMatchObject({
      outcome: 'error',
      side: 'source',
      problem: 'reserved',
    });
    expect(byLine[3]).toMatchObject({ outcome: 'created' });
    expect(byLine[4]).toMatchObject({
      outcome: 'error',
      side: 'target',
      problem: 'same-as-source',
    });
    expect(byLine[5]).toMatchObject({
      outcome: 'error',
      side: 'target',
      problem: 'unsafe',
    });
    expect(report.created).toBe(1);
  });

  it('stores a path that is a page as that page', async () => {
    const { group } = await seedPage(deps, 'about');

    await run('from,to\n/old-about,/en/about\n');

    const stored = await deps.redirectRepository.findBySource(
      tenantId,
      siteId,
      { path: '/old-about', query: '' },
    );
    expect(stored?.target).toEqual({
      kind: 'page',
      pageGroupId: group.id,
      locale: 'en',
    });
  });

  it('refuses a circle that the file makes by itself', async () => {
    const report = await run('from,to\n/a,/b\n/b,/a\n');

    expect(report.failed).toBeGreaterThan(0);
    expect(report.rows.every((row) => row.outcome === 'error')).toBe(true);
    expect(await deps.redirectRepository.listBySite(tenantId, siteId)).toEqual(
      [],
    );
  });

  it('says gone with no destination', async () => {
    const report = await run('from,to,status\n/removed,,410\n');

    expect(report.created).toBe(1);
    expect(await ask(deps, '/removed')).toEqual({ outcome: 'gone' });
  });
});
