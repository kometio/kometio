import { fetchThemeStyleProperties } from '../../lib/theme-api-client';
import { registerBlockTranslations } from '../common/block-translations';
import { themeQueryOptions } from './theme-query-options';

/**
 * The style properties a theme adds to core block types (ADR-0047).
 *
 * Registers the labels into i18next on arrival, like
 * `themeBlockVariantsQueryOptions`. They land under
 * `blocks.<type>.styleProperties.<key>`, which is where `BlockStyleFields`
 * looks — a core property reads its label from its own hardcoded map
 * instead, and neither has to know about the other.
 */
export function themeStylePropertiesQueryOptions(themeName: string) {
  return themeQueryOptions(
    'theme-style-properties',
    themeName,
    async (name) => {
      const response = await fetchThemeStyleProperties(name);
      for (const [blockType, properties] of Object.entries(response)) {
        const labels = (locale: 'en' | 'it') =>
          Object.fromEntries(
            properties.map((property) => [
              property.key,
              property.label[locale],
            ]),
          );
        registerBlockTranslations(blockType, {
          en: { styleProperties: labels('en') },
          it: { styleProperties: labels('it') },
        });
      }
      return response;
    },
  );
}
