import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SiteLayoutSection } from '@kometio/domain-core';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleSiteLayoutSectionRepository } from './drizzle-site-layout-section.repository';
import { DrizzleSiteLayoutSectionVersionRepository } from './drizzle-site-layout-section-version.repository';

/**
 * Runs against a real Postgres — see docs/development.md ("docker compose up
 * -d postgres" + run migrations first). Connects as `kometio_app`, same as
 * production code, so this is also the RLS regression test: any change that
 * accidentally weakens tenant isolation should fail here, not in production.
 */
describe('DrizzleSiteLayoutSectionRepository (integration)', () => {
  let db: KometioDb;
  let sectionRepository: DrizzleSiteLayoutSectionRepository;
  let versionRepository: DrizzleSiteLayoutSectionVersionRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    sectionRepository = new DrizzleSiteLayoutSectionRepository(db);
    versionRepository = new DrizzleSiteLayoutSectionVersionRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  // A fresh locale per call (like Page's own buildPage() uses a fresh
  // slug) — keeps tests isolated from each other under the
  // (tenant, site, locale, kind) unique constraint.
  function buildSection(
    overrides: Partial<Parameters<typeof SiteLayoutSection.create>[0]> = {},
  ) {
    return SiteLayoutSection.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      locale: `it-${randomUUID()}`,
      kind: 'header',
      ...overrides,
    });
  }

  it('saves and retrieves a section by id, scoped to its tenant', async () => {
    const section = buildSection({
      content: [{ type: 'Header', props: {} }],
    });
    await sectionRepository.add(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    expect(found?.id).toBe(section.id);
    expect(found?.content).toEqual([{ type: 'Header', props: {} }]);

    const foundFromOtherTenant = await sectionRepository.findById(
      tenantBId,
      section.id,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('findBySiteLocaleKind scopes by tenant, site, locale and kind', async () => {
    const section = buildSection({ locale: `it-${randomUUID()}` });
    await sectionRepository.add(section);

    const found = await sectionRepository.findBySiteLocaleKind(
      tenantAId,
      siteAId,
      section.locale,
      section.kind,
    );
    expect(found?.id).toBe(section.id);

    const foundFromOtherTenant = await sectionRepository.findBySiteLocaleKind(
      tenantBId,
      siteAId,
      section.locale,
      section.kind,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('rejects a second header for the same (tenant, site, locale) — unique constraint', async () => {
    const locale = `dup-${randomUUID()}`;
    await sectionRepository.add(buildSection({ locale }));

    await expect(
      sectionRepository.add(buildSection({ locale })),
    ).rejects.toThrow();
  });

  it('allows a header and a footer for the same (tenant, site, locale)', async () => {
    const locale = `mixed-${randomUUID()}`;
    await sectionRepository.add(buildSection({ locale, kind: 'header' }));

    await expect(
      sectionRepository.add(buildSection({ locale, kind: 'footer' })),
    ).resolves.not.toThrow();
  });

  it('persists sticky, defaulting to false and round-tripping true after setSticky', async () => {
    const section = buildSection();
    expect(section.sticky).toBe(false);
    await sectionRepository.add(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.sticky).toBe(false);

    found.setSticky(true);
    await sectionRepository.save(found);

    const foundAgain = await sectionRepository.findById(tenantAId, section.id);
    expect(foundAgain?.sticky).toBe(true);
  });

  it('save() writes back a section that exists', async () => {
    const section = buildSection();
    await sectionRepository.add(section);

    section.saveDraft([{ type: 'Nav', props: {} }]);
    await sectionRepository.save(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    expect(found?.content).toEqual([{ type: 'Nav', props: {} }]);
  });

  it('findById on the version repository scopes by tenant', async () => {
    const section = buildSection();
    await sectionRepository.add(section);
    const versionId = randomUUID();
    await versionRepository.save({
      id: versionId,
      tenantId: tenantAId,
      siteLayoutSectionId: section.id,
      content: [{ type: 'Header', props: {} }],
      createdBy: null,
      createdAt: new Date(),
    });

    const found = await versionRepository.findById(tenantAId, versionId);
    expect(found?.id).toBe(versionId);

    const foundFromOtherTenant = await versionRepository.findById(
      tenantBId,
      versionId,
    );
    expect(foundFromOtherTenant).toBeNull();
  });

  it('saves and lists section versions oldest-first, scoped to tenant', async () => {
    const section = buildSection();
    await sectionRepository.add(section);

    const versionOneId = randomUUID();
    await versionRepository.save({
      id: versionOneId,
      tenantId: tenantAId,
      siteLayoutSectionId: section.id,
      content: [{ type: 'Header', props: { v: 1 } }],
      createdBy: null,
      createdAt: new Date(Date.now() - 1000),
    });
    const versionTwoId = randomUUID();
    await versionRepository.save({
      id: versionTwoId,
      tenantId: tenantAId,
      siteLayoutSectionId: section.id,
      content: [{ type: 'Header', props: { v: 2 } }],
      createdBy: null,
      createdAt: new Date(),
    });

    const versions = await versionRepository.listBySection(
      tenantAId,
      section.id,
    );
    expect(versions.map((v) => v.id)).toEqual([versionOneId, versionTwoId]);

    const versionsFromOtherTenant = await versionRepository.listBySection(
      tenantBId,
      section.id,
    );
    expect(versionsFromOtherTenant).toHaveLength(0);
  });

  it('prunes to the last 10 versions per section, oldest first', async () => {
    const section = buildSection();
    await sectionRepository.add(section);

    const versionIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = randomUUID();
      versionIds.push(id);
      await versionRepository.save({
        id,
        tenantId: tenantAId,
        siteLayoutSectionId: section.id,
        content: [{ type: 'Header', props: { v: i } }],
        createdBy: null,
        createdAt: new Date(Date.now() - (11 - i) * 1000),
      });
    }

    const versions = await versionRepository.listBySection(
      tenantAId,
      section.id,
    );
    expect(versions).toHaveLength(10);
    // The very first save (oldest createdAt) is the one pruned.
    expect(versions.map((v) => v.id)).toEqual(versionIds.slice(1));
  });
});
