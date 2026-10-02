import { z } from 'zod';
import type { Block, PageContent } from './content-model';

/**
 * ONE locale's translated text — only fields marked `translatable`
 * (`FieldDescriptor.translatable` in `@kometio/block-registry`) have an entry
 * here; an absent field inherits the shared value from `PageGroup.content`
 * (falling back to the site's default language). Keyed by block id and then
 * by field key — with no reference to the block's `kind`/type:
 * `mergeTranslatedContent` below does not (and must not) need to know which
 * fields are translatable, only which overrides actually exist. That
 * decision (where a change should be written: here or to
 * `PageGroup.content`) is the writer's responsibility, not the reader's —
 * see editor-app's InspectorPanel/usePropertyPatch.
 */
export const fieldValueOverlaySchema = z.record(
  z.string(),
  z.record(z.string(), z.string()),
);
export type FieldValueOverlay = z.infer<typeof fieldValueOverlaySchema>;

function mergeBlock(block: Block, fieldValues: FieldValueOverlay): Block {
  const overrides = block.id ? fieldValues[block.id] : undefined;
  const children = block.children?.map((child) =>
    mergeBlock(child, fieldValues),
  );
  return {
    ...block,
    props: overrides ? { ...block.props, ...overrides } : block.props,
    ...(children ? { children } : {}),
  };
}

/**
 * Produces the renderable tree for ONE language: the shared canonical
 * structure (`groupContent`, `PageGroup.content`) with that language's text
 * values grafted on top. A block without an `id` (which should not happen
 * after the initial backfill) never receives an override — there is no
 * reliable way to know which `fieldValues` entry it corresponds to. Pure
 * and one-way: it never produces `fieldValues` from a `PageContent` — that
 * direction (extracting overrides from already-written content) is the
 * one-off backfill script's job, not this function's.
 */
export function mergeTranslatedContent(
  groupContent: PageContent,
  fieldValues: FieldValueOverlay,
): PageContent {
  return groupContent.map((block) => mergeBlock(block, fieldValues));
}

export interface RelinkedOverlay {
  /** The fork's text, as this language's overlay on the shared structure. */
  fieldValues: FieldValueOverlay;
  /**
   * Blocks of the fork with no counterpart in the shared structure — no
   * block there with the same id and the same type. Relinking drops them,
   * and this is what the editor says before it happens.
   */
  lostBlockCount: number;
}

/**
 * The way back from `PageTranslation.diverge`: an unlinked language's own
 * tree turned into text laid over the shared structure again, keeping
 * every translation that still has somewhere to go.
 *
 * The other direction to `mergeTranslatedContent`, and deliberately as
 * narrow: a block's text survives when the shared structure still has that
 * block — same id, same type — and only for the fields the block declares
 * translatable, which the caller knows and this function must not (the
 * registry lives above this library). A value equal to the shared one is
 * not recorded, since an absent entry inherits it anyway. Matching is by
 * id, not by position: `mergeTranslatedContent` applies an overlay the
 * same way, so a block the fork moved still gets its text back.
 */
export function relinkedOverlay(
  groupContent: PageContent,
  divergedContent: PageContent,
  translatableFields: (blockType: string) => readonly string[],
): RelinkedOverlay {
  const shared = new Map<string, Block>();
  const index = (blocks: PageContent) => {
    for (const block of blocks) {
      if (block.id) shared.set(block.id, block);
      if (block.children) index(block.children);
    }
  };
  index(groupContent);

  const fieldValues: FieldValueOverlay = {};
  let lostBlockCount = 0;
  const walk = (blocks: PageContent) => {
    for (const block of blocks) {
      const counterpart = block.id ? shared.get(block.id) : undefined;
      if (!block.id || !counterpart || counterpart.type !== block.type) {
        lostBlockCount += 1;
      } else {
        for (const field of translatableFields(block.type)) {
          const value = block.props[field];
          if (typeof value === 'string' && value !== counterpart.props[field]) {
            fieldValues[block.id] = {
              ...fieldValues[block.id],
              [field]: value,
            };
          }
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(divergedContent);

  return { fieldValues, lostBlockCount };
}
