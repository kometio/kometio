import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  Redirect,
  RedirectNotFoundError,
  RedirectSourceTakenError,
} from '@kometio/domain-core';
import {
  type KometioDb,
  createAppDb,
  pageGroups,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { MAX_MISSING_PATHS } from '@kometio/ports';
import { DrizzleMissingPathRepository } from './drizzle-missing-path.repository';
import { DrizzleRedirectRepository } from './drizzle-redirect.repository';

/**
 * Runs against a real Postgres (docs/development.md). Connects as
 * `kometio_app`, as production does, so it is also the isolation test.
 */
describe('Redirect repositories (integration)', () => {
  let db: KometioDb;
  let redirectsRepo: DrizzleRedirectRepository;
  let missingRepo: DrizzleMissingPathRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;
  let siteBId: string;

  beforeAll(async () => {
    db = createAppDb();
    redirectsRepo = new DrizzleRedirectRepository(db);
    missingRepo = new DrizzleMissingPathRepository(db);
    tenantAId = await createIntegrationTenant(db, 'Redirects Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Redirects Tenant B');
    siteAId = await createIntegrationSite(db, tenantAId);
    siteBId = await createIntegrationSite(db, tenantBId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  const build = (
    from: string,
    to: Parameters<typeof Redirect.create>[0]['to'],
    overrides: Partial<Parameters<typeof Redirect.create>[0]> = {},
  ) =>
    Redirect.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      from,
      to,
      status: 301,
      origin: 'manual',
      createdBy: null,
      ...overrides,
    });
  const url = (value: string) => ({ kind: 'url' as const, url: value });

  describe('redirects', () => {
    it('saves a rule and reads it back by id and by source, scoped to its tenant', async () => {
      const redirect = build('/2019/05/Old-Post', url('/en/post'));
      await redirectsRepo.add(redirect);

      const byId = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(byId?.source).toEqual({ path: '/2019/05/old-post', query: '' });
      expect(byId?.target).toEqual({ kind: 'url', url: '/en/post' });
      expect(byId?.status).toBe(301);

      const bySource = await redirectsRepo.findBySource(
        tenantAId,
        siteAId,
        redirect.source,
      );
      expect(bySource?.id).toBe(redirect.id);

      expect(await redirectsRepo.findById(tenantBId, redirect.id)).toBeNull();
    });

    it('keeps a rule that asks by query apart from the same path without one', async () => {
      const plain = build('/shop', url('/en/shop'));
      const asked = build('/shop?cat=1', url('/en/shop/one'));
      await redirectsRepo.add(plain);
      await redirectsRepo.add(asked);

      expect(
        (await redirectsRepo.findBySource(tenantAId, siteAId, asked.source))
          ?.id,
      ).toBe(asked.id);
    });

    it('refuses a second rule for one address, as a domain error', async () => {
      await redirectsRepo.add(build('/taken', url('/a')));

      await expect(
        redirectsRepo.add(build('/taken', url('/b'))),
      ).rejects.toBeInstanceOf(RedirectSourceTakenError);
    });

    it('lets two sites each have a rule for the same address', async () => {
      const first = build('/shared', url('/a'));
      const second = build('/shared', url('/b'), {
        tenantId: tenantBId,
        siteId: siteBId,
      });

      await redirectsRepo.add(first);
      await expect(redirectsRepo.add(second)).resolves.toBeUndefined();
    });

    it('writes a changed rule back, and says so for one that is gone', async () => {
      const redirect = build('/to-change', url('/a'));
      await redirectsRepo.add(redirect);
      redirect.redirectTo(url('/b'), 302);

      await redirectsRepo.save(redirect);

      const found = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(found?.target).toEqual({ kind: 'url', url: '/b' });
      expect(found?.status).toBe(302);

      await redirectsRepo.delete(tenantAId, redirect.id);
      await expect(redirectsRepo.save(redirect)).rejects.toBeInstanceOf(
        RedirectNotFoundError,
      );
    });

    it('holds a gone rule with no target', async () => {
      const redirect = build('/removed', null, { status: 410 });
      await redirectsRepo.add(redirect);

      const found = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(found?.status).toBe(410);
      expect(found?.target).toBeNull();
    });

    it('holds a pattern, and no query for it', async () => {
      const redirect = build('/:year/:month/:slug', url('/en/blog/:slug'));
      await redirectsRepo.add(redirect);

      const found = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(found?.kind).toBe('pattern');
      expect(found?.source.path).toBe('/:year/:month/:slug');
    });

    it('keeps a rule whose page was deleted, and says it needs a target', async () => {
      const groupId = randomUUID();
      await withTenant(db, tenantAId, (tx) =>
        tx.insert(pageGroups).values({
          id: groupId,
          tenantId: tenantAId,
          siteId: siteAId,
          content: [],
        }),
      );
      const redirect = build('/old-for-a-page', {
        kind: 'page',
        pageGroupId: groupId,
        locale: 'en',
      });
      await redirectsRepo.add(redirect);

      await withTenant(db, tenantAId, (tx) =>
        tx.delete(pageGroups).where(eq(pageGroups.id, groupId)),
      );

      const found = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(found?.target).toEqual({
        kind: 'page',
        pageGroupId: null,
        locale: 'en',
      });
      expect(found?.needsATarget).toBe(true);

      const needing = await redirectsRepo.listPage(
        tenantAId,
        siteAId,
        { needsATarget: true },
        { page: 1, pageSize: 50 },
      );
      expect(needing.items.map((item) => item.id)).toContain(redirect.id);
    });

    it('lists a site’s rules, searched by what a person typed', async () => {
      const marker = `m${randomUUID().slice(0, 8)}`;
      await redirectsRepo.add(build(`/${marker}-one`, url('/x')));
      await redirectsRepo.add(build(`/${marker}-two`, url('/y')));
      await redirectsRepo.add(build('/other-thing', url(`/${marker}-target`)));

      const found = await redirectsRepo.listPage(
        tenantAId,
        siteAId,
        { search: marker.toUpperCase() },
        { page: 1, pageSize: 50 },
      );
      expect(found.total).toBe(3);

      const literal = await redirectsRepo.listPage(
        tenantAId,
        siteAId,
        { search: '100%' },
        { page: 1, pageSize: 50 },
      );
      expect(literal.total).toBe(0);
    });

    it('lists every rule of a site, and only that site’s', async () => {
      const all = await redirectsRepo.listBySite(tenantAId, siteAId);
      expect(all.length).toBeGreaterThan(5);
      expect(all.every((rule) => rule.siteId === siteAId)).toBe(true);
      expect(await redirectsRepo.countBySite(tenantAId, siteAId)).toBe(
        all.length,
      );
      expect(await redirectsRepo.listBySite(tenantBId, siteAId)).toEqual([]);
    });

    it('adds up visits, from two flushes, and ignores a rule that is gone', async () => {
      const redirect = build('/counted', url('/z'));
      await redirectsRepo.add(redirect);
      const at = new Date('2026-10-14T10:00:00Z');
      const later = new Date('2026-10-14T10:05:00Z');

      await redirectsRepo.addHits([
        { tenantId: tenantAId, redirectId: redirect.id, hits: 3, at },
        { tenantId: tenantAId, redirectId: randomUUID(), hits: 9, at },
      ]);
      await redirectsRepo.addHits([
        { tenantId: tenantAId, redirectId: redirect.id, hits: 2, at: later },
      ]);

      const found = await redirectsRepo.findById(tenantAId, redirect.id);
      expect(found?.hits).toBe(5);
      expect(found?.lastHitAt).toEqual(later);
    });
  });

  describe('missing paths', () => {
    const at = new Date('2026-10-14T10:00:00Z');

    it('counts an address across flushes and a repeat in one', async () => {
      await missingRepo.record([
        { tenantId: tenantAId, siteId: siteAId, path: '/lost', hits: 2, at },
        { tenantId: tenantAId, siteId: siteAId, path: '/lost', hits: 1, at },
      ]);
      await missingRepo.record([
        {
          tenantId: tenantAId,
          siteId: siteAId,
          path: '/lost',
          hits: 4,
          at: new Date(at.getTime() + 60_000),
        },
      ]);

      const list = await missingRepo.list(tenantAId, siteAId, {
        page: 1,
        pageSize: 50,
      });
      const lost = list.items.find((item) => item.path === '/lost');
      expect(lost?.hits).toBe(7);
      expect(lost?.lastSeenAt).toEqual(new Date(at.getTime() + 60_000));
      expect(lost?.firstSeenAt).toEqual(at);
    });

    it('lists the most asked for first, and not a dismissed one', async () => {
      await missingRepo.record([
        {
          tenantId: tenantAId,
          siteId: siteAId,
          path: '/popular',
          hits: 90,
          at,
        },
        { tenantId: tenantAId, siteId: siteAId, path: '/noise', hits: 80, at },
      ]);
      const before = await missingRepo.list(tenantAId, siteAId, {
        page: 1,
        pageSize: 50,
      });
      expect(before.items[0]?.path).toBe('/popular');
      const noise = before.items.find((item) => item.path === '/noise');

      await missingRepo.dismiss(tenantAId, noise?.id ?? '');

      const after = await missingRepo.list(tenantAId, siteAId, {
        page: 1,
        pageSize: 50,
      });
      expect(after.items.map((item) => item.path)).not.toContain('/noise');
      // Asked for again, it is still hidden, and still counted.
      await missingRepo.record([
        { tenantId: tenantAId, siteId: siteAId, path: '/noise', hits: 1, at },
      ]);
      const again = await missingRepo.list(tenantAId, siteAId, {
        page: 1,
        pageSize: 50,
      });
      expect(again.items.map((item) => item.path)).not.toContain('/noise');
    });

    it('forgets an address once it has an answer', async () => {
      await missingRepo.record([
        {
          tenantId: tenantAId,
          siteId: siteAId,
          path: '/answered',
          hits: 1,
          at,
        },
      ]);

      await missingRepo.clear(tenantAId, siteAId, '/answered');

      const list = await missingRepo.list(tenantAId, siteAId, {
        page: 1,
        pageSize: 500,
      });
      expect(list.items.map((item) => item.path)).not.toContain('/answered');
    });

    it('keeps no more than it is allowed, and keeps what is asked for most', async () => {
      const crowd = Array.from({ length: MAX_MISSING_PATHS + 300 }, (_, i) => ({
        tenantId: tenantBId,
        siteId: siteBId,
        path: `/probe-${i}`,
        hits: 1,
        at,
      }));
      await missingRepo.record([
        ...crowd,
        {
          tenantId: tenantBId,
          siteId: siteBId,
          path: '/keep-me',
          hits: 500,
          at,
        },
      ]);

      const list = await missingRepo.list(tenantBId, siteBId, {
        page: 1,
        pageSize: 1,
      });
      expect(list.total).toBe(MAX_MISSING_PATHS);
      expect(list.items[0]?.path).toBe('/keep-me');
    });

    it('does not show one tenant the other’s', async () => {
      const list = await missingRepo.list(tenantBId, siteAId, {
        page: 1,
        pageSize: 50,
      });
      expect(list.total).toBe(0);
    });
  });
});
