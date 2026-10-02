/**
 * A one-off pass that rewrites every rich text value already in the
 * database into the shape `kind: 'richtext'` expects (ADR-0046): HTML,
 * sanitised, with `&` and `<` escaped in what used to be plain text.
 *
 * Unlike the block-id backfill this is modelled on, it is NOT a
 * precondition for deploying. `normalizeRichText` runs on the write path
 * (apps/api) and again on the read path (apps/public-site), and it is
 * idempotent, so an installation that never runs this still renders
 * correctly — the scripts in this repo are executed by hand, and a
 * self-hoster who upgrades without reading the release notes should not
 * lose the text on their site.
 *
 * What it buys is a database that holds one shape rather than two: the
 * search index, exports and the API's own responses then see HTML
 * everywhere, and the read-path normalisation becomes belt to the write
 * path's braces rather than load-bearing.
 *
 * Safe to re-run. It writes only where a value actually changed.
 */
import {
  blockTypesById,
  normalizeRichText,
  transformRichTextInContent,
  transformRichTextInOverlay,
  type IsRichTextField,
} from '@kometio/rich-text';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import type { FieldValueOverlay, PageContent } from '@kometio/shared-types';
import { eq } from 'drizzle-orm';
import {
  createAppDb,
  withTenant,
  type KometioDb,
  type KometioTx,
} from '../src/lib/client';
import {
  pageGroupVersions,
  pageGroups,
  pageTranslationVersions,
  pageTranslations,
  siteLayoutSectionVersions,
  siteLayoutSections,
  tenants,
} from '../src/lib/schema';

const RICH_TEXT_FIELDS = new Set(
  [...pageBlocks, ...headerFooterBlocks].flatMap((descriptor) =>
    descriptor.fields
      .filter((field) => field.kind === 'richtext')
      .map((field) => `${descriptor.type}.${field.key}`),
  ),
);

/**
 * Core blocks only, which is what this process can see: a theme's blocks
 * are compiled into the public site at build time and a Node script
 * cannot load them. Their values are normalised on read instead, which is
 * why that path exists.
 */
const isRichTextField: IsRichTextField = (blockType, fieldKey) =>
  RICH_TEXT_FIELDS.has(`${blockType}.${fieldKey}`);

let updated = 0;
let untouched = 0;

function normalizeContent(content: PageContent | null): PageContent | null {
  return content === null
    ? null
    : transformRichTextInContent(content, isRichTextField, normalizeRichText);
}

/** Same object back when nothing changed, which is how the callers below decide whether to write. */
function changed<T>(before: T, after: T): boolean {
  return before !== after;
}

async function normalizePageGroups(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: pageGroups.id, content: pageGroups.content })
    .from(pageGroups)
    .where(eq(pageGroups.tenantId, tenantId));

  for (const row of rows) {
    const content = normalizeContent(row.content);
    if (!changed(row.content, content)) {
      untouched += 1;
      continue;
    }
    await tx
      .update(pageGroups)
      .set({ content: content as PageContent })
      .where(eq(pageGroups.id, row.id));
    updated += 1;
  }
}

async function normalizePageGroupVersions(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({ id: pageGroupVersions.id, content: pageGroupVersions.content })
    .from(pageGroupVersions)
    .where(eq(pageGroupVersions.tenantId, tenantId));

  for (const row of rows) {
    const content = normalizeContent(row.content);
    if (!changed(row.content, content)) {
      untouched += 1;
      continue;
    }
    await tx
      .update(pageGroupVersions)
      .set({ content: content as PageContent })
      .where(eq(pageGroupVersions.id, row.id));
    updated += 1;
  }
}

/**
 * The per-locale overlay records a block ID and not a type, so it needs
 * the group's own tree to know which values are rich text at all.
 * Normalising every value instead would be destructive: `Code.code` is
 * deliberately `translatable`, and a snippet would lose everything after
 * its first `<`.
 */
async function normalizePageTranslations(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({
      id: pageTranslations.id,
      pageGroupId: pageTranslations.pageGroupId,
      fieldValues: pageTranslations.fieldValues,
      publishedSnapshot: pageTranslations.publishedSnapshot,
      divergedContent: pageTranslations.divergedContent,
    })
    .from(pageTranslations)
    .where(eq(pageTranslations.tenantId, tenantId));

  const treeByGroupId = new Map<string, Map<string, string>>();
  for (const row of rows) {
    let types = treeByGroupId.get(row.pageGroupId);
    if (!types) {
      const [group] = await tx
        .select({ content: pageGroups.content })
        .from(pageGroups)
        .where(eq(pageGroups.id, row.pageGroupId));
      types = blockTypesById(group?.content ?? []);
      treeByGroupId.set(row.pageGroupId, types);
    }

    const fieldValues = transformRichTextInOverlay(
      row.fieldValues,
      types,
      isRichTextField,
      normalizeRichText,
    );
    const snapshot = normalizeContent(row.publishedSnapshot);
    const diverged = normalizeContent(row.divergedContent);

    const overlayChanged =
      JSON.stringify(fieldValues) !== JSON.stringify(row.fieldValues);
    if (
      !overlayChanged &&
      !changed(row.publishedSnapshot, snapshot) &&
      !changed(row.divergedContent, diverged)
    ) {
      untouched += 1;
      continue;
    }

    await tx
      .update(pageTranslations)
      .set({
        fieldValues: fieldValues as FieldValueOverlay,
        publishedSnapshot: snapshot,
        divergedContent: diverged,
      })
      .where(eq(pageTranslations.id, row.id));
    updated += 1;
  }
}

async function normalizePageTranslationVersions(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({
      id: pageTranslationVersions.id,
      pageTranslationId: pageTranslationVersions.pageTranslationId,
      fieldValues: pageTranslationVersions.fieldValues,
    })
    .from(pageTranslationVersions)
    .where(eq(pageTranslationVersions.tenantId, tenantId));

  for (const row of rows) {
    const [translation] = await tx
      .select({ pageGroupId: pageTranslations.pageGroupId })
      .from(pageTranslations)
      .where(eq(pageTranslations.id, row.pageTranslationId));
    if (!translation) {
      untouched += 1;
      continue;
    }
    const [group] = await tx
      .select({ content: pageGroups.content })
      .from(pageGroups)
      .where(eq(pageGroups.id, translation.pageGroupId));

    const fieldValues = transformRichTextInOverlay(
      row.fieldValues,
      blockTypesById(group?.content ?? []),
      isRichTextField,
      normalizeRichText,
    );
    if (JSON.stringify(fieldValues) === JSON.stringify(row.fieldValues)) {
      untouched += 1;
      continue;
    }
    await tx
      .update(pageTranslationVersions)
      .set({ fieldValues: fieldValues as FieldValueOverlay })
      .where(eq(pageTranslationVersions.id, row.id));
    updated += 1;
  }
}

async function normalizeSiteLayoutSections(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({
      id: siteLayoutSections.id,
      content: siteLayoutSections.content,
      publishedContent: siteLayoutSections.publishedContent,
    })
    .from(siteLayoutSections)
    .where(eq(siteLayoutSections.tenantId, tenantId));

  for (const row of rows) {
    const content = normalizeContent(row.content);
    const published = normalizeContent(row.publishedContent);
    if (
      !changed(row.content, content) &&
      !changed(row.publishedContent, published)
    ) {
      untouched += 1;
      continue;
    }
    await tx
      .update(siteLayoutSections)
      .set({ content: content as PageContent, publishedContent: published })
      .where(eq(siteLayoutSections.id, row.id));
    updated += 1;
  }
}

async function normalizeSiteLayoutSectionVersions(
  tx: KometioTx,
  tenantId: string,
): Promise<void> {
  const rows = await tx
    .select({
      id: siteLayoutSectionVersions.id,
      content: siteLayoutSectionVersions.content,
    })
    .from(siteLayoutSectionVersions)
    .where(eq(siteLayoutSectionVersions.tenantId, tenantId));

  for (const row of rows) {
    const content = normalizeContent(row.content);
    if (!changed(row.content, content)) {
      untouched += 1;
      continue;
    }
    await tx
      .update(siteLayoutSectionVersions)
      .set({ content: content as PageContent })
      .where(eq(siteLayoutSectionVersions.id, row.id));
    updated += 1;
  }
}

async function main(): Promise<void> {
  const db: KometioDb = createAppDb();
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  for (const tenant of allTenants) {
    await withTenant(db, tenant.id, async (tx) => {
      await normalizePageGroups(tx, tenant.id);
      await normalizePageGroupVersions(tx, tenant.id);
      await normalizePageTranslations(tx, tenant.id);
      await normalizePageTranslationVersions(tx, tenant.id);
      await normalizeSiteLayoutSections(tx, tenant.id);
      await normalizeSiteLayoutSectionVersions(tx, tenant.id);
    });
  }

  console.log(
    `Rich text normalised: ${updated} rows rewritten, ${untouched} already in shape (${allTenants.length} tenants).`,
  );
  await db.$client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
