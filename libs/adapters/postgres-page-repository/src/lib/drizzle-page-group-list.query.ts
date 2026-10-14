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
import { alias } from 'drizzle-orm/pg-core';
import { hasUnpublishedChanges } from '@kometio/domain-core';
import type {
  PageGroupListFilters,
  PageGroupListItem,
  PageGroupListSort,
  PageGroupStatusFilter,
  PaginatedResult,
  Pagination,
} from '@kometio/ports';
import {
  answeredRow,
  type KometioDb,
  pageGroups,
  pageTranslations,
  users,
  withTenant,
} from '@kometio/postgres-db';

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

type Translations = PageGroupListItem['translations'];

/**
 * The pages list of the editor (Fase 4): one row per page group, filterable,
 * with each of its languages beside it.
 *
 * Two steps, not a single join: `page_groups` has a 1:N with
 * `page_translations`, so joining first and paginating the joined result would
 * paginate at the TRANSLATION-row level (a group with 3 locales would count as
 * 3 rows against `pagination.pageSize`) — wrong. Instead: (1) find the page of
 * matching GROUP ids (filters expressed as `exists()` subqueries against
 * page_translations where they need to reach into per-locale data, e.g.
 * `search`/`locale`), (2) fetch every translation for exactly those ids,
 * unpaginated, and assemble them here (well within the "5-15 pagine per sito"
 * scale this product already assumes throughout).
 *
 * It is a read model, and it lives apart from `DrizzlePageGroupRepository`,
 * which persists the aggregate: the one grows with every column the editor
 * wants to show, the other with every rule about what a page may become.
 * Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md.
 */
export class DrizzlePageGroupListQuery {
  constructor(private readonly db: KometioDb) {}

  async run(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filters: PageGroupListFilters,
    sort: PageGroupListSort,
  ): Promise<PaginatedResult<PageGroupListItem>> {
    const scope = and(...this.conditions(tenantId, siteId, filters));
    const { groupRows, total } = await this.pageOfGroups(
      tenantId,
      scope,
      pagination,
      sort,
    );
    const groupIds = groupRows.map((row) => row.id);
    const childCountByGroup = await this.childCounts(tenantId, groupIds);
    const { translationsByGroup, lastEditByGroup } = await this.translationsOf(
      tenantId,
      groupRows,
    );

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
      total,
    };
  }

  /** What the site's pages are narrowed to: its own, then one condition per filter that is given. */
  private conditions(
    tenantId: string,
    siteId: string,
    filters: PageGroupListFilters,
  ): SQL[] {
    const conditions: SQL[] = [
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
      conditions.push(this.titleContains(filters.search));
    }
    if (filters.excludeSubtreeOf) {
      conditions.push(this.outsideSubtreeOf(filters.excludeSubtreeOf));
    }
    if (filters.status) {
      conditions.push(this.statusCondition(filters.status));
    }
    if (filters.locale) {
      conditions.push(this.hasLanguage(filters.locale));
    }
    return conditions;
  }

  /** Any of its languages has a title with this text in it, whatever the case. */
  private titleContains(search: string): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(pageTranslations)
        .where(
          and(
            eq(pageTranslations.pageGroupId, pageGroups.id),
            ilike(sql`${pageTranslations.seoMeta}->>'title'`, `%${search}%`),
          ),
        ),
    );
  }

  /**
   * Leaves out this page and everything under it, at any depth: a recursive
   * walk down `parent_id`, because "everything under this page" has no depth
   * limit and a join per level would have one. Inside `withTenant` where it
   * runs, so row-level security scopes it like every other read here.
   */
  private outsideSubtreeOf(pageGroupId: string): SQL {
    return sql`${pageGroups.id} not in (
          with recursive subtree as (
            select ${pageGroups.id} from ${pageGroups}
            where ${pageGroups.id} = ${pageGroupId}
            union all
            select child.id from ${pageGroups} child
            join subtree on child.parent_id = subtree.id
          )
          select id from subtree
        )`;
  }

  private hasLanguage(locale: string): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(pageTranslations)
        .where(
          and(
            eq(pageTranslations.pageGroupId, pageGroups.id),
            eq(pageTranslations.locale, locale),
          ),
        ),
    );
  }

  /**
   * A page is in the state of the language its row shows: the default
   * language when the page has it, else the first by code (the row's own
   * fallback, see `PageGroupStatusFilter`).
   *
   * "Pending" is `hasUnpublishedChanges` (@kometio/domain-core) written in
   * SQL — published, and either this language's own content or, unless it
   * has its own structure, the shared one has changed since — because a
   * filtered list cannot ask the entity about rows it has not loaded.
   * `PAGE_LIST_STATE_CASES` (@kometio/testing) holds the two to the same
   * answers, in the integration spec of this repository.
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

  /** The page of groups, with who made each and who last touched it, and how many there are in all. */
  private async pageOfGroups(
    tenantId: string,
    scope: SQL | undefined,
    pagination: Pagination,
    sort: PageGroupListSort,
  ) {
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
    return { groupRows, total: answeredRow(totalRows, 'COUNT').total };
  }

  /** One grouped read for the whole page of results, not a count per row. */
  private async childCounts(
    tenantId: string,
    groupIds: string[],
  ): Promise<Map<string | null, number>> {
    if (groupIds.length === 0) return new Map();
    const rows = await withTenant(this.db, tenantId, (tx) =>
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
    return new Map(rows.map((row) => [row.parentId, row.total]));
  }

  /**
   * Every language of exactly those groups, by language code (so "the first
   * language" a row falls back on is the same one the status filter judges
   * by), and the most recent change to each page in ANY language with its
   * author: the group row alone cannot answer that, since rewriting the
   * Italian text never touches the shared structure.
   */
  private async translationsOf(
    tenantId: string,
    groupRows: {
      id: string;
      updatedAt: Date;
      updatedByName: string | null;
      contentUpdatedAt: Date;
    }[],
  ) {
    const translationsByGroup = new Map<string, Translations>();
    const lastEditByGroup = new Map<
      string,
      { at: Date; byName: string | null }
    >(
      groupRows.map((row) => [
        row.id,
        { at: row.updatedAt, byName: row.updatedByName },
      ]),
    );
    const groupIds = groupRows.map((row) => row.id);
    if (groupIds.length === 0) return { translationsByGroup, lastEditByGroup };

    const translationEditors = alias(users, 'page_translation_editors');
    const translationRows = await withTenant(this.db, tenantId, (tx) =>
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
          scheduledPublishAt: pageTranslations.scheduledPublishAt,
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
        .orderBy(asc(pageTranslations.locale)),
    );

    const groupContentUpdatedAt = new Map(
      groupRows.map((row) => [row.id, row.contentUpdatedAt]),
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
        scheduledPublishAt: row.scheduledPublishAt,
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
    return { translationsByGroup, lastEditByGroup };
  }
}
