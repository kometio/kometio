import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import {
  Taxonomy,
  TaxonomyNotFoundError,
  Term,
  TermNotFoundError,
  type TaxonomyProps,
  type TermProps,
} from '@kometio/domain-core';
import type { TaxonomyRepositoryPort } from '@kometio/ports';
import {
  pageGroupTerms,
  taxonomies,
  termSlugs,
  terms,
  withTenant,
  type KometioDb,
  type KometioTx,
} from '@kometio/postgres-db';

function taxonomyFromRow(row: typeof taxonomies.$inferSelect): Taxonomy {
  return Taxonomy.fromProps({
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    // The column is `slug` and the entity calls it `prefix` — see the
    // entity for why: every other slug here is the last segment of an
    // address and this one is the first.
    prefix: row.slug,
    name: row.name,
    hierarchical: row.hierarchical,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function taxonomyToRow(props: TaxonomyProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    slug: props.prefix,
    name: props.name,
    hierarchical: props.hierarchical,
    order: props.order,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

function termFromRows(
  row: typeof terms.$inferSelect,
  slugRows: (typeof termSlugs.$inferSelect)[],
): Term {
  return Term.fromProps({
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    taxonomyId: row.taxonomyId,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    seoMeta: row.seoMeta,
    noindex: row.noindex,
    landingPageGroupId: row.landingPageGroupId,
    order: row.order,
    slugs: Object.fromEntries(slugRows.map((s) => [s.locale, s.slug])),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function termToRow(props: TermProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    taxonomyId: props.taxonomyId,
    parentId: props.parentId,
    name: props.name,
    description: props.description,
    seoMeta: props.seoMeta,
    noindex: props.noindex,
    landingPageGroupId: props.landingPageGroupId,
    order: props.order,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

/**
 * Terms, their dimensions and their addresses (docs/adr/0064). Connects
 * as `kometio_app`, so every read and write goes through the tenant policy
 * as well as the explicit `tenantId` — see docs/adr/0002.
 *
 * Written against `withTenant` directly rather than on
 * `DrizzlePaginatedRepository`: that base is one table with pagination,
 * and every interesting write here spans two — a term and its address
 * rows have to land together or the term has a URL that resolves to
 * nothing.
 */
export class DrizzleTaxonomyRepository implements TaxonomyRepositoryPort {
  constructor(private readonly db: KometioDb) {}

  async addTaxonomy(taxonomy: Taxonomy): Promise<void> {
    const row = taxonomyToRow(taxonomy.toProps());
    await withTenant(this.db, row.tenantId, (tx) =>
      tx.insert(taxonomies).values(row),
    );
  }

  /** Written back, never created again: one deleted meanwhile is not found. */
  async saveTaxonomy(taxonomy: Taxonomy): Promise<void> {
    const row = taxonomyToRow(taxonomy.toProps());
    const updated = await withTenant(this.db, row.tenantId, (tx) =>
      tx
        .update(taxonomies)
        .set(row)
        .where(
          and(eq(taxonomies.tenantId, row.tenantId), eq(taxonomies.id, row.id)),
        )
        .returning({ id: taxonomies.id }),
    );
    if (updated.length === 0) throw new TaxonomyNotFoundError(row.id);
  }

  async findTaxonomyById(
    tenantId: string,
    id: string,
  ): Promise<Taxonomy | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(taxonomies)
        .where(and(eq(taxonomies.tenantId, tenantId), eq(taxonomies.id, id)))
        .limit(1),
    );
    return rows[0] ? taxonomyFromRow(rows[0]) : null;
  }

  async listTaxonomiesBySite(
    tenantId: string,
    siteId: string,
  ): Promise<Taxonomy[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(taxonomies)
        .where(
          and(eq(taxonomies.tenantId, tenantId), eq(taxonomies.siteId, siteId)),
        )
        .orderBy(asc(taxonomies.order), asc(taxonomies.createdAt)),
    );
    return rows.map(taxonomyFromRow);
  }

  async deleteTaxonomy(tenantId: string, id: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(taxonomies)
        .where(and(eq(taxonomies.tenantId, tenantId), eq(taxonomies.id, id))),
    );
  }

  async addTerm(term: Term): Promise<void> {
    await this.writeTerm(term, (tx, row) =>
      tx
        .insert(terms)
        .values(row)
        .then(() => undefined),
    );
  }

  /** Written back, never created again: one deleted meanwhile is not found. */
  async saveTerm(term: Term): Promise<void> {
    await this.writeTerm(term, async (tx, row) => {
      const updated = await tx
        .update(terms)
        .set(row)
        .where(and(eq(terms.tenantId, row.tenantId), eq(terms.id, row.id)))
        .returning({ id: terms.id });
      if (updated.length === 0) throw new TermNotFoundError(row.id);
    });
  }

  /**
   * A term and its addresses in one transaction, with the addresses
   * replaced wholesale rather than diffed: the entity already carries
   * the full map, and "delete what is there, write what it says" cannot
   * drift the way a diff can.
   */
  private async writeTerm(
    term: Term,
    writeRow: (
      tx: KometioTx,
      row: ReturnType<typeof termToRow>,
    ) => Promise<void>,
  ): Promise<void> {
    const props = term.toProps();
    const row = termToRow(props);
    await withTenant(this.db, props.tenantId, async (tx) => {
      await writeRow(tx, row);

      // Read inside the transaction: the prefix a term's address carries
      // has to be the one its dimension has right now, not the one it
      // had when the caller loaded it.
      const prefix = await this.prefixOfTx(
        tx,
        props.tenantId,
        props.taxonomyId,
      );

      await tx
        .delete(termSlugs)
        .where(
          and(
            eq(termSlugs.tenantId, props.tenantId),
            eq(termSlugs.termId, props.id),
          ),
        );
      const slugRows = Object.entries(props.slugs).map(([locale, slug]) => ({
        tenantId: props.tenantId,
        siteId: props.siteId,
        termId: props.id,
        locale,
        slug,
        routePrefix: prefix,
      }));
      if (slugRows.length > 0) {
        await tx.insert(termSlugs).values(slugRows);
      }
    });
  }

  private async prefixOfTx(
    tx: KometioTx,
    tenantId: string,
    taxonomyId: string,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ slug: taxonomies.slug })
      .from(taxonomies)
      .where(
        and(eq(taxonomies.tenantId, tenantId), eq(taxonomies.id, taxonomyId)),
      )
      .limit(1);
    return row?.slug ?? null;
  }

  async findTermById(tenantId: string, id: string): Promise<Term | null> {
    const [term] = await this.loadTerms(tenantId, eq(terms.id, id));
    return term ?? null;
  }

  async listTermsByTaxonomy(
    tenantId: string,
    taxonomyId: string,
  ): Promise<Term[]> {
    return this.loadTerms(tenantId, eq(terms.taxonomyId, taxonomyId));
  }

  async listTermsBySite(tenantId: string, siteId: string): Promise<Term[]> {
    return this.loadTerms(tenantId, eq(terms.siteId, siteId));
  }

  /**
   * Two queries for any number of terms, never one per term: the address
   * rows come back in a single `in (...)` and are grouped in memory.
   */
  private async loadTerms(tenantId: string, scope: SQL): Promise<Term[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(terms)
        .where(and(eq(terms.tenantId, tenantId), scope))
        .orderBy(asc(terms.order), asc(terms.createdAt));
      if (rows.length === 0) return [];
      const slugRows = await tx
        .select()
        .from(termSlugs)
        .where(
          and(
            eq(termSlugs.tenantId, tenantId),
            inArray(
              termSlugs.termId,
              rows.map((row) => row.id),
            ),
          ),
        );
      const byTerm = new Map<string, (typeof termSlugs.$inferSelect)[]>();
      for (const slugRow of slugRows) {
        const list = byTerm.get(slugRow.termId) ?? [];
        list.push(slugRow);
        byTerm.set(slugRow.termId, list);
      }
      return rows.map((row) => termFromRows(row, byTerm.get(row.id) ?? []));
    });
  }

  async reorderTermSiblings(input: {
    tenantId: string;
    taxonomyId: string;
    parentId: string | null;
    orderedIds: readonly string[];
    at: Date;
  }): Promise<void> {
    if (input.orderedIds.length === 0) return;
    const position = sql.join(
      input.orderedIds.map(
        (id, index) => sql`when ${id}::uuid then ${index}::integer`,
      ),
      sql` `,
    );
    await withTenant(this.db, input.tenantId, (tx) =>
      tx
        .update(terms)
        .set({
          order: sql`case ${terms.id} ${position} end`,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(terms.tenantId, input.tenantId),
            eq(terms.taxonomyId, input.taxonomyId),
            input.parentId === null
              ? isNull(terms.parentId)
              : eq(terms.parentId, input.parentId),
            inArray(terms.id, [...input.orderedIds]),
          ),
        ),
    );
  }

  async deleteTerm(tenantId: string, id: string): Promise<void> {
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .delete(terms)
        .where(and(eq(terms.tenantId, tenantId), eq(terms.id, id))),
    );
  }

  async findTermByAddress(
    tenantId: string,
    siteId: string,
    locale: string,
    prefix: string | null,
    slug: string,
  ): Promise<Term | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ termId: termSlugs.termId })
        .from(termSlugs)
        .where(
          and(
            eq(termSlugs.tenantId, tenantId),
            eq(termSlugs.siteId, siteId),
            eq(termSlugs.locale, locale),
            // `is null` and `= null` are not the same operator, and a
            // root-mounted dimension's prefix IS null — written as an
            // equality it would match nothing and every root-mounted
            // address would look free.
            prefix === null
              ? isNull(termSlugs.routePrefix)
              : eq(termSlugs.routePrefix, prefix),
            eq(termSlugs.slug, slug),
          ),
        )
        .limit(1),
    );
    return rows[0] ? this.findTermById(tenantId, rows[0].termId) : null;
  }

  async findTermByLandingPage(
    tenantId: string,
    pageGroupId: string,
  ): Promise<Term | null> {
    const [term] = await this.loadTerms(
      tenantId,
      eq(terms.landingPageGroupId, pageGroupId),
    );
    return term ?? null;
  }

  async updateTermAddressPrefix(
    tenantId: string,
    taxonomyId: string,
    prefix: string | null,
  ): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ id: terms.id })
        .from(terms)
        .where(
          and(eq(terms.tenantId, tenantId), eq(terms.taxonomyId, taxonomyId)),
        );
      if (rows.length === 0) return;
      await tx
        .update(termSlugs)
        .set({ routePrefix: prefix })
        .where(
          and(
            eq(termSlugs.tenantId, tenantId),
            inArray(
              termSlugs.termId,
              rows.map((row) => row.id),
            ),
          ),
        );
    });
  }

  async listTermIdsForPageGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<string[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ termId: pageGroupTerms.termId })
        .from(pageGroupTerms)
        .where(
          and(
            eq(pageGroupTerms.tenantId, tenantId),
            eq(pageGroupTerms.pageGroupId, pageGroupId),
          ),
        ),
    );
    return rows.map((row) => row.termId);
  }

  /** Replace, not merge — the editor sends the ticked boxes, so what is absent is what was unticked. */
  async setTermsForPageGroup(
    tenantId: string,
    pageGroupId: string,
    termIds: string[],
  ): Promise<void> {
    await withTenant(this.db, tenantId, async (tx) => {
      await tx
        .delete(pageGroupTerms)
        .where(
          and(
            eq(pageGroupTerms.tenantId, tenantId),
            eq(pageGroupTerms.pageGroupId, pageGroupId),
          ),
        );
      if (termIds.length === 0) return;
      await tx
        .insert(pageGroupTerms)
        .values(termIds.map((termId) => ({ tenantId, pageGroupId, termId })));
    });
  }

  async listPageGroupIdsForTerm(
    tenantId: string,
    termId: string,
  ): Promise<string[]> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ pageGroupId: pageGroupTerms.pageGroupId })
        .from(pageGroupTerms)
        .where(
          and(
            eq(pageGroupTerms.tenantId, tenantId),
            eq(pageGroupTerms.termId, termId),
          ),
        ),
    );
    return rows.map((row) => row.pageGroupId);
  }
}
