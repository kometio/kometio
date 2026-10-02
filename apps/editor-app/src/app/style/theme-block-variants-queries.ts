import { fetchThemeBlockVariants } from '../../lib/theme-api-client';
import { registerBlockTranslations } from '../common/block-translations';
import { themeQueryOptions } from './theme-query-options';

/**
 * The looks a theme adds to core block types (ADR-0047).
 *
 * Like `themePageBlocksQueryOptions`, it also registers the labels into
 * i18next: a theme cannot add keys to the editor's bundles at build time,
 * so its strings travel with the data. They land under
 * `blocks.<type>.variants.<value>` — the very key a CORE variant already
 * uses, so nothing downstream has to know where a variant came from.
 */
export function themeBlockVariantsQueryOptions(themeName: string) {
  return themeQueryOptions('theme-block-variants', themeName, async (name) => {
    const response = await fetchThemeBlockVariants(name);
    for (const [blockType, { variants }] of Object.entries(response)) {
      const labels = (locale: 'en' | 'it') =>
        Object.fromEntries(
          variants.map((variant) => [variant.value, variant.label[locale]]),
        );
      registerBlockTranslations(blockType, {
        en: { variants: labels('en') },
        it: { variants: labels('it') },
      });
    }
    return response;
  });
}
