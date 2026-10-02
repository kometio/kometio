import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PageTranslation,
  type PageTranslationStatus,
} from '@kometio/domain-core';
import {
  type KometioDb,
  createAppDb,
  pageGroups,
  pageTranslations,
  withTenant,
} from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSearchRepository } from './drizzle-search.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, same as production code, so this also regression-tests RLS
 * isolation for `page_translations.search_vector` (the generated column
 * the Fase 5 migration adds).
 */
describe('DrizzleSearchRepository (integration)', () => {
  let db: KometioDb;
  let searchRepository: DrizzleSearchRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    searchRepository = new DrizzleSearchRepository(db);

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
    locale?: string;
    slug?: string;
    status?: PageTranslationStatus;
  }): Promise<PageTranslation> {
    const slug = overrides.slug ?? `pagina-${randomUUID()}`;
    const seoMeta = {
      title: 'Idraulico a Roma',
      description: 'Servizio urgente',
    };
    const publishedSnapshot = [
      {
        type: 'Hero',
        props: {
          title: 'Riparazioni idrauliche',
          subtitle: 'interventi rapidi',
        },
      },
    ];

    const [group] = await withTenant(db, overrides.tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId: overrides.tenantId, siteId: overrides.siteId })
        .returning({ id: pageGroups.id }),
    );

    const [row] = await withTenant(db, overrides.tenantId, (tx) =>
      tx
        .insert(pageTranslations)
        .values({
          tenantId: overrides.tenantId,
          siteId: overrides.siteId,
          pageGroupId: group.id,
          locale: overrides.locale ?? 'it',
          slug,
          status: overrides.status ?? 'published',
          publishedSnapshot:
            (overrides.status ?? 'published') === 'published'
              ? publishedSnapshot
              : null,
          seoMeta,
        })
        .returning(),
    );

    return PageTranslation.fromProps({
      id: row.id,
      tenantId: row.tenantId,
      siteId: row.siteId,
      pageGroupId: row.pageGroupId,
      locale: row.locale,
      slug: row.slug,
      formerSlugs: row.formerSlugs,
      formerParents: row.formerParents,
      seoMeta: row.seoMeta,
      fieldValues: row.fieldValues,
      status: row.status,
      publishedSnapshot: row.publishedSnapshot,
      isDiverged: row.isDiverged,
      divergedContent: row.divergedContent,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      contentUpdatedAt: row.contentUpdatedAt,
      publishedAt: row.publishedAt,
    });
  }

  it('indexes a published translation and finds it by a stemmed query', async () => {
    const translation = await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
    });
    await searchRepository.indexPage(
      tenantAId,
      siteAId,
      translation,
      translation.publishedSnapshot ?? [],
    );

    const results = await searchRepository.search(
      tenantAId,
      siteAId,
      'it',
      'idraulici',
    );

    expect(results).toHaveLength(1);
    expect(results[0].pageId).toBe(translation.id);
    expect(results[0].slug).toBe(translation.slug);
    expect(results[0].title).toBe('Idraulico a Roma');
    expect(results[0].excerpt.length).toBeGreaterThan(0);
    // The match markers (see the repository's own comment on why they're
    // plain control chars, not literal <mark> tags) must survive the round
    // trip through Postgres and the postgres-js driver intact.
    expect(results[0].excerpt).toContain('\x01');
    expect(results[0].excerpt).toContain('\x02');
  });

  it('never returns a draft translation, even if indexed', async () => {
    const translation = await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      status: 'draft',
    });
    await searchRepository.indexPage(
      tenantAId,
      siteAId,
      translation,
      translation.publishedSnapshot ?? [],
    );

    const results = await searchRepository.search(
      tenantAId,
      siteAId,
      'it',
      'idraulici',
    );

    expect(results.find((r) => r.pageId === translation.id)).toBeUndefined();
  });

  it('scopes results to the given site', async () => {
    const otherSiteId = await createIntegrationSite(db, tenantAId);
    const translation = await insertTranslation({
      tenantId: tenantAId,
      siteId: otherSiteId,
    });
    await searchRepository.indexPage(
      tenantAId,
      otherSiteId,
      translation,
      translation.publishedSnapshot ?? [],
    );

    const results = await searchRepository.search(
      tenantAId,
      siteAId,
      'it',
      'idraulici',
    );

    expect(results.find((r) => r.pageId === translation.id)).toBeUndefined();
  });

  it('scopes results to the given locale', async () => {
    const translation = await insertTranslation({
      tenantId: tenantAId,
      siteId: siteAId,
      locale: 'en',
    });
    await searchRepository.indexPage(
      tenantAId,
      siteAId,
      translation,
      translation.publishedSnapshot ?? [],
    );

    const results = await searchRepository.search(
      tenantAId,
      siteAId,
      'it',
      'idraulici',
    );

    expect(results.find((r) => r.pageId === translation.id)).toBeUndefined();
  });

  it('never returns a translation from another tenant (RLS)', async () => {
    const siteBId = await createIntegrationSite(db, tenantBId);
    const translation = await insertTranslation({
      tenantId: tenantBId,
      siteId: siteBId,
    });
    await searchRepository.indexPage(
      tenantBId,
      siteBId,
      translation,
      translation.publishedSnapshot ?? [],
    );

    const results = await searchRepository.search(
      tenantAId,
      siteAId,
      'it',
      'idraulici',
    );

    expect(results.find((r) => r.pageId === translation.id)).toBeUndefined();
  });
});
