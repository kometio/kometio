import {
  blockTypesById,
  normalizeRichText,
  transformRichTextInContent,
  transformRichTextInOverlay,
  type IsRichTextField,
} from '@kometio/rich-text';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import type { FieldValueOverlay } from '@kometio/shared-types';
import { eq } from 'drizzle-orm';
import type { KometioTx } from './client';
import {
  pageGroups,
  pageTranslationVersions,
  pageTranslations,
} from './schema';
import {
  visitStoredContent,
  type ContentTransform,
  type VisitTotals,
} from './visit-stored-content';

const RICH_TEXT_FIELDS = new Set(
  [...pageBlocks, ...headerFooterBlocks].flatMap((descriptor) =>
    descriptor.fields
      .filter((field) => field.kind === 'richtext')
      .map((field) => `${descriptor.type}.${field.key}`),
  ),
);

/**
 * Core blocks only, which is what a Node process can see: a theme's blocks
 * are compiled into the public site at build time and a script cannot load
 * them. Their values are normalised on read instead, which is why that path
 * exists.
 */
const isRichTextField: IsRichTextField = (blockType, fieldKey) =>
  RICH_TEXT_FIELDS.has(`${blockType}.${fieldKey}`);

const normalizeBlockTree: ContentTransform = (content) => {
  const next = transformRichTextInContent(
    content,
    isRichTextField,
    normalizeRichText,
  );
  // The same object back when nothing changed: how a row is left alone.
  return { content: next, changed: next !== content };
};

/**
 * Rewrites every rich text value already stored into the shape
 * `kind: 'richtext'` expects (ADR-0046) — see `scripts/normalize-rich-text.ts`
 * for why, and why it is not a precondition for anything.
 *
 * The block trees are found by `visitStoredContent`, which derives where they
 * are from the schema: a table added tomorrow that holds one is visited
 * tomorrow, and reusable sections (rendered inside other pages) are visited
 * today, where this once kept a list of its own and forgot them. What is left
 * here is what a block tree does not carry: the per-language overlay of a
 * translation, which records a block's id and not its type.
 *
 * Idempotent: it writes only where a value changed.
 */
export async function normalizeStoredRichText(
  tx: KometioTx,
  tenantId: string,
): Promise<VisitTotals> {
  const totals = await visitStoredContent(tx, tenantId, normalizeBlockTree);
  const overlays = await normalizeOverlays(tx, tenantId);
  return {
    rewritten: totals.rewritten + overlays.rewritten,
    untouched: totals.untouched + overlays.untouched,
  };
}

/**
 * The per-locale overlay records a block id and not a type, so it needs the
 * group's own tree to know which values are rich text at all. Normalising
 * every value instead would be destructive: `Code.code` is deliberately
 * `translatable`, and a snippet would lose everything after its first `<`.
 */
async function normalizeOverlays(
  tx: KometioTx,
  tenantId: string,
): Promise<VisitTotals> {
  const totals: VisitTotals = { rewritten: 0, untouched: 0 };
  const typesByGroup = new Map<string, Map<string, string>>();

  const typesOf = async (groupId: string) => {
    let types = typesByGroup.get(groupId);
    if (!types) {
      const [group] = await tx
        .select({ content: pageGroups.content })
        .from(pageGroups)
        .where(eq(pageGroups.id, groupId));
      types = blockTypesById(group?.content ?? []);
      typesByGroup.set(groupId, types);
    }
    return types;
  };

  const translations = await tx
    .select({
      id: pageTranslations.id,
      pageGroupId: pageTranslations.pageGroupId,
      fieldValues: pageTranslations.fieldValues,
    })
    .from(pageTranslations)
    .where(eq(pageTranslations.tenantId, tenantId));
  for (const row of translations) {
    const next = transformRichTextInOverlay(
      row.fieldValues,
      await typesOf(row.pageGroupId),
      isRichTextField,
      normalizeRichText,
    );
    if (JSON.stringify(next) === JSON.stringify(row.fieldValues)) {
      totals.untouched += 1;
      continue;
    }
    await tx
      .update(pageTranslations)
      .set({ fieldValues: next as FieldValueOverlay })
      .where(eq(pageTranslations.id, row.id));
    totals.rewritten += 1;
  }

  const versions = await tx
    .select({
      id: pageTranslationVersions.id,
      pageTranslationId: pageTranslationVersions.pageTranslationId,
      fieldValues: pageTranslationVersions.fieldValues,
    })
    .from(pageTranslationVersions)
    .where(eq(pageTranslationVersions.tenantId, tenantId));
  const groupOfTranslation = new Map(
    translations.map((row) => [row.id, row.pageGroupId]),
  );
  for (const row of versions) {
    const groupId = groupOfTranslation.get(row.pageTranslationId);
    if (!groupId) {
      totals.untouched += 1;
      continue;
    }
    const next = transformRichTextInOverlay(
      row.fieldValues,
      await typesOf(groupId),
      isRichTextField,
      normalizeRichText,
    );
    if (JSON.stringify(next) === JSON.stringify(row.fieldValues)) {
      totals.untouched += 1;
      continue;
    }
    await tx
      .update(pageTranslationVersions)
      .set({ fieldValues: next as FieldValueOverlay })
      .where(eq(pageTranslationVersions.id, row.id));
    totals.rewritten += 1;
  }

  return totals;
}
