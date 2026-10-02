import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ReusableSection,
  ReusableSectionNameAlreadyExistsError,
} from '@kometio/domain-core';
import { type KometioDb, createAppDb } from '@kometio/postgres-db';
import {
  createIntegrationSite,
  createIntegrationTenant,
  deleteIntegrationTenants,
} from '@kometio/postgres-db/testing';
import { DrizzleReusableSectionRepository } from './drizzle-reusable-section.repository';
import { DrizzleReusableSectionVersionRepository } from './drizzle-reusable-section-version.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, exactly as production does, which makes this the RLS
 * regression test for `reusable_sections` too: the policy added with the
 * table (docs/adr/0059) is only worth anything because the migration runs
 * as a different role from the one queried here.
 */
describe('DrizzleReusableSectionRepository (integration)', () => {
  let db: KometioDb;
  let sectionRepository: DrizzleReusableSectionRepository;
  let versionRepository: DrizzleReusableSectionVersionRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    sectionRepository = new DrizzleReusableSectionRepository(db);
    versionRepository = new DrizzleReusableSectionVersionRepository(db);

    tenantAId = await createIntegrationTenant(db, 'Integration Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Integration Tenant B');

    siteAId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  // A fresh name per call: (tenant, site, name) is unique, so a fixed one
  // would make each test depend on the ones before it.
  function buildSection(
    overrides: Partial<Parameters<typeof ReusableSection.create>[0]> = {},
  ) {
    return ReusableSection.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      name: `Section ${randomUUID()}`,
      kind: 'shared',
      ...overrides,
    });
  }

  it('saves and retrieves a section by id, scoped to its tenant', async () => {
    const section = buildSection({
      content: [{ id: 'b1', type: 'Heading', props: { text: 'Services' } }],
    });
    await sectionRepository.add(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    expect(found?.name).toBe(section.name);
    expect(found?.content).toEqual([
      { id: 'b1', type: 'Heading', props: { text: 'Services' } },
    ]);

    // The other tenant does not see it. Not a nicety: this is the claim
    // docs/adr/0002 makes, checked through the same role the app uses.
    expect(await sectionRepository.findById(tenantBId, section.id)).toBeNull();
  });

  /*
   * Two requests with one name can both pass the use case's own check; the
   * second then meets the constraint, and must hear "that name is taken"
   * rather than a raw driver error the API would answer with a 500.
   */
  it('turns a name another section already has into the domain error', async () => {
    const name = `Newsletter ${randomUUID()}`;
    await sectionRepository.add(buildSection({ name }));

    await expect(
      sectionRepository.add(buildSection({ name, kind: 'template' })),
    ).rejects.toThrow(ReusableSectionNameAlreadyExistsError);
  });

  it('keeps the draft and the published content apart', async () => {
    const section = buildSection({
      content: [{ id: 'b1', type: 'Text', props: { text: 'first' } }],
    });
    await sectionRepository.add(section);
    section.publish();
    await sectionRepository.save(section);
    section.saveDraft([{ id: 'b1', type: 'Text', props: { text: 'second' } }]);
    await sectionRepository.save(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    // What pages render is the published half — an edit that has not been
    // published must not reach them (docs/adr/0059).
    expect(found?.publishedContent).toEqual([
      { id: 'b1', type: 'Text', props: { text: 'first' } },
    ]);
    expect(found?.content).toEqual([
      { id: 'b1', type: 'Text', props: { text: 'second' } },
    ]);
  });

  it('reads many sections in one query, refusing another tenant’s ids', async () => {
    const first = buildSection();
    const second = buildSection();
    await sectionRepository.add(first);
    await sectionRepository.add(second);

    const found = await sectionRepository.findByIds(tenantAId, [
      first.id,
      second.id,
      randomUUID(),
    ]);
    expect(found.map((section) => section.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(await sectionRepository.findByIds(tenantBId, [first.id])).toEqual(
      [],
    );
  });

  it('stores which fields an instance may change', async () => {
    const section = buildSection();
    section.setExposedFields({ 'block-1': ['title', 'text'] });
    await sectionRepository.add(section);

    const found = await sectionRepository.findById(tenantAId, section.id);
    expect(found?.exposedFields).toEqual({ 'block-1': ['title', 'text'] });
  });

  it('answers an empty id list without asking the database', async () => {
    // The guard exists because `inArray(column, [])` is not a query that
    // returns nothing — it is a query Postgres refuses.
    expect(await sectionRepository.findByIds(tenantAId, [])).toEqual([]);
  });

  it('lists a site by name, and lists nothing for another tenant', async () => {
    const first = buildSection({ name: 'AAA first' });
    const second = buildSection({ name: 'BBB second' });
    await sectionRepository.add(second);
    await sectionRepository.add(first);

    const listed = await sectionRepository.listBySite(tenantAId, siteAId);
    const names = listed.map((section) => section.name);
    // By name: it is the order the insert menu shows them in.
    expect(names.indexOf('AAA first')).toBeLessThan(
      names.indexOf('BBB second'),
    );
    expect(await sectionRepository.listBySite(tenantBId, siteAId)).toEqual([]);
  });

  it('deletes a section, and refuses to delete another tenant’s', async () => {
    const section = buildSection();
    await sectionRepository.add(section);

    await sectionRepository.delete(tenantBId, section.id);
    expect(
      await sectionRepository.findById(tenantAId, section.id),
    ).not.toBeNull();

    await sectionRepository.delete(tenantAId, section.id);
    expect(await sectionRepository.findById(tenantAId, section.id)).toBeNull();
  });

  it('returns null for a version that does not exist', async () => {
    expect(
      await versionRepository.findById(tenantAId, randomUUID()),
    ).toBeNull();
  });

  it('keeps only the last ten versions', async () => {
    const section = buildSection();
    await sectionRepository.add(section);

    for (let index = 0; index < 12; index += 1) {
      await versionRepository.save({
        id: randomUUID(),
        tenantId: tenantAId,
        reusableSectionId: section.id,
        content: [{ id: 'b1', type: 'Text', props: { text: `v${index}` } }],
        createdBy: null,
        // Distinct timestamps: the prune keeps the newest ten by
        // created_at, and rows written in the same millisecond would make
        // which ten survive a matter of chance.
        createdAt: new Date(Date.now() + index * 1000),
      });
    }

    const versions = await versionRepository.listBySection(
      tenantAId,
      section.id,
    );
    expect(versions).toHaveLength(10);
    // Oldest first, and the two earliest are the ones dropped.
    expect(versions[0]?.content).toEqual([
      { id: 'b1', type: 'Text', props: { text: 'v2' } },
    ]);
  });
});
