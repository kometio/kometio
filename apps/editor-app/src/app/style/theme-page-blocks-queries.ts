import { fetchThemePageBlocks } from '../../lib/theme-api-client';
import { registerBlockTranslations } from '../common/block-translations';
import { themeQueryOptions } from './theme-query-options';

/**
 * A theme's own block types (docs/adr/0041), with each entry's strings
 * merged into i18next as they arrive, layered over — never clobbering —
 * the core block keys loaded at startup (`../i18n.ts`). Every block label
 * already resolves through `tLabel()` (`../lib/use-translation.ts`), which
 * accepts a plain string key, so a key i18next only learns at runtime
 * needs no type augmentation.
 */
export function themePageBlocksQueryOptions(themeName: string) {
  return themeQueryOptions('theme-page-blocks', themeName, async (name) => {
    const entries = await fetchThemePageBlocks(name);
    for (const entry of entries) {
      registerBlockTranslations(entry.descriptor.type, entry.locales);
    }
    return entries;
  });
}
