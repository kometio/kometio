import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Taxonomy, Term } from '@kometio/domain-core';
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
import { DrizzleTaxonomyRepository } from './drizzle-taxonomy.repository';

/**
 * Runs against a real Postgres — see docs/development.md. Connects as
 * `kometio_app`, exactly as production does, so this is also the RLS
 * regression test for the four taxonomy tables: their policy is only
 * worth anything because the migration that created it ran as a
 * different role from the one querying here.
 */
describe('DrizzleTaxonomyRepository (integration)', () => {
  let db: KometioDb;
  let repository: DrizzleTaxonomyRepository;
  let tenantAId: string;
  let tenantBId: string;
  let siteAId: string;

  beforeAll(async () => {
    db = createAppDb();
    repository = new DrizzleTaxonomyRepository(db);
    tenantAId = await createIntegrationTenant(db, 'Taxonomy Tenant A');
    tenantBId = await createIntegrationTenant(db, 'Taxonomy Tenant B');
    siteAId = await createIntegrationSite(db, tenantAId);
  });

  afterAll(async () => {
    await deleteIntegrationTenants(db, [tenantAId, tenantBId]);
    await db.$client.end();
  });

  function newTaxonomy(prefix: string | null): Taxonomy {
    return Taxonomy.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      prefix,
      name: { it: 'Categoria', en: 'Category' },
    });
  }

  function newTerm(
    taxonomy: Taxonomy,
    slugs: Record<string, string>,
    parentId?: string,
  ): Term {
    return Term.create({
      id: randomUUID(),
      tenantId: tenantAId,
      siteId: siteAId,
      taxonomyId: taxonomy.id,
      parentId: parentId ?? null,
      name: { it: 'Espresso' },
      slugs,
    });
  }

  it('round-trips a dimension, prefix and all', async () => {
    const taxonomy = newTaxonomy(`categoria-${randomUUID().slice(0, 8)}`);
    await repository.addTaxonomy(taxonomy);

    const loaded = await repository.findTaxonomyById(tenantAId, taxonomy.id);

    expect(loaded?.prefix).toBe(taxonomy.prefix);
    expect(loaded?.name).toEqual({ it: 'Categoria', en: 'Category' });
    expect(loaded?.hierarchical).toBe(true);
  });

  it('round-trips a term with one address per language', async () => {
    const taxonomy = newTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    await repository.addTaxonomy(taxonomy);
    const suffix = randomUUID().slice(0, 8);
    const term = newTerm(taxonomy, {
      it: `macchine-${suffix}`,
      en: `machines-${suffix}`,
    });

    await repository.addTerm(term);
    const loaded = await repository.findTermById(tenantAId, term.id);

    expect(loaded?.slugs).toEqual({
      it: `macchine-${suffix}`,
      en: `machines-${suffix}`,
    });
  });

  /*
   * Saving replaces the address rows wholesale rather than merging them:
   * a language dropped from the map is a language the term stops
   * answering in, and a merge would leave that URL alive with nothing
   * choosing it any more.
   */
  it('drops the address of a language removed from the term', async () => {
    const taxonomy = newTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    await repository.addTaxonomy(taxonomy);
    const suffix = randomUUID().slice(0, 8);
    const term = newTerm(taxonomy, { it: `it-${suffix}`, en: `en-${suffix}` });
    await repository.addTerm(term);

    term.setSlug('en', null);
    await repository.saveTerm(term);

    const loaded = await repository.findTermById(tenantAId, term.id);
    expect(loaded?.slugs).toEqual({ it: `it-${suffix}` });
  });

  it('finds a term by the address it answers at', async () => {
    const prefix = `c-${randomUUID().slice(0, 8)}`;
    const taxonomy = newTaxonomy(prefix);
    await repository.addTaxonomy(taxonomy);
    const slug = `espresso-${randomUUID().slice(0, 8)}`;
    const term = newTerm(taxonomy, { it: slug });
    await repository.addTerm(term);

    const found = await repository.findTermByAddress(
      tenantAId,
      siteAId,
      'it',
      prefix,
      slug,
    );

    expect(found?.id).toBe(term.id);
  });

  /*
   * `is null` is not `= null`. A root-mounted dimension's prefix IS
   * null, so written as an equality this lookup would match nothing —
   * and every root-mounted address would look free, which is precisely
   * where a collision does the most damage.
   */
  it('finds a ROOT-mounted term, whose prefix is null', async () => {
    const taxonomy = newTaxonomy(null);
    await repository.addTaxonomy(taxonomy);
    const slug = `caffe-${randomUUID().slice(0, 8)}`;
    const term = newTerm(taxonomy, { it: slug });
    await repository.addTerm(term);

    const found = await repository.findTermByAddress(
      tenantAId,
      siteAId,
      'it',
      null,
      slug,
    );

    expect(found?.id).toBe(term.id);
  });

  it('moves every term of a dimension when its prefix changes', async () => {
    const oldPrefix = `old-${randomUUID().slice(0, 8)}`;
    const taxonomy = newTaxonomy(oldPrefix);
    await repository.addTaxonomy(taxonomy);
    const slug = `automatiche-${randomUUID().slice(0, 8)}`;
    const term = newTerm(taxonomy, { it: slug });
    await repository.addTerm(term);
    const nextPrefix = `new-${randomUUID().slice(0, 8)}`;

    taxonomy.setPrefix(nextPrefix);
    await repository.saveTaxonomy(taxonomy);
    await repository.updateTermAddressPrefix(
      tenantAId,
      taxonomy.id,
      nextPrefix,
    );

    expect(
      await repository.findTermByAddress(
        tenantAId,
        siteAId,
        'it',
        nextPrefix,
        slug,
      ),
    ).toBeTruthy();
    expect(
      await repository.findTermByAddress(
        tenantAId,
        siteAId,
        'it',
        taxonomy.prefix === nextPrefix ? 'old-nothing' : 'old-nothing',
        slug,
      ),
    ).toBeNull();
  });

  it('replaces a page group terms rather than adding to them', async () => {
    const taxonomy = newTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    await repository.addTaxonomy(taxonomy);
    const first = newTerm(taxonomy, { it: `a-${randomUUID().slice(0, 8)}` });
    const second = newTerm(taxonomy, { it: `b-${randomUUID().slice(0, 8)}` });
    await repository.addTerm(first);
    await repository.addTerm(second);
    const [group] = await withTenant(db, tenantAId, (tx) =>
      tx
        .insert(pageGroups)
        .values({ tenantId: tenantAId, siteId: siteAId })
        .returning({ id: pageGroups.id }),
    );

    await repository.setTermsForPageGroup(tenantAId, group.id, [
      first.id,
      second.id,
    ]);
    await repository.setTermsForPageGroup(tenantAId, group.id, [second.id]);

    expect(
      await repository.listTermIdsForPageGroup(tenantAId, group.id),
    ).toEqual([second.id]);
    expect(
      await repository.listPageGroupIdsForTerm(tenantAId, second.id),
    ).toEqual([group.id]);
    expect(
      await repository.listPageGroupIdsForTerm(tenantAId, first.id),
    ).toEqual([]);
  });

  it('shows one tenant nothing of another tenant dimensions (RLS)', async () => {
    const taxonomy = newTaxonomy(`c-${randomUUID().slice(0, 8)}`);
    await repository.addTaxonomy(taxonomy);

    expect(
      await repository.findTaxonomyById(tenantAId, taxonomy.id),
    ).toBeTruthy();
    expect(
      await repository.findTaxonomyById(tenantBId, taxonomy.id),
    ).toBeNull();
  });

  describe('reorderTermSiblings', () => {
    async function dimensionWith(count: number, parentId?: string) {
      const taxonomy = newTaxonomy(`ordine-${randomUUID().slice(0, 8)}`);
      await repository.addTaxonomy(taxonomy);
      const made: Term[] = [];
      for (let i = 0; i < count; i += 1) {
        const term = newTerm(
          taxonomy,
          { it: `termine-${i}-${randomUUID().slice(0, 8)}` },
          parentId,
        );
        await repository.addTerm(term);
        made.push(term);
      }
      return { taxonomy, made };
    }
    const order = async (taxonomy: Taxonomy) =>
      (await repository.listTermsByTaxonomy(tenantAId, taxonomy.id)).map(
        (term) => term.id,
      );

    it('writes every position in one go, and the list comes back in that order', async () => {
      const { taxonomy, made } = await dimensionWith(3);
      const [a, b, c] = made.map((term) => term.id);
      if (!a || !b || !c) throw new Error('terms were not made');

      await repository.reorderTermSiblings({
        tenantId: tenantAId,
        taxonomyId: taxonomy.id,
        parentId: null,
        orderedIds: [c, a, b],
        at: new Date(),
      });

      expect(await order(taxonomy)).toEqual([c, a, b]);
    });

    it('touches only the terms under that parent, in that dimension', async () => {
      const { taxonomy, made } = await dimensionWith(2);
      const [a, b] = made.map((term) => term.id);
      if (!a || !b) throw new Error('terms were not made');
      const child = newTerm(
        taxonomy,
        { it: `figlio-${randomUUID().slice(0, 8)}` },
        a,
      );
      await repository.addTerm(child);
      const other = await dimensionWith(2);
      const [o1, o2] = other.made.map((term) => term.id);
      if (!o1 || !o2) throw new Error('terms were not made');

      // A list that names another dimension's terms, and the child as a top-level one:
      // neither is this parent's in this dimension, so neither moves.
      await repository.reorderTermSiblings({
        tenantId: tenantAId,
        taxonomyId: taxonomy.id,
        parentId: null,
        orderedIds: [b, a, o2, o1, child.id],
        at: new Date(),
      });

      expect(
        (await order(taxonomy)).filter((id) => id === a || id === b),
      ).toEqual([b, a]);
      const untouched = await repository.findTermById(tenantAId, child.id);
      expect(untouched?.order).toBe(0);
      expect(await order(other.taxonomy)).toEqual([o1, o2]);
    });

    it('does not reach another tenant’s terms', async () => {
      const { taxonomy, made } = await dimensionWith(2);
      const [a, b] = made.map((term) => term.id);
      if (!a || !b) throw new Error('terms were not made');

      await repository.reorderTermSiblings({
        tenantId: tenantBId,
        taxonomyId: taxonomy.id,
        parentId: null,
        orderedIds: [b, a],
        at: new Date(),
      });

      expect(await order(taxonomy)).toEqual([a, b]);
    });
  });
});
