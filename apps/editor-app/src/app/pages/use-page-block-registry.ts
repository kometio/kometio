import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pageBlockCategories, pageBlocks } from '@kometio/block-registry';
import { COMMERCE_BLOCK_TYPES } from '@kometio/shared-types';
import {
  mergeThemeBlocks,
  type PageBlockRegistry,
} from '../style/merge-theme-blocks';
import { themeBlockVariantsQueryOptions } from '../style/theme-block-variants-queries';
import { themePageBlocksQueryOptions } from '../style/theme-page-blocks-queries';
import { themeStylePropertiesQueryOptions } from '../style/theme-style-properties-queries';
import { useActiveThemeName } from '../style/use-active-theme-name';

/**
 * Docs/adr/0041 — the one integration point `page-group-editor-view.tsx`
 * needs: replaces its old static `registry={pageBlocks}` /
 * `categories={pageBlockCategories}` props with this hook's output. Falls
 * back to the core-only registry (`data` undefined) while the query is
 * still in flight — `CanvasEditorShell` already renders fine with just
 * the core blocks, so there's no loading state to design for here, a
 * theme block just appears in the picker a moment after everything else.
 */
export function usePageBlockRegistry(): PageBlockRegistry {
  const themeName = useActiveThemeName();
  const { data } = useQuery(themePageBlocksQueryOptions(themeName));
  // The looks a theme adds to CORE types (ADR-0047) — a separate query
  // from the one above, which brings its own new types: they answer
  // different questions and a theme commonly has one and not the other.
  const { data: themeVariants } = useQuery(
    themeBlockVariantsQueryOptions(themeName),
  );
  // ...and what it added to core's style vocabulary (ADR-0047): a third
  // question, and a theme commonly answers one of the three and not the
  // others.
  const { data: themeStyleProperties } = useQuery(
    themeStylePropertiesQueryOptions(themeName),
  );
  return useMemo(
    () =>
      withoutHiddenBlocks(
        mergeThemeBlocks(
          pageBlocks,
          pageBlockCategories,
          data ?? [],
          themeVariants ?? {},
          themeStyleProperties ?? {},
        ),
      ),
    [data, themeVariants, themeStyleProperties],
  );
}

/**
 * Drops the types the free core does not offer (ADR-0084) from the
 * picker, and only from the picker.
 *
 * `registry` is left whole on purpose: it is what draws the inspector and
 * resolves a block already on a page, so a page saved with one of these
 * keeps opening, keeps editing and keeps publishing. What goes away is
 * the shelf it was taken from — the one place a NEW one could be added.
 *
 * Applied after the theme has been merged in, so a theme that ships its
 * own block under one of these categories brings the category back with
 * it; applied here rather than in `@kometio/block-registry` so that
 * `pageBlockCategories` stays an honest description of what the registry
 * holds, guarded by its own spec, instead of quietly becoming a
 * description of what one product decided to sell.
 *
 * Emptying a category is left to empty it: `BlockPicker` already drops a
 * category with nothing left in it, because searching and `canInsert`
 * empty categories too, and one rule there beats the same rule written
 * twice.
 */
export function withoutHiddenBlocks(
  blocks: PageBlockRegistry,
): PageBlockRegistry {
  const hidden = new Set<string>(COMMERCE_BLOCK_TYPES);

  return {
    registry: blocks.registry,
    categories: blocks.categories.map((category) => ({
      ...category,
      types: category.types.filter((type) => !hidden.has(type)),
    })),
  };
}
