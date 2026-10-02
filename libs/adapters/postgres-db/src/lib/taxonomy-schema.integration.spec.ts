import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { type KometioDb, createAppDb, withTenant } from './client';
import { deleteIntegrationTenants } from './integration-test-cleanup';
import {
  createIntegrationSite,
  createIntegrationTenant,
} from './integration-test-fixtures';
import { pageGroups, taxonomies, termSlugs, terms } from './schema';

/**
 * Runs against a real Postgres — see docs/development.md. The point of
 * this spec is that the taxonomy tables' guarantees are the DATABASE's,
 * not the application's (ADR-0064): what it asserts is which inserts
 * Postgres itself refuses, and what it lets one tenant see of another's.
 *
 * `schema.ts` is excluded from coverage precisely because its constraint
 * callbacks only ever run inside drizzle-kit — this is where they are
 * actually exercised.
 */
describe('taxonomy schema (integration)', () => {
  let db: KometioDb;
  const createdTenantIds: string[] = [];
  let tenantId: string;
  let siteId: string;

  beforeAll(async () => {
    db = createAppDb();
    tenantId = await createIntegrationTenant(db, 'Taxonomy tenant');
    createdTenantIds.push(tenantId);
    siteId = await createIntegrationSite(db, tenantId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, createdTenantIds);
    await db.$client.end();
  });

  async function insertTaxonomy(slug: string | null) {
    return withTenant(db, tenantId, (tx) =>
      tx
        .insert(taxonomies)
        .values({ tenantId, siteId, slug, name: { it: 'Categoria' } })
        .returning({ id: taxonomies.id }),
    ).then(([row]) => row.id);
  }

  async function insertTerm(taxonomyId: string, parentId?: string) {
    return withTenant(db, tenantId, (tx) =>
      tx
        .insert(terms)
        .values({
          tenantId,
          siteId,
          taxonomyId,
          parentId: parentId ?? null,
          name: { it: 'Espresso' },
        })
        .returning({ id: terms.id }),
    ).then(([row]) => row.id);
  }

  async function insertSlug(
    termId: string,
    locale: string,
    slug: string,
    routePrefix: string | null,
  ) {
    return withTenant(db, tenantId, (tx) =>
      tx
        .insert(termSlugs)
        .values({ tenantId, siteId, termId, locale, slug, routePrefix }),
    );
  }

  it('lets two dimensions live at the site root at once', async () => {
    // Both have `slug = null`, and the unique on (tenant, site, slug)
    // leaves NULLs distinct on purpose: "no prefix" is not a prefix two
    // taxonomies are fighting over. What keeps their TERMS apart is the
    // constraint below, not this one.
    await expect(insertTaxonomy(null)).resolves.toBeTruthy();
    await expect(insertTaxonomy(null)).resolves.toBeTruthy();
  });

  it('refuses two dimensions sharing a prefix', async () => {
    const slug = `categoria-${randomUUID().slice(0, 8)}`;
    await insertTaxonomy(slug);

    await expect(insertTaxonomy(slug)).rejects.toThrow();
  });

  it('refuses two terms answering at the same address', async () => {
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    const first = await insertTerm(taxonomyId);
    const second = await insertTerm(taxonomyId);
    const slug = `espresso-${randomUUID().slice(0, 8)}`;

    await insertSlug(first, 'it', slug, 'categoria');

    await expect(insertSlug(second, 'it', slug, 'categoria')).rejects.toThrow();
  });

  /*
   * The case `nulls not distinct` exists for. Two dimensions mounted at
   * the root both address `/it/<slug>`, and with Postgres' default
   * NULL-is-distinct rule a plain unique would have let every one of
   * those duplicates through — silently, since the symptom is one URL
   * opening the other term.
   */
  it('refuses the same address under two ROOT-mounted dimensions', async () => {
    const firstTaxonomy = await insertTaxonomy(null);
    const secondTaxonomy = await insertTaxonomy(null);
    const slug = `caffe-${randomUUID().slice(0, 8)}`;

    await insertSlug(await insertTerm(firstTaxonomy), 'it', slug, null);

    await expect(
      insertSlug(await insertTerm(secondTaxonomy), 'it', slug, null),
    ).rejects.toThrow();
  });

  it('refuses a repeated slug even under a different parent', async () => {
    // A term's URL is `/{locale}/{prefix}/{slug}`, flat — so the same
    // slug under a different parent is a second name for one address,
    // not a sibling-scoped duplicate the way a page's would be.
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    const parent = await insertTerm(taxonomyId);
    const child = await insertTerm(taxonomyId, parent);
    const other = await insertTerm(taxonomyId);
    const slug = `automatiche-${randomUUID().slice(0, 8)}`;

    await insertSlug(child, 'it', slug, 'categoria');

    await expect(insertSlug(other, 'it', slug, 'categoria')).rejects.toThrow();
  });

  it('lets one term keep a different slug per language', async () => {
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    const termId = await insertTerm(taxonomyId);
    const suffix = randomUUID().slice(0, 8);

    await insertSlug(termId, 'it', `macchine-${suffix}`, 'categoria');

    await expect(
      insertSlug(termId, 'en', `machines-${suffix}`, 'categoria'),
    ).resolves.toBeTruthy();
    await expect(
      insertSlug(termId, 'it', `altro-${suffix}`, 'categoria'),
    ).rejects.toThrow();
  });

  it('refuses two terms claiming the same landing page', async () => {
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    const [group] = await withTenant(db, tenantId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId, siteId })
        .returning({ id: pageGroups.id }),
    );
    const first = await insertTerm(taxonomyId);
    const second = await insertTerm(taxonomyId);

    await withTenant(db, tenantId, (tx) =>
      tx
        .update(terms)
        .set({ landingPageGroupId: group.id })
        .where(eq(terms.id, first)),
    );

    await expect(
      withTenant(db, tenantId, (tx) =>
        tx
          .update(terms)
          .set({ landingPageGroupId: group.id })
          .where(eq(terms.id, second)),
      ),
    ).rejects.toThrow();
  });

  /*
   * `set null`, not `cascade`. Deleting "Machines" must not take
   * "Espresso machines" with it — and with it every page filed under
   * that child. The child is promoted to the top of its dimension and
   * stays reachable.
   */
  it('promotes a child term when its parent is deleted', async () => {
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    const parent = await insertTerm(taxonomyId);
    const child = await insertTerm(taxonomyId, parent);

    await withTenant(db, tenantId, (tx) =>
      tx.delete(terms).where(eq(terms.id, parent)),
    );

    const [survivor] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(terms).where(eq(terms.id, child)),
    );
    expect(survivor).toBeTruthy();
    expect(survivor.parentId).toBeNull();
  });

  it('keeps one tenant from seeing another tenant terms (RLS)', async () => {
    const otherId = await createIntegrationTenant(db, 'Other tenant');
    createdTenantIds.push(otherId);
    const taxonomyId = await insertTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    await insertTerm(taxonomyId);

    const seenByOwner = await withTenant(db, tenantId, (tx) =>
      tx
        .select()
        .from(terms)
        .where(sql`${terms.taxonomyId} = ${taxonomyId}`),
    );
    const seenByStranger = await withTenant(db, otherId, (tx) =>
      tx
        .select()
        .from(terms)
        .where(sql`${terms.taxonomyId} = ${taxonomyId}`),
    );

    expect(seenByOwner).toHaveLength(1);
    expect(seenByStranger).toHaveLength(0);
  });
});
