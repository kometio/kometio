import type { PageContent } from '@kometio/shared-types';
import { eq } from 'drizzle-orm';
import type { KometioTx } from '../src/lib/client';
import {
  pageGroups,
  pageGroupVersions,
  pageTranslations,
  siteLayoutSections,
  siteLayoutSectionVersions,
} from '../src/lib/schema';

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
 * `transform` reports whether it changed anything, so a row that is
 * already current is not rewritten — which is what makes a script built
 * on this safe to re-run.
 */
export type ContentTransform = (content: PageContent) => {
  content: PageContent;
  changed: boolean;
};

export interface VisitTotals {
  rewritten: number;
  untouched: number;
}

/** The content columns of one row, transformed together: a row is written once, or not at all. */
function changedColumns(
  transform: ContentTransform,
  columns: Record<string, PageContent | null>,
): Record<string, PageContent> | null {
  const changes: Record<string, PageContent> = {};
  for (const [name, content] of Object.entries(columns)) {
    if (!content) {
      continue;
    }
    const result = transform(content);
    if (result.changed) {
      changes[name] = result.content;
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export async function visitStoredContent(
  tx: KometioTx,
  tenantId: string,
  transform: ContentTransform,
): Promise<VisitTotals> {
  const totals: VisitTotals = { rewritten: 0, untouched: 0 };

  const count = (changed: boolean): void => {
    if (changed) {
      totals.rewritten += 1;
    } else {
      totals.untouched += 1;
    }
  };

  // The canonical block tree of every page.
  for (const row of await tx
    .select({ id: pageGroups.id, content: pageGroups.content })
    .from(pageGroups)
    .where(eq(pageGroups.tenantId, tenantId))) {
    const changes = changedColumns(transform, { content: row.content });
    if (changes) {
      await tx.update(pageGroups).set(changes).where(eq(pageGroups.id, row.id));
    }
    count(Boolean(changes));
  }

  for (const row of await tx
    .select({ id: pageGroupVersions.id, content: pageGroupVersions.content })
    .from(pageGroupVersions)
    .where(eq(pageGroupVersions.tenantId, tenantId))) {
    const changes = changedColumns(transform, { content: row.content });
    if (changes) {
      await tx
        .update(pageGroupVersions)
        .set(changes)
        .where(eq(pageGroupVersions.id, row.id));
    }
    count(Boolean(changes));
  }

  // `publishedSnapshot` matters as much as the draft: it is what the
  // public site actually serves, frozen at publish time — nothing rewrites
  // it on its own. `divergedContent` is the structure of a translation
  // that has been unlinked from its group.
  for (const row of await tx
    .select({
      id: pageTranslations.id,
      publishedSnapshot: pageTranslations.publishedSnapshot,
      divergedContent: pageTranslations.divergedContent,
    })
    .from(pageTranslations)
    .where(eq(pageTranslations.tenantId, tenantId))) {
    const changes = changedColumns(transform, {
      publishedSnapshot: row.publishedSnapshot,
      divergedContent: row.divergedContent,
    });
    if (changes) {
      await tx
        .update(pageTranslations)
        .set(changes)
        .where(eq(pageTranslations.id, row.id));
    }
    count(Boolean(changes));
  }

  // The header and footer regions, draft and published.
  for (const row of await tx
    .select({
      id: siteLayoutSections.id,
      content: siteLayoutSections.content,
      publishedContent: siteLayoutSections.publishedContent,
    })
    .from(siteLayoutSections)
    .where(eq(siteLayoutSections.tenantId, tenantId))) {
    const changes = changedColumns(transform, {
      content: row.content,
      publishedContent: row.publishedContent,
    });
    if (changes) {
      await tx
        .update(siteLayoutSections)
        .set(changes)
        .where(eq(siteLayoutSections.id, row.id));
    }
    count(Boolean(changes));
  }

  for (const row of await tx
    .select({
      id: siteLayoutSectionVersions.id,
      content: siteLayoutSectionVersions.content,
    })
    .from(siteLayoutSectionVersions)
    .where(eq(siteLayoutSectionVersions.tenantId, tenantId))) {
    const changes = changedColumns(transform, { content: row.content });
    if (changes) {
      await tx
        .update(siteLayoutSectionVersions)
        .set(changes)
        .where(eq(siteLayoutSectionVersions.id, row.id));
    }
    count(Boolean(changes));
  }

  return totals;
}
