import type { BlockDescriptor } from '@kometio/block-registry';
import type {
  ThemeBlockEntry,
  ThemeBlockVariantsResponse,
  ThemeStylePropertiesResponse,
} from '@kometio/shared-types';
import type { BlockPickerCategory } from '../canvas/block-picker';
import { blockTranslationKey } from '../common/block-translations';

export interface PageBlockRegistry {
  registry: BlockDescriptor[];
  categories: BlockPickerCategory[];
}

/**
 * Docs/adr/0041 — folds a theme's own extra block types into the core
 * `pageBlocks`/`pageBlockCategories` pair, the same shape
 * `page-group-editor-view.tsx` already passes straight through to
 * `CanvasEditorShell`. `ThemeBlockEntry['descriptor']` (the hand-written
 * wire schema in `@kometio/shared-types`) is structurally assignable to
 * `BlockDescriptor` without a cast — every field lines up exactly,
 * `theme-blocks.ts`'s own comment explains why it's a separate type
 * rather than derived from `BlockDescriptor` directly.
 *
 * A theme block joins the SAME accordion category a core block of that
 * `category` already renders under (no separate "theme blocks" bucket) —
 * reuses `BlockDescriptor.category`, previously vestigial for core
 * blocks. `themeBlockCategorySchema` only allows the 6 slugs
 * `pageBlockCategories` already has a bucket for, so the `find()` below
 * can't actually miss in practice — kept as a graceful skip (not a
 * throw) anyway: this runs in the browser against a same-session HTTP
 * response, and a skipped block degrading out of the picker is a far
 * better failure mode here than crashing the whole editor over one bad
 * entry (the throw-loud posture belongs at the server/build boundary,
 * see resolve-theme-page-blocks.ts's own comment on that split).
 */
export function mergeThemeBlocks(
  coreBlocks: BlockDescriptor[],
  coreCategories: BlockPickerCategory[],
  themeEntries: ThemeBlockEntry[],
  themeVariants: ThemeBlockVariantsResponse = {},
  themeStyleProperties: ThemeStylePropertiesResponse = {},
): PageBlockRegistry {
  const categories = coreCategories.map((category) => ({
    ...category,
    types: [...category.types],
  }));
  const registry = coreBlocks.map((descriptor) =>
    withThemeStyleProperties(
      withThemeVariants(descriptor, themeVariants[descriptor.type]),
      themeStyleProperties[descriptor.type],
    ),
  );

  for (const entry of themeEntries) {
    registry.push(entry.descriptor);
    const category = categories.find(
      (c) => c.title === `blocks.categories.${entry.descriptor.category}`,
    );
    category?.types.push(entry.descriptor.type);
  }

  return { registry, categories };
}

/**
 * A core block plus the looks this theme adds to it (ADR-0047, under
 * ADR-0048's additive rule) — appended, never replacing: the block keeps
 * every variant it declares itself, and gains the theme's. Except the
 * ones the theme `hidden`: its own drawing of the block has no such look,
 * and offering it would be a choice that draws nothing.
 *
 * The label a theme sends is a string per locale, registered into
 * i18next under `blocks.<type>.variants.<value>` by
 * `themeBlockVariantsQueryOptions`. What the descriptor carries is that
 * key, exactly as a core variant does — so nothing downstream has to
 * know, or ask, where a given look came from.
 *
 * A theme redeclaring a value the block already has is refused at the
 * source (each theme's `blocks.spec.ts`, which can see the core
 * registry). Skipped here as well rather than trusted, because this runs
 * in a browser against an HTTP response: a duplicate would put the same
 * entry in the picker twice, one of them unreachable.
 */
function withThemeVariants(
  descriptor: BlockDescriptor,
  theme: ThemeBlockVariantsResponse[string] | undefined,
): BlockDescriptor {
  if (!theme || (theme.variants.length === 0 && theme.hidden.length === 0)) {
    return descriptor;
  }
  const hidden = new Set(theme.hidden);
  const own = (descriptor.variants ?? []).filter(
    (variant) => !hidden.has(variant.value),
  );
  const ownValues = new Set(own.map((variant) => variant.value));
  const key = blockTranslationKey(descriptor.type);
  const extra = theme.variants
    .filter((variant) => !ownValues.has(variant.value))
    .map((variant) => ({
      value: variant.value,
      label: `blocks.${key}.variants.${variant.value}`,
    }));
  return { ...descriptor, variants: [...own, ...extra] };
}

/**
 * A core block plus the style properties this theme added to it
 * (ADR-0047) — appended to `stylableProperties`, so they appear in the
 * style panel beside core's own.
 *
 * Only the KEYS go here; what control to draw for each comes from the
 * declarations, passed to `BlockStyleFields` separately. The two are
 * separate because `stylableProperties` is an ordering as much as a set,
 * and a theme's properties belong at the end of it.
 *
 * A theme redeclaring a key core already ships is refused at the source
 * (each theme's `blocks.spec.ts`). Skipped here too: this runs in a
 * browser against an HTTP response, and a duplicate would put two
 * controls in the panel writing to one value.
 */
function withThemeStyleProperties(
  descriptor: BlockDescriptor,
  added: ThemeStylePropertiesResponse[string] | undefined,
): BlockDescriptor {
  if (!added?.length) {
    return descriptor;
  }
  const own = new Set(descriptor.stylableProperties ?? []);
  const extra = added
    .map((property) => property.key)
    .filter((key) => !own.has(key));
  return extra.length > 0
    ? {
        ...descriptor,
        stylableProperties: [
          ...(descriptor.stylableProperties ?? []),
          ...extra,
        ],
      }
    : descriptor;
}
