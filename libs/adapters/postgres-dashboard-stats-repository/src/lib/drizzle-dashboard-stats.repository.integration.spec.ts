import { randomUUID } from 'node:crypto';
import type { DashboardRecentActivityItem } from '@kometio/ports';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type KometioDb,
  createAppDb,
  formSubmissions,
  forms,
  media,
  pageGroups,
  pageTranslations,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleDashboardStatsRepository } from './drizzle-dashboard-stats.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this also regression-tests RLS
 * isolation for the aggregate queries (a tenant-B row must never leak into
 * tenant A's counts/sums, not just individual reads).
 */
describe('DrizzleDashboardStatsRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleDashboardStatsRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleDashboardStatsRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  async function insertTranslation(overrides: {
    tenantId: string;
    siteId: string;
    status: DashboardRecentActivityItem['status'];
    title?: string;
  }) {
    const [group] = await withTenant(db, overrides.tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId: overrides.tenantId, siteId: overrides.siteId })
        .returning({ id: pageGroups.id }),
    );
    await withTenant(db, overrides.tenantId, (tx) =>
      tx.insert(pageTranslations).values({
        tenantId: overrides.tenantId,
        siteId: overrides.siteId,
        pageGroupId: group.id,
        locale: 'it',
        slug: `pagina-${randomUUID()}`,
        status: overrides.status,
        seoMeta: { title: overrides.title ?? 'Titolo', description: '' },
      }),
    );
  }

  async function insertMedia(overrides: {
    tenantId: string;
    siteId: string;
    size: number;
  }) {
    await withTenant(db, overrides.tenantId, (tx) =>
      tx.insert(media).values({
        tenantId: overrides.tenantId,
        siteId: overrides.siteId,
        filename: `file-${randomUUID()}.jpg`,
        storageKey: `key-${randomUUID()}`,
        storageProvider: 'local',
        mimeType: 'image/jpeg',
        size: overrides.size,
      }),
    );
  }

  it('counts published and draft translations for the site', async () => {
    await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'published',
    });
    await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'published',
    });
    await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'draft',
    });

    const stats = await repository.getStats(tenantAId, siteAId, 5);

    expect(stats.pages.publishedCount).toBe(2);
    expect(stats.pages.draftCount).toBe(1);
  });

  it('sums media count and total size in bytes for the site', async () => {
    await insertMedia({ tenantId: tenantAId, siteId: siteAId, size: 1000 });
    await insertMedia({ tenantId: tenantAId, siteId: siteAId, size: 2500 });

    const stats = await repository.getStats(tenantAId, siteAId, 5);

    expect(stats.media.count).toBe(2);
    expect(stats.media.totalSizeBytes).toBe(3500);
  });

  it('returns recent activity ordered by most recently updated first, capped at the given limit', async () => {
    await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'published',
      title: 'First',
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'draft',
      title: 'Second',
    });

    const stats = await repository.getStats(tenantAId, siteAId, 1);

    expect(stats.recentActivity).toHaveLength(1);
    expect(stats.recentActivity[0].title).toBe('Second');
    expect(stats.recentActivity[0].status).toBe('draft');
  });

  describe('a page online with changes waiting', () => {
    const CREATED = new Date('2026-01-01T00:00:00Z');
    const PUBLISHED = new Date('2026-04-01T00:00:00Z');
    const LATER = new Date('2026-06-01T00:00:00Z');

    async function page(input: {
      status: 'draft' | 'published';
      groupChangedAt: Date;
      translationChangedAt: Date;
      publishedAt: Date | null;
      isDiverged?: boolean;
    }) {
      const title = `attivita-${randomUUID()}`;
      const [group] = await withTenant(db, tenantAId, (tx) =>
        tx
          .insert(pageGroups)
          .values({
            tenantId: tenantAId,
            siteId: siteAId,
            contentUpdatedAt: input.groupChangedAt,
          })
          .returning({ id: pageGroups.id }),
      );
      await withTenant(db, tenantAId, (tx) =>
        tx.insert(pageTranslations).values({
          tenantId: tenantAId,
          siteId: siteAId,
          pageGroupId: group.id,
          locale: 'it',
          slug: `pagina-${randomUUID()}`,
          status: input.status,
          seoMeta: { title, description: '' },
          contentUpdatedAt: input.translationChangedAt,
          publishedAt: input.publishedAt,
          isDiverged: input.isDiverged ?? false,
        }),
      );
      const stats = await repository.getStats(tenantAId, siteAId, 100);
      return stats.recentActivity.find((item) => item.title === title);
    }

    it('says so when the shared structure changed after it went online', async () => {
      const item = await page({
        status: 'published',
        groupChangedAt: LATER,
        translationChangedAt: CREATED,
        publishedAt: PUBLISHED,
      });

      expect(item?.hasUnpublishedChanges).toBe(true);
    });

    it('says so when this language’s own content changed after it went online', async () => {
      const item = await page({
        status: 'published',
        groupChangedAt: CREATED,
        translationChangedAt: LATER,
        publishedAt: PUBLISHED,
      });

      expect(item?.hasUnpublishedChanges).toBe(true);
    });

    it('says nothing for a page online exactly as written', async () => {
      const item = await page({
        status: 'published',
        groupChangedAt: CREATED,
        translationChangedAt: CREATED,
        publishedAt: PUBLISHED,
      });

      expect(item?.hasUnpublishedChanges).toBe(false);
    });

    it('says nothing for a language with a structure of its own, which the shared one’s change does not touch', async () => {
      const item = await page({
        status: 'published',
        groupChangedAt: LATER,
        translationChangedAt: CREATED,
        publishedAt: PUBLISHED,
        isDiverged: true,
      });

      expect(item?.hasUnpublishedChanges).toBe(false);
    });

    it('says nothing for a draft: there is nothing online for it to differ from', async () => {
      const item = await page({
        status: 'draft',
        groupChangedAt: LATER,
        translationChangedAt: LATER,
        publishedAt: null,
      });

      expect(item?.hasUnpublishedChanges).toBe(false);
    });
  });

  it("never counts another tenant's data, RLS-enforced not just query-scoped", async () => {
    const freshSiteAId = await createIntegrationSite(db, tenantAId);
    const siteBId = await createIntegrationSite(db, tenantBId);
    await insertTranslation({
      tenantId: tenantBId,
      siteId: siteBId,
      status: 'published',
    });
    await insertMedia({ tenantId: tenantBId, siteId: siteBId, size: 999 });

    const statsA = await repository.getStats(tenantAId, freshSiteAId, 5);

    expect(statsA.pages).toEqual({ publishedCount: 0, draftCount: 0 });
    expect(statsA.media).toEqual({ count: 0, totalSizeBytes: 0 });
    expect(statsA.recentActivity).toEqual([]);
  });

  it('returns zeroed stats for a site with no pages or media yet', async () => {
    const emptySiteId = await createIntegrationSite(db, tenantAId);

    const stats = await repository.getStats(tenantAId, emptySiteId, 5);

    expect(stats.pages).toEqual({ publishedCount: 0, draftCount: 0 });
    expect(stats.media).toEqual({ count: 0, totalSizeBytes: 0 });
    expect(stats.recentActivity).toEqual([]);
  });

  it('counts form submissions, splits out the last 7 days, and lists the most recent', async () => {
    const [form] = await withTenant(db, tenantAId, (tx) =>
      tx
        .insert(forms)
        .values({ tenantId: tenantAId, siteId: siteAId, name: 'Contatti' })
        .returning({ id: forms.id }),
    );
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await withTenant(db, tenantAId, (tx) =>
      tx.insert(formSubmissions).values([
        {
          tenantId: tenantAId,
          siteId: siteAId,
          formId: form.id,
          payload: {},
          createdAt: daysAgo(1),
        },
        {
          tenantId: tenantAId,
          siteId: siteAId,
          formId: form.id,
          payload: {},
          createdAt: daysAgo(2),
        },
        // Older than the window: counted in the total, not in the recent
        // count. This is the assertion the 7-day filter exists for.
        {
          tenantId: tenantAId,
          siteId: siteAId,
          formId: form.id,
          payload: {},
          createdAt: daysAgo(30),
        },
      ]),
    );

    const stats = await repository.getStats(tenantAId, siteAId, 2);

    expect(stats.forms.totalCount).toBe(3);
    expect(stats.forms.recentCount).toBe(2);
    // Capped at the limit, newest first.
    expect(stats.forms.recent).toHaveLength(2);
    expect(stats.forms.recent[0].formName).toBe('Contatti');
    expect(stats.forms.recent[0].formId).toBe(form.id);
    expect(stats.forms.recent[0].receivedAt.getTime()).toBeGreaterThan(
      stats.forms.recent[1].receivedAt.getTime(),
    );
  });

  it('does not count another tenant submissions', async () => {
    const before = await repository.getStats(tenantAId, siteAId, 5);

    const otherSiteId = await createIntegrationSite(db, tenantBId);
    const [otherForm] = await withTenant(db, tenantBId, (tx) =>
      tx
        .insert(forms)
        .values({ tenantId: tenantBId, siteId: otherSiteId, name: 'Altro' })
        .returning({ id: forms.id }),
    );
    await withTenant(db, tenantBId, (tx) =>
      tx.insert(formSubmissions).values({
        tenantId: tenantBId,
        siteId: otherSiteId,
        formId: otherForm.id,
        payload: {},
      }),
    );

    const after = await repository.getStats(tenantAId, siteAId, 5);

    expect(after.forms.totalCount).toBe(before.forms.totalCount);
  });
});
