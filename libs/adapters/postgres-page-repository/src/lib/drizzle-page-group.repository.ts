import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
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
  PageGroupListItem,
  PageGroupListSort,
  PageGroupRepositoryPort,
  PageGroupSummary,
  PaginatedResult,
  Pagination,
} from '@kometio/ports';
import type { PageContent } from '@kometio/shared-types';
import {
  answeredRow,
  DrizzlePaginatedRepository,
  isForeignKeyViolation,
  type KometioDb,
  type KometioTx,
  pageGroups,
  withTenant,
} from '@kometio/postgres-db';
import {
  editStamp,
  insertPageTranslationTx,
  pageTranslationRow,
  updatePageTranslationTx,
  withPageTranslationUniqueViolations,
} from './page-translation-write-tx';
import { DrizzlePageGroupListQuery } from './drizzle-page-group-list.query';
import { savePageGroupVersionTx } from './save-page-group-version-tx';

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

  private readonly listQuery: DrizzlePageGroupListQuery;

  constructor(db: KometioDb) {
    super(db);
    this.listQuery = new DrizzlePageGroupListQuery(db);
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

  /** The pages list of the editor: a read model, built by `DrizzlePageGroupListQuery`. */
  async listBySiteFiltered(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filters: PageGroupListFilters,
    sort: PageGroupListSort = 'tree',
  ): Promise<PaginatedResult<PageGroupListItem>> {
    return this.listQuery.run(tenantId, siteId, pagination, filters, sort);
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
