import {
  collectThemeStyleProperties,
  validateThemeStyleProperties,
  type ThemeStyleProperty as SdkThemeStyleProperty,
} from '@kometio/block-sdk';
import {
  themeStylePropertiesResponseSchema,
  type ThemeStylePropertiesResponse,
} from '@kometio/shared-types';
import { partitionByTheme, perTheme } from './theme-registry';

/**
 * The style properties a theme ADDS to a core block type (ADR-0047) —
 * `themes/<name>/blocks/<Type>.style.ts`.
 *
 * The case it exists for: a theme gives a Card an elevation and wants the
 * AGENCY to tune it per block from the editor, rather than by editing the
 * theme's CSS. Without it core is the only possible source of style
 * properties, which contradicts ADR-0037 and ADR-0041.
 *
 * As with variants, nothing here reaches the render path: the emitter
 * derives `--kometio-override-<kebab-key>` from whatever is in the stored
 * override, so a theme's property already emits. What this feeds is the
 * editor's style panel — without it the variable is settable by nobody.
 */
const styleModules = import.meta.glob<{ default: SdkThemeStyleProperty[] }>(
  '../../../../themes/*/blocks/*.style.ts',
  { eager: true },
);

const styleModulesByTheme = partitionByTheme(styleModules);

/** The locales the editor speaks, so a property with no label in one of them is refused rather than shown as a raw key. */
const EDITOR_LOCALES = ['en', 'it'] as const;

/**
 * Throws rather than skipping, the same posture as the block and variant
 * loaders: this runs at the server/build boundary where a theme author is
 * there to read the message.
 *
 * The two core-aware checks — the type exists, and the key is not one core
 * already ships — are in `checkStylePropertiesAgainstCore`, called from
 * each theme's own spec, which cannot depend on `@kometio/block-registry`
 * (docs/adr/0037).
 */
export const listThemeStyleProperties = perTheme(
  (resolvedTheme): ThemeStylePropertiesResponse => {
    const extensions = collectThemeStyleProperties(
      styleModulesByTheme.get(resolvedTheme) ?? {},
    );
    const errors = validateThemeStyleProperties(extensions, [
      ...EDITOR_LOCALES,
    ]);
    if (errors.length > 0) {
      const details = errors
        .map((error) => `  - ${error.blockType}: ${error.message}`)
        .join('\n');
      throw new Error(
        `Invalid style property extension(s) under themes/${resolvedTheme}/blocks/:\n${details}`,
      );
    }

    const response = themeStylePropertiesResponseSchema.parse(
      Object.fromEntries(
        extensions.map((extension) => [
          extension.blockType,
          extension.properties,
        ]),
      ),
    );
    return response;
  },
);
