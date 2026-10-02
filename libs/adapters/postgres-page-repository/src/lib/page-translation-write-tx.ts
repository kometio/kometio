import { and, eq } from 'drizzle-orm';
import {
  PageSlugAlreadyExistsError,
  PageTranslationLocaleAlreadyExistsError,
  PageTranslationNotFoundError,
  type PageTranslationProps,
} from '@kometio/domain-core';
import {
  type KometioTx,
  isUniqueViolation,
  pageTranslations,
} from '@kometio/postgres-db';

/*
 * Writing one language row, shared by the translations repository and by
 * the page groups repository — which writes a page and its first language
 * in one transaction (docs/adr/0072) and must write that row, and refuse
 * its address, exactly the way a translation saved on its own is.
 */

// The second name is the one ACTUALLY applied in Postgres, not the one
// Drizzle generates before truncation: Postgres identifiers are capped at
// 63 bytes, and this auto-generated name exceeds them — verified live with
// `select conname from pg_constraint where conrelid =
// 'page_translations'::regclass`, not assumed by analogy with `pages`'
// shorter name. `isUniqueViolation` does an exact comparison, and a wrong
// name here would let a raw PostgresError surface instead of the domain
// error.
const SLUG_UNIQUE_CONSTRAINT =
  'page_translations_tenant_id_site_id_locale_parent_group_id_slug';
const ROOT_SLUG_UNIQUE_CONSTRAINT = 'page_translations_root_slug_unique';
const LOCALE_UNIQUE_CONSTRAINT =
  'page_translations_tenant_id_page_group_id_locale_unique';

export function pageTranslationRow(
  props: PageTranslationProps,
  parentGroupId: string | null,
) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    siteId: props.siteId,
    pageGroupId: props.pageGroupId,
    parentGroupId,
    locale: props.locale,
    slug: props.slug,
    formerSlugs: props.formerSlugs,
    formerParents: props.formerParents,
    seoMeta: props.seoMeta,
    fieldValues: props.fieldValues,
    status: props.status,
    publishedSnapshot: props.publishedSnapshot,
    isDiverged: props.isDiverged,
    divergedContent: props.divergedContent,
    createdBy: props.createdBy,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    updatedBy: props.updatedBy,
    contentUpdatedAt: props.contentUpdatedAt,
    publishedAt: props.publishedAt,
  };
}

export type PageTranslationRow = ReturnType<typeof pageTranslationRow>;

/** Who changed a translation, and when: every kind of change writes these too. */
export function editStamp(
  props: Pick<PageTranslationProps, 'updatedAt' | 'updatedBy'>,
) {
  return { updatedAt: props.updatedAt, updatedBy: props.updatedBy };
}

/** A new translation. An id already taken fails loudly instead of overwriting. */
export function insertPageTranslationTx(
  tx: KometioTx,
  row: PageTranslationRow,
) {
  return tx.insert(pageTranslations).values(row);
}

/**
 * Writes the columns given to an existing translation, and nothing else —
 * each kind of change (content, publication, SEO, address, place in the
 * tree) names its own, so two changes landing together do not undo each
 * other: a publish used to write back the field values it had read, over an
 * autosave that arrived in between. A translation deleted meanwhile is
 * `PageTranslationNotFoundError`, never re-created.
 */
export async function updatePageTranslationTx(
  tx: KometioTx,
  target: { tenantId: string; id: string },
  set: Partial<typeof pageTranslations.$inferInsert>,
): Promise<void> {
  const updated = await tx
    .update(pageTranslations)
    .set(set)
    .where(
      and(
        eq(pageTranslations.tenantId, target.tenantId),
        eq(pageTranslations.id, target.id),
      ),
    )
    .returning({ id: pageTranslations.id });
  if (updated.length === 0) {
    throw new PageTranslationNotFoundError(target.id);
  }
}

/** The same reason as its namesake in DrizzlePageRepository: a conflict under real concurrency has to be translated into the same domain error the use case throws in the common case, not left to surface as a raw 500. */
export async function withPageTranslationUniqueViolations<T>(
  row: Pick<PageTranslationRow, 'slug' | 'locale'>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT) ||
      isUniqueViolation(error, ROOT_SLUG_UNIQUE_CONSTRAINT)
    ) {
      throw new PageSlugAlreadyExistsError(row.slug);
    }
    if (isUniqueViolation(error, LOCALE_UNIQUE_CONSTRAINT)) {
      throw new PageTranslationLocaleAlreadyExistsError(row.locale);
    }
    throw error;
  }
}
