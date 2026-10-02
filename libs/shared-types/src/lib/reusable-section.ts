import { z } from 'zod';
import type { Block, PageContent } from './content-model';
import { eachBlock } from './block-tree';

/**
 * A reusable section, and the two things an author can do with one
 * (docs/adr/0059):
 *
 * - `shared` — a LIVE REFERENCE. The page stores only the id; the section's
 *   published content is resolved at read time, so publishing the section
 *   changes every page using it without republishing any of them.
 * - `template` — a COPY, taken once at insert time and then free to
 *   diverge. Nothing links it back to the original afterwards.
 *
 * Two kinds and not a flag on the insert action, because they are two
 * different promises to the person inserting it, and the menu has to say
 * which one they are getting. Both share the draft/publish cycle: what a
 * template copies is the section's PUBLISHED content, not whatever the
 * agency happens to have half-finished in the draft.
 */
export const REUSABLE_SECTION_KINDS = ['shared', 'template'] as const;
export const reusableSectionKindSchema = z.enum(REUSABLE_SECTION_KINDS);
export type ReusableSectionKind = (typeof REUSABLE_SECTION_KINDS)[number];

/** A section's own draft/publish cycle — its own list, not a page's, even while the two hold the same words. */
export const REUSABLE_SECTION_STATUSES = ['draft', 'published'] as const;
export type ReusableSectionStatus = (typeof REUSABLE_SECTION_STATUSES)[number];

/**
 * Which fields of which blocks inside the section an author may change on
 * a single instance — keyed by the inner block's id, then the field keys.
 *
 * Everything not listed here is locked: structure, order, styles, adding
 * and removing blocks. That asymmetry is the entire point of the feature,
 * and it is the reason this lives on the SECTION and not on the instance:
 * the agency that built the section decides what the client may touch, and
 * the client cannot grant themselves more.
 *
 * A stale entry (the block it names was deleted from the section) is
 * harmless — an override for a block that no longer exists is simply never
 * applied — so nothing has to garbage-collect this.
 */
export const exposedFieldsSchema = z.record(z.string(), z.array(z.string()));
export type ExposedFields = z.infer<typeof exposedFieldsSchema>;

/**
 * The one prop key that carries an instance's value for one exposed field.
 *
 * Flat, and deliberately so. `PageTranslation.fieldValues` overlays whole
 * PROPS by key (`{...block.props, ...overrides}`, see
 * field-value-overlay.ts) — so a nested `overrides` object would be
 * replaced wholesale by the first locale that touched any single field,
 * losing the others. One prop per exposed field means the translation
 * overlay works on a section instance with no changes at all, per field,
 * and the "missing translation" indicator keeps working the way it does
 * everywhere else. That was the decision taken 2026-09-08: an instance's
 * value is shared across locales and translated like any other field.
 */
export function sectionOverrideKey(blockId: string, field: string): string {
  return `ovr:${blockId}:${field}`;
}

/**
 * The exit barrier for those keys, applied where they are READ back and
 * not only where they were written (the rule PR #144 established for the
 * style overrides): a zod `catchall` validates the VALUE of an unknown key
 * and says nothing whatever about the key itself, which is how a hostile
 * key would otherwise travel intact through the schema.
 */
const OVERRIDE_KEY = /^ovr:([A-Za-z0-9_-]{1,64}):([A-Za-z][A-Za-z0-9_]{0,63})$/;

export function parseSectionOverrideKey(
  key: string,
): { blockId: string; field: string } | null {
  const [, blockId, field] = OVERRIDE_KEY.exec(key) ?? [];
  return blockId === undefined || field === undefined
    ? null
    : { blockId, field };
}

/**
 * A section instance. `sectionName` is denormalised for the canvas label
 * alone, exactly as `PickedForm.formName` is (docs/adr/0015) — the render
 * path never trusts it and always resolves the section's real content by
 * id.
 */
export const pickedSectionSchema = z.object({
  sectionId: z.string(),
  sectionName: z.string(),
});
export type PickedSection = z.infer<typeof pickedSectionSchema>;

export const sectionPropsSchema = z
  .object({ section: pickedSectionSchema.nullable() })
  // Every other key is one exposed field's value for THIS instance. The
  // superRefine is not decoration: without it `catchall` would accept any
  // key at all, including one that shadows `section`.
  .catchall(z.string())
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (key !== 'section' && !OVERRIDE_KEY.test(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Not a section override key: ${key}`,
          path: [key],
        });
      }
    }
  });
/**
 * Declared rather than inferred from the schema above, and this is the
 * one place in this package where that is the right call.
 *
 * `z.object({...}).catchall(z.string())` infers
 * `{ [x: string]: string; section: PickedSection | null }` — a type whose
 * index signature contradicts its own declared member, so not even
 * `{ section: null }` satisfies it. The schema is still the runtime
 * authority (it is what rejects a hostile key); this is the same shape
 * written in a form TypeScript can actually hold.
 */
export interface SectionProps {
  section: PickedSection | null;
  /** One entry per exposed field — see `sectionOverrideKey`. */
  [overrideKey: string]: PickedSection | string | null | undefined;
}

/**
 * Every instance value carried by one Section block, by inner block id.
 *
 * A `Map`, not an object: the id comes out of stored props and may be any
 * string the key pattern allows, `__proto__` among them, and an object
 * keyed by it writes to the prototype instead of holding the value.
 */
export function sectionOverridesFromProps(
  props: Record<string, unknown>,
): Map<string, Record<string, string>> {
  const overrides = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(props)) {
    const parsed = parseSectionOverrideKey(key);
    if (!parsed || typeof value !== 'string') {
      continue;
    }
    overrides.set(parsed.blockId, {
      ...overrides.get(parsed.blockId),
      [parsed.field]: value,
    });
  }
  return overrides;
}

/**
 * The section a block points at, or `null` for every block that is not a
 * section instance. A type predicate rather than a cast: what arrives here
 * is a `Record<string, unknown>` read out of jsonb, so the only honest way
 * to get a `PickedSection` out of it is to check it.
 */
function pickedSectionOf(block: Block): PickedSection | null {
  if (block.type !== 'Section') {
    return null;
  }
  const section: unknown = block.props?.['section'];
  return isPickedSection(section) ? section : null;
}

function isPickedSection(value: unknown): value is PickedSection {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['sectionId'] === 'string'
  );
}

/** The section ids one or more content trees reference, deduped. */
export function collectSectionReferences(contents: PageContent[]): Set<string> {
  const ids = new Set<string>();
  for (const block of contents.flatMap((content) => [...eachBlock(content)])) {
    const section = pickedSectionOf(block);
    if (section) {
      ids.add(section.sectionId);
    }
  }
  return ids;
}

/**
 * The section's own blocks, with this instance's values grafted on. Ids
 * are rewritten to be unique to the instance — see `instanceBlockId`.
 */
function applyOverrides(
  blocks: PageContent,
  overrides: ReadonlyMap<string, Record<string, string>>,
  instanceId: string,
): PageContent {
  return blocks.map((block): Block => {
    const values = block.id ? overrides.get(block.id) : undefined;
    return {
      ...block,
      ...(block.id ? { id: instanceBlockId(instanceId, block.id) } : {}),
      props: values ? { ...block.props, ...values } : block.props,
      ...(block.children
        ? { children: applyOverrides(block.children, overrides, instanceId) }
        : {}),
    };
  });
}

/**
 * The id a section's block gets once it is standing inside a page.
 *
 * It has to change. A block id is not decoration here: it keys the
 * per-instance style rule (`blockInstanceClassName` emits `.kometio-rb-<id>`)
 * and the translation overlay. The same section placed twice on one page
 * would otherwise put two elements with the same id — and the same
 * generated class — on one document, so a style meant for the second copy
 * would land on both. Deriving it from the instance keeps it stable across
 * renders, which a random id would not.
 */
export function instanceBlockId(instanceId: string, blockId: string): string {
  return `${instanceId}--${blockId}`;
}

/**
 * Expands every `Section` block into the section's published blocks.
 *
 * Runs BEFORE page-reference resolution, never after: a section can hold a
 * Link, and that link needs resolving in the locale being rendered exactly
 * like any other. Running it the other way round would leave those links
 * pointing nowhere, silently.
 *
 * A section that is missing, unpublished, or belongs to another site
 * resolves to a block with no children — the page still renders, minus a
 * strip. Throwing would take down every page that ever used it.
 */
export function resolveSectionBlocks(
  content: PageContent,
  publishedById: ReadonlyMap<string, PageContent>,
): PageContent {
  return content.map((block): Block => {
    const children = block.children
      ? resolveSectionBlocks(block.children, publishedById)
      : undefined;
    const section = pickedSectionOf(block);
    if (!section) {
      return { ...block, ...(children ? { children } : {}) };
    }
    const published = publishedById.get(section.sectionId);
    return {
      ...block,
      children: published
        ? applyOverrides(
            published,
            sectionOverridesFromProps(block.props ?? {}),
            block.id ?? section.sectionId,
          )
        : [],
    };
  });
}

/**
 * A deep copy of a section's blocks with brand-new ids, for the `template`
 * kind. New ids and not the section's own: the copy is a separate thing
 * from that moment on, and sharing ids with the section (or with a second
 * copy of the same template on the same page) would make the per-instance
 * style rules of one apply to the other.
 */
export function copySectionBlocks(
  blocks: PageContent,
  newId: () => string,
): PageContent {
  return blocks.map((block): Block => ({
    ...block,
    ...(block.id ? { id: newId() } : {}),
    ...(block.children
      ? { children: copySectionBlocks(block.children, newId) }
      : {}),
  }));
}
