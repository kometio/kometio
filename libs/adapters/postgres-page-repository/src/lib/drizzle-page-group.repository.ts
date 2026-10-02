import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  not,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  hasUnpublishedChanges,
  PageGroup,
  PageGroupCannotBeItsOwnAncestorError,
  PageGroupHasChildrenError,
  PageGroupNotFoundError,
  type PageGroupProps,
  type PageGroupVersion,
  type PageTranslation,
} from '@kometio/domain-core';
import type {
  PageGroupListFilters,
  PageGroupStatusFilter,
  PageGroupListItem,
  PageGroupListSort,
  PageGroupRepositoryPort,
  PageGroupSummary,
  PaginatedResult,
  Pagination,
} from '@kometio/ports';
import type { PageContent } from '@kometio/shared-types';
import { alias } from 'drizzle-orm/pg-core';
import {
  answeredRow,
  DrizzlePaginatedRepository,
  isForeignKeyViolation,
  type KometioDb,
  type KometioTx,
  pageGroups,
  pageTranslations,
  users,
  withTenant,
} from '@kometio/postgres-db';
import {
  editStamp,
  insertPageTranslationTx,
  pageTranslationRow,
  updatePageTranslationTx,
  withPageTranslationUniqueViolations,
} from './page-translation-write-tx';
import { savePageGroupVersionTx } from './save-page-group-version-tx';

/**
 * A feed orders by when a page actually went live, which lives on its
 * translations rather than on the group — a correlated subquery, and not
 * a sort in memory, because a list sorted after pagination is a list
 * sorted one page at a time.
 *
 * `nulls first` puts what was never published at the top: in an editor
 * that is the row asking for attention, not the least interesting one.
 */
function orderFor(sort: PageGroupListSort) {
  // Each ends on the id: pages that tie on everything else otherwise came
  // back in any order, and a page boundary between them listed one twice.
  if (sort === 'tree') {
    return [
      asc(pageGroups.order),
      asc(pageGroups.createdAt),
      asc(pageGroups.id),
    ];
  }
  return [
    sql`(select max(${pageTranslations.publishedAt}) from ${pageTranslations} where ${pageTranslations.pageGroupId} = ${pageGroups.id}) desc nulls first`,
    desc(pageGroups.createdAt),
    desc(pageGroups.id),
  ];
}

function toRow(props: PageGroupProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    parentId: props.parentId,
    content: props.content,
    order: props.order,
    collectionId: props.collectionId,
    createdBy: props.createdBy,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    updatedBy: props.updatedBy,
    contentUpdatedAt: props.contentUpdatedAt,
  };
}

function fromRow(row: typeof pageGroups.$inferSelect): PageGroup {
  return PageGroup.fromProps({
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    parentId: row.parentId,
    content: row.content,
    order: row.order,
    collectionId: row.collectionId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    contentUpdatedAt: row.contentUpdatedAt,
  });
}

/**
 * Owns the SHARED structure — see PageGroupRepositoryPort's own doc
 * comment. No UNIQUE constraint beyond the PK on `page_groups` itself
 * (unlike `pages`/`page_translations`, which carry the slug): so there is
 * no unique-violation mapping to do here.
 */
/** The two references that keep a page with subpages from being deleted (schema.ts). */
const PARENT_REFERENCES = [
  'page_groups_parent_id_page_groups_id_fk',
  'page_translations_parent_group_id_page_groups_id_fk',
] as const;

/** Who changed a page, and when: every kind of change writes these too. */
function groupEditStamp(props: PageGroupProps) {
  return { updatedAt: props.updatedAt, updatedBy: props.updatedBy };
}

export class DrizzlePageGroupRepository
  extends DrizzlePaginatedRepository<
    typeof pageGroups.$inferSelect,
    PageGroup,
    ReturnType<typeof toRow>
  >
  implements PageGroupRepositoryPort
{
  protected readonly table = pageGroups;
  protected readonly idColumn = pageGroups.id;
  protected readonly tenantIdColumn = pageGroups.tenantId;

  constructor(db: KometioDb) {
    super(db);
  }

  protected toRow(group: PageGroup) {
    return toRow(group.toProps());
  }

  protected fromRow(row: typeof pageGroups.$inferSelect): PageGroup {
    return fromRow(row);
  }

  async countChildren(tenantId: string, pageGroupId: string): Promise<number> {
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ total: count() })
        .from(pageGroups)
        .where(
          and(
            eq(pageGroups.tenantId, tenantId),
            eq(pageGroups.parentId, pageGroupId),
          ),
        ),
    );
    return row?.total ?? 0;
  }

  /**
   * The database refuses to delete a page that still has subpages (ON
   * DELETE RESTRICT): the use case checks first, and this answers for a
   * subpage created in between, with the same domain error.
   */
  override async delete(tenantId: string, id: string): Promise<void> {
    try {
      await super.delete(tenantId, id);
    } catch (error) {
      if (isForeignKeyViolation(error, PARENT_REFERENCES)) {
        throw new PageGroupHasChildrenError(
          id,
          await this.countChildren(tenantId, id),
        );
      }
      throw error;
    }
  }

  /** A new page and its first structure version, in ONE transaction. */
  async addWithVersion(
    group: PageGroup,
    version: PageGroupVersion,
  ): Promise<void> {
    const row = this.toRow(group);
    await withTenant(this.db, row.tenantId, async (tx: KometioTx) => {
      await this.insertTx(tx, row);
      await savePageGroupVersionTx(tx, version);
    });
  }

  /**
   * The group, its first version and its first language in ONE transaction
   * — see the port. The language row is written, and its address refused,
   * by the same code a translation added on its own goes through.
   */
  async addWithTranslation(
    group: PageGroup,
    version: PageGroupVersion,
    translation: PageTranslation,
  ): Promise<void> {
    const groupRow = this.toRow(group);
    const translationRow = pageTranslationRow(
      translation.toProps(),
      group.parentId,
    );
    await withPageTranslationUniqueViolations(translationRow, () =>
      withTenant(this.db, groupRow.tenantId, async (tx: KometioTx) => {
        await this.insertTx(tx, groupRow);
        await savePageGroupVersionTx(tx, version);
        await insertPageTranslationTx(tx, translationRow);
      }),
    );
  }

  /** The block tree, and its new version, in the SAME transaction — nothing else about the page. */
  async saveContent(
    group: PageGroup,
    version: PageGroupVersion,
  ): Promise<void> {
    const props = group.toProps();
    await withTenant(this.db, props.tenantId, async (tx: KometioTx) => {
      await this.updateGroupTx(tx, props, {
        content: props.content,
        contentUpdatedAt: props.contentUpdatedAt,
        ...groupEditStamp(props),
      });
      await savePageGroupVersionTx(tx, version);
    });
  }

  /**
   * A new place in the tree: the group's parent and position, and in the
   * same transaction every language's copy of the parent with the address
   * it leaves behind — nothing else about any of them.
   */
  /**
   * The use case has already checked the destination, but outside any
   * transaction: two pages moved under each other at the same moment each
   * found the other's old place fine, and together made a loop that took
   * both subtrees off the site (audit B12). So the check is made again
   * here, under a lock every move in this site takes: the second move
   * waits, then sees where the first one put its page.
   */
  async move(group: PageGroup, translations: PageTranslation[]): Promise<void> {
    const props = group.toProps();
    await withTenant(this.db, props.tenantId, async (tx: KometioTx) => {
      if (props.parentId !== null) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`page-tree:${props.siteId}`}))`,
        );
        // UNION, not UNION ALL: a loop already in the data repeats a row,
        // which ends the walk instead of running it forever.
        const loop = await tx.execute(sql`
          with recursive above(id, parent_id) as (
            select ${pageGroups.id}, ${pageGroups.parentId}
              from ${pageGroups} where ${pageGroups.id} = ${props.parentId}
            union
            select ${pageGroups.id}, ${pageGroups.parentId}
              from ${pageGroups} join above on ${pageGroups.id} = above.parent_id
          )
          select 1 from above where id = ${props.id} limit 1`);
        if (loop.length > 0) {
          throw new PageGroupCannotBeItsOwnAncestorError(props.id);
        }
      }
      await this.updateGroupTx(tx, props, {
        parentId: props.parentId,
        order: props.order,
        ...groupEditStamp(props),
      });
      for (const translation of translations) {
        const translationProps = translation.toProps();
        await withPageTranslationUniqueViolations(translationProps, () =>
          updatePageTranslationTx(tx, translationProps, {
            parentGroupId: props.parentId,
            formerParents: translationProps.formerParents,
            ...editStamp(translationProps),
          }),
        );
      }
    });
  }

  async moveToCollection(group: PageGroup): Promise<void> {
    const props = group.toProps();
    await withTenant(this.db, props.tenantId, (tx) =>
      this.updateGroupTx(tx, props, {
        collectionId: props.collectionId,
        ...groupEditStamp(props),
      }),
    );
  }

  /**
   * Every sibling's position in ONE statement: it used to be a read and a
   * full write per page, 2N queries with no transaction, each one writing
   * back a content it had read — undoing a save that landed in between.
   */
  async reorderSiblings(input: {
    tenantId: string;
    siteId: string;
    parentId: string | null;
    orderedIds: readonly string[];
    by: string | null;
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
        .update(pageGroups)
        .set({
          order: sql`case ${pageGroups.id} ${position} end`,
          updatedAt: input.at,
          updatedBy: input.by,
        })
        .where(
          and(
            eq(pageGroups.tenantId, input.tenantId),
            eq(pageGroups.siteId, input.siteId),
            input.parentId === null
              ? isNull(pageGroups.parentId)
              : eq(pageGroups.parentId, input.parentId),
            inArray(pageGroups.id, [...input.orderedIds]),
          ),
        ),
    );
  }

  /** Writes the columns given to an existing page, and nothing else; a page deleted meanwhile is not found, never re-created. */
  private async updateGroupTx(
    tx: KometioTx,
    target: { tenantId: string; id: string },
    set: Partial<typeof pageGroups.$inferInsert>,
  ): Promise<void> {
    const updated = await tx
      .update(pageGroups)
      .set(set)
      .where(
        and(
          eq(pageGroups.tenantId, target.tenantId),
          eq(pageGroups.id, target.id),
        ),
      )
      .returning({ id: pageGroups.id });
    if (updated.length === 0) throw this.notFound(target.id);
  }

  protected notFound(id: string): Error {
    return new PageGroupNotFoundError(id);
  }

  async listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<PageGroupSummary>> {
    const scope = and(
      eq(pageGroups.tenantId, tenantId),
      eq(pageGroups.siteId, siteId),
    );
    const [rows, totalRows] = await withTenant(this.db, tenantId, (tx) =>
      Promise.all([
        tx
          .select({
            id: pageGroups.id,
            tenantId: pageGroups.tenantId,
            siteId: pageGroups.siteId,
            parentId: pageGroups.parentId,
            order: pageGroups.order,
            collectionId: pageGroups.collectionId,
            createdBy: pageGroups.createdBy,
            createdAt: pageGroups.createdAt,
            updatedAt: pageGroups.updatedAt,
          })
          .from(pageGroups)
          .where(scope)
          .orderBy(
            asc(pageGroups.order),
            asc(pageGroups.createdAt),
            asc(pageGroups.id),
          )
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize),
        tx.select({ total: count() }).from(pageGroups).where(scope),
      ]),
    );
    return { items: rows, total: answeredRow(totalRows, 'COUNT').total };
  }

  /**
   * Fase 4's pages-list view. Two-step query, not a single join: `page_groups`
   * has a 1:N with `page_translations`, so joining first and paginating the
   * joined result would paginate at the TRANSLATION-row level (a group with
   * 3 locales would count as 3 rows against `pagination.pageSize`) — wrong.
   * Instead: (1) find the page of matching GROUP ids (filters expressed as
   * `exists()` subqueries against page_translations where they need to
   * reach into per-locale data, e.g. `search`/`locale`), (2) fetch every
   * translation for exactly those ids, unpaginated, and assemble them
   * client-side (well within the "5-15 pagine per sito" scale this product
   * already assumes throughout).
   */
  /**
   * A page is in the state of the language its row shows: the default
   * language when the page has it, else the first by code (the row's own
   * fallback, see `PageGroupStatusFilter`).
   *
   * "Pending" is `hasUnpublishedChanges` (@kometio/domain-core) written in
   * SQL — published, and either this language's own content or, unless it
   * has its own structure, the shared one has changed since — because a
   * filtered list cannot ask the entity about rows it has not loaded.
   * The integration spec holds the two to the same answers.
   */
  private statusCondition(filter: PageGroupStatusFilter): SQL {
    const shown = alias(pageTranslations, 'status_shown');
    const inDefault = alias(pageTranslations, 'status_in_default');
    const first = alias(pageTranslations, 'status_first');
    const defaultLanguage = this.db
      .select({ locale: inDefault.locale })
      .from(inDefault)
      .where(
        and(
          eq(inDefault.pageGroupId, pageGroups.id),
          eq(inDefault.locale, filter.defaultLocale),
        ),
      );
    const firstLanguage = this.db
      .select({ locale: sql<string>`min(${first.locale})` })
      .from(first)
      .where(eq(first.pageGroupId, pageGroups.id));

    const isPublished = eq(shown.status, 'published');
    // Parenthesised whole: `not` in front of a bare `a and (b or c)` would
    // bind to `a` alone.
    const hasPending = sql`(${shown.publishedAt} is not null and (
      ${shown.contentUpdatedAt} > ${shown.publishedAt}
      or (not ${shown.isDiverged}
        and ${pageGroups.contentUpdatedAt} > ${shown.publishedAt})))`;
    const inState =
      filter.state === 'draft'
        ? not(isPublished)
        : filter.state === 'published'
          ? and(isPublished, not(hasPending))
          : and(isPublished, hasPending);

    return exists(
      this.db
        .select({ one: sql`1` })
        .from(shown)
        .where(
          and(
            eq(shown.pageGroupId, pageGroups.id),
            sql`${shown.locale} = coalesce(${defaultLanguage}, ${firstLanguage})`,
            inState,
          ),
        ),
    );
  }

  async listBySiteFiltered(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filters: PageGroupListFilters,
    sort: PageGroupListSort = 'tree',
  ): Promise<PaginatedResult<PageGroupListItem>> {
    const conditions = [
      eq(pageGroups.tenantId, tenantId),
      eq(pageGroups.siteId, siteId),
    ];
    if (filters.createdAfter) {
      conditions.push(gte(pageGroups.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(pageGroups.createdAt, filters.createdBefore));
    }
    if (filters.createdBy) {
      conditions.push(eq(pageGroups.createdBy, filters.createdBy));
    }
    // `undefined` is "every page, wherever it is filed" — what a sitemap
    // wants. `null` is the Pages screen asking for the pages that belong
    // to no section, which is a filter, not the absence of one.
    if (filters.collectionId !== undefined) {
      conditions.push(
        filters.collectionId === null
          ? isNull(pageGroups.collectionId)
          : eq(pageGroups.collectionId, filters.collectionId),
      );
    }
    if (filters.search) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(pageTranslations)
            .where(
              and(
                eq(pageTranslations.pageGroupId, pageGroups.id),
                ilike(
                  sql`${pageTranslations.seoMeta}->>'title'`,
                  `%${filters.search}%`,
                ),
              ),
            ),
        ),
      );
    }
    if (filters.excludeSubtreeOf) {
      // A recursive walk down `parent_id`, because "everything under this
      // page" has no depth limit and a join per level would have one.
      // Inside `withTenant` below, so row-level security scopes it like
      // every other read here.
      conditions.push(
        sql`${pageGroups.id} not in (
          with recursive subtree as (
            select ${pageGroups.id} from ${pageGroups}
            where ${pageGroups.id} = ${filters.excludeSubtreeOf}
            union all
            select child.id from ${pageGroups} child
            join subtree on child.parent_id = subtree.id
          )
          select id from subtree
        )`,
      );
    }
    if (filters.status) {
      conditions.push(this.statusCondition(filters.status));
    }
    if (filters.locale) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(pageTranslations)
            .where(
              and(
                eq(pageTranslations.pageGroupId, pageGroups.id),
                eq(pageTranslations.locale, filters.locale),
              ),
            ),
        ),
      );
    }
    const scope = and(...conditions);

    // Two joins onto the same table, so each needs a name of its own:
    // who created the page and who last touched it are rarely the same
    // person, which is the entire reason the list shows both.
    const editors = alias(users, 'page_group_editors');
    const [groupRows, totalRows] = await withTenant(this.db, tenantId, (tx) =>
      Promise.all([
        tx
          .select({
            id: pageGroups.id,
            tenantId: pageGroups.tenantId,
            siteId: pageGroups.siteId,
            parentId: pageGroups.parentId,
            order: pageGroups.order,
            collectionId: pageGroups.collectionId,
            createdBy: pageGroups.createdBy,
            createdByName: sql<
              string | null
            >`coalesce(${users.displayName}, ${users.email})`,
            createdAt: pageGroups.createdAt,
            updatedAt: pageGroups.updatedAt,
            updatedByName: sql<
              string | null
            >`coalesce(${editors.displayName}, ${editors.email})`,
            contentUpdatedAt: pageGroups.contentUpdatedAt,
          })
          .from(pageGroups)
          .leftJoin(users, eq(users.id, pageGroups.createdBy))
          .leftJoin(editors, eq(editors.id, pageGroups.updatedBy))
          .where(scope)
          .orderBy(...orderFor(sort))
          .limit(pagination.pageSize)
          .offset((pagination.page - 1) * pagination.pageSize),
        tx.select({ total: count() }).from(pageGroups).where(scope),
      ]),
    );

    const groupIds = groupRows.map((row) => row.id);
    // One grouped read for the whole page of results, not a count per row.
    const childRows =
      groupIds.length === 0
        ? []
        : await withTenant(this.db, tenantId, (tx) =>
            tx
              .select({ parentId: pageGroups.parentId, total: count() })
              .from(pageGroups)
              .where(
                and(
                  eq(pageGroups.tenantId, tenantId),
                  inArray(pageGroups.parentId, groupIds),
                ),
              )
              .groupBy(pageGroups.parentId),
          );
    const childCountByGroup = new Map(
      childRows.map((row) => [row.parentId, row.total]),
    );
    const translationEditors = alias(users, 'page_translation_editors');
    const translationRows =
      groupIds.length === 0
        ? []
        : await withTenant(this.db, tenantId, (tx) =>
            tx
              .select({
                pageGroupId: pageTranslations.pageGroupId,
                locale: pageTranslations.locale,
                slug: pageTranslations.slug,
                title: sql<string>`${pageTranslations.seoMeta}->>'title'`,
                status: pageTranslations.status,
                isDiverged: pageTranslations.isDiverged,
                contentUpdatedAt: pageTranslations.contentUpdatedAt,
                publishedAt: pageTranslations.publishedAt,
                updatedAt: pageTranslations.updatedAt,
                updatedByName: sql<
                  string | null
                >`coalesce(${translationEditors.displayName}, ${translationEditors.email})`,
              })
              .from(pageTranslations)
              .leftJoin(
                translationEditors,
                eq(translationEditors.id, pageTranslations.updatedBy),
              )
              .where(inArray(pageTranslations.pageGroupId, groupIds))
              // By language code, so "the first language" a row falls back
              // on is the same one the status filter judges by.
              .orderBy(asc(pageTranslations.locale)),
          );

    const groupContentUpdatedAt = new Map(
      groupRows.map((row) => [row.id, row.contentUpdatedAt]),
    );
    const translationsByGroup = new Map<
      string,
      PageGroupListItem['translations']
    >();
    // The most recent change to a page in ANY language, and its author.
    // The group row alone cannot answer it: rewriting the Italian text
    // never touches the shared structure.
    const lastEditByGroup = new Map<
      string,
      { at: Date; byName: string | null }
    >(
      groupRows.map((row) => [
        row.id,
        { at: row.updatedAt, byName: row.updatedByName },
      ]),
    );
    for (const row of translationRows) {
      const list = translationsByGroup.get(row.pageGroupId) ?? [];
      list.push({
        locale: row.locale,
        slug: row.slug,
        title: row.title,
        status: row.status,
        isDiverged: row.isDiverged,
        hasUnpublishedChanges: hasUnpublishedChanges({
          status: row.status,
          isDiverged: row.isDiverged,
          contentUpdatedAt: row.contentUpdatedAt,
          publishedAt: row.publishedAt,
          groupContentUpdatedAt:
            groupContentUpdatedAt.get(row.pageGroupId) ?? row.contentUpdatedAt,
        }),
      });
      translationsByGroup.set(row.pageGroupId, list);
      const lastEdit = lastEditByGroup.get(row.pageGroupId);
      if (lastEdit && row.updatedAt > lastEdit.at) {
        lastEditByGroup.set(row.pageGroupId, {
          at: row.updatedAt,
          byName: row.updatedByName,
        });
      }
    }

    return {
      items: groupRows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        siteId: row.siteId,
        parentId: row.parentId,
        order: row.order,
        collectionId: row.collectionId,
        createdBy: row.createdBy,
        createdByName: row.createdByName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastEditedAt: lastEditByGroup.get(row.id)?.at ?? row.updatedAt,
        lastEditedByName: lastEditByGroup.get(row.id)?.byName ?? null,
        childCount: childCountByGroup.get(row.id) ?? 0,
        translations: translationsByGroup.get(row.id) ?? [],
      })),
      total: answeredRow(totalRows, 'COUNT').total,
    };
  }

  /** Siblings in the SHARED hierarchy — it replaces PageRepositoryPort.listSiblings, without `locale` (a position in the tree is no longer per-locale). */
  /** See the port — one query, `content` only, to count where a section is placed. */
  async listContentBySite(
    tenantId: string,
    siteId: string,
  ): Promise<{ id: string; content: PageContent }[]> {
    return withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: pageGroups.id, content: pageGroups.content })
        .from(pageGroups)
        .where(
          and(eq(pageGroups.tenantId, tenantId), eq(pageGroups.siteId, siteId)),
        ),
    );
  }

  async listSiblings(
    tenantId: string,
    siteId: string,
    parentId: string | null,
  ): Promise<PageGroupSummary[]> {
    return withTenant(this.db, tenantId, (tx) =>
      tx
        .select({
          id: pageGroups.id,
          tenantId: pageGroups.tenantId,
          siteId: pageGroups.siteId,
          parentId: pageGroups.parentId,
          order: pageGroups.order,
          collectionId: pageGroups.collectionId,
          createdBy: pageGroups.createdBy,
          createdAt: pageGroups.createdAt,
          updatedAt: pageGroups.updatedAt,
        })
        .from(pageGroups)
        .where(
          and(
            eq(pageGroups.tenantId, tenantId),
            eq(pageGroups.siteId, siteId),
            parentId === null
              ? isNull(pageGroups.parentId)
              : eq(pageGroups.parentId, parentId),
          ),
        )
        .orderBy(asc(pageGroups.order), asc(pageGroups.createdAt)),
    );
  }
}
