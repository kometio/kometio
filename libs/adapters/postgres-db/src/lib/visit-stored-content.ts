import type { PageContent } from '@kometio/shared-types';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { KometioTx } from './client';
import {
  pageGroups,
  pageGroupVersions,
  pageTranslations,
  pageTranslationVersions,
  reusableSections,
  reusableSectionVersions,
  siteLayoutSections,
  siteLayoutSectionVersions,
} from './schema';

/**
 * Every place a block tree is stored, visited once.
 *
 * The list is easy to get wrong and expensive to get wrong quietly: a
 * one-off script that rewrites drafts but forgets `publishedSnapshot`
 * leaves the live site on the old shape, and nothing reports it because
 * the draft looks migrated. `backfill-block-ids.ts` was worse than that —
 * it still walked `pages` and `pageVersions`, tables the i18n rework
 * removed, so it could not run at all. Nothing caught that because
 * `scripts/` sat outside the typecheck target; it is inside it now
 * (`tsconfig.scripts.json`), and both scripts share this one list rather
 * than each keeping a copy to drift.
 *
 * It drifted all the same: reusable sections, and the diverged content
 * of a translation's versions, were never on it, so the migrations did
 * not reach them. `visit-stored-content.spec.ts` now derives the columns
 * that hold a block tree from the schema and fails for one that is not
 * visited here.
 *
 * `transform` reports whether it changed anything, so a row that is
 * already current is not rewritten — which is what makes a script built
 * on this safe to re-run. It is told where the content is, for a script
 * that reports (`audit-block-props.ts`) rather than rewrites.
 *
 * It lives beside the schema and not with the scripts that use it, because
 * it is knowledge of the schema, and so that its spec is of the library.
 */
export interface StoredContentLocation {
  /** The table's name in the database. */
  table: string;
  /** The row's id. */
  id: string;
  /** The column's name in the database. */
  column: string;
}

export type ContentTransform = (
  content: PageContent,
  where: StoredContentLocation,
) => {
  content: PageContent;
  changed: boolean;
};

export interface VisitTotals {
  rewritten: number;
  untouched: number;
}

type Columns = Record<string, PageContent | null>;

/**
 * One table: its rows, which of their columns hold a block tree, and how a
 * row is written. The content columns of a row are transformed together, so
 * that a row is written once, or not at all.
 */
async function visitTable<Row extends { id: string }>(
  { transform, totals }: { transform: ContentTransform; totals: VisitTotals },
  table: PgTable,
  rows: PromiseLike<Row[]>,
  columnsOf: (row: Row) => Columns,
  write: (
    row: Row,
    changes: Record<string, PageContent>,
  ) => PromiseLike<unknown>,
): Promise<void> {
  const tableName = getTableName(table);
  const sqlNames = getTableColumns(table);
  for (const row of await rows) {
    const changes: Record<string, PageContent> = {};
    for (const [name, content] of Object.entries(columnsOf(row))) {
      if (!content) {
        continue;
      }
      const result = transform(content, {
        table: tableName,
        id: row.id,
        column: sqlNames[name]?.name ?? name,
      });
      if (result.changed) {
        changes[name] = result.content;
      }
    }
    if (Object.keys(changes).length > 0) {
      await write(row, changes);
      totals.rewritten += 1;
    } else {
      totals.untouched += 1;
    }
  }
}

export async function visitStoredContent(
  tx: KometioTx,
  tenantId: string,
  transform: ContentTransform,
): Promise<VisitTotals> {
  const totals: VisitTotals = { rewritten: 0, untouched: 0 };
  const visit = { transform, totals };

  // The canonical block tree of every page, and its history.
  await visitTable(
    visit,
    pageGroups,
    tx
      .select({ id: pageGroups.id, content: pageGroups.content })
      .from(pageGroups)
      .where(eq(pageGroups.tenantId, tenantId)),
    (row) => ({ content: row.content }),
    (row, changes) =>
      tx.update(pageGroups).set(changes).where(eq(pageGroups.id, row.id)),
  );

  await visitTable(
    visit,
    pageGroupVersions,
    tx
      .select({ id: pageGroupVersions.id, content: pageGroupVersions.content })
      .from(pageGroupVersions)
      .where(eq(pageGroupVersions.tenantId, tenantId)),
    (row) => ({ content: row.content }),
    (row, changes) =>
      tx
        .update(pageGroupVersions)
        .set(changes)
        .where(eq(pageGroupVersions.id, row.id)),
  );

  // `publishedSnapshot` matters as much as the draft: it is what the
  // public site actually serves, frozen at publish time — nothing rewrites
  // it on its own. `divergedContent` is the structure of a translation
  // that has been unlinked from its group.
  await visitTable(
    visit,
    pageTranslations,
    tx
      .select({
        id: pageTranslations.id,
        publishedSnapshot: pageTranslations.publishedSnapshot,
        divergedContent: pageTranslations.divergedContent,
      })
      .from(pageTranslations)
      .where(eq(pageTranslations.tenantId, tenantId)),
    (row) => ({
      publishedSnapshot: row.publishedSnapshot,
      divergedContent: row.divergedContent,
    }),
    (row, changes) =>
      tx
        .update(pageTranslations)
        .set(changes)
        .where(eq(pageTranslations.id, row.id)),
  );

  await visitTable(
    visit,
    pageTranslationVersions,
    tx
      .select({
        id: pageTranslationVersions.id,
        divergedContent: pageTranslationVersions.divergedContent,
      })
      .from(pageTranslationVersions)
      .where(eq(pageTranslationVersions.tenantId, tenantId)),
    (row) => ({ divergedContent: row.divergedContent }),
    (row, changes) =>
      tx
        .update(pageTranslationVersions)
        .set(changes)
        .where(eq(pageTranslationVersions.id, row.id)),
  );

  // The header and footer regions, draft and published.
  await visitTable(
    visit,
    siteLayoutSections,
    tx
      .select({
        id: siteLayoutSections.id,
        content: siteLayoutSections.content,
        publishedContent: siteLayoutSections.publishedContent,
      })
      .from(siteLayoutSections)
      .where(eq(siteLayoutSections.tenantId, tenantId)),
    (row) => ({
      content: row.content,
      publishedContent: row.publishedContent,
    }),
    (row, changes) =>
      tx
        .update(siteLayoutSections)
        .set(changes)
        .where(eq(siteLayoutSections.id, row.id)),
  );

  await visitTable(
    visit,
    siteLayoutSectionVersions,
    tx
      .select({
        id: siteLayoutSectionVersions.id,
        content: siteLayoutSectionVersions.content,
      })
      .from(siteLayoutSectionVersions)
      .where(eq(siteLayoutSectionVersions.tenantId, tenantId)),
    (row) => ({ content: row.content }),
    (row, changes) =>
      tx
        .update(siteLayoutSectionVersions)
        .set(changes)
        .where(eq(siteLayoutSectionVersions.id, row.id)),
  );

  // The sections a page can reuse, draft and published, and their history:
  // they are rendered inside other pages, so a migration that skips them
  // leaves the old shape on every page that uses one.
  await visitTable(
    visit,
    reusableSections,
    tx
      .select({
        id: reusableSections.id,
        content: reusableSections.content,
        publishedContent: reusableSections.publishedContent,
      })
      .from(reusableSections)
      .where(eq(reusableSections.tenantId, tenantId)),
    (row) => ({
      content: row.content,
      publishedContent: row.publishedContent,
    }),
    (row, changes) =>
      tx
        .update(reusableSections)
        .set(changes)
        .where(eq(reusableSections.id, row.id)),
  );

  await visitTable(
    visit,
    reusableSectionVersions,
    tx
      .select({
        id: reusableSectionVersions.id,
        content: reusableSectionVersions.content,
      })
      .from(reusableSectionVersions)
      .where(eq(reusableSectionVersions.tenantId, tenantId)),
    (row) => ({ content: row.content }),
    (row, changes) =>
      tx
        .update(reusableSectionVersions)
        .set(changes)
        .where(eq(reusableSectionVersions.id, row.id)),
  );

  return totals;
}
