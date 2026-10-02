import { blockStyleOverrideSchema } from '@kometio/shared-types';

/**
 * A style property a theme ADDS to a block type (ADR-0047's consequence
 * on `stylableProperties`), declared in
 * `themes/<name>/blocks/<Type>.style.ts`.
 *
 * The case it exists for: a theme gives a Card an elevation, and wants
 * the AGENCY to tune it per block from the editor rather than by editing
 * the theme's CSS. Everything else a theme needs it already has — its own
 * markup, its own CSS, its own variants.
 *
 * The theme does not name the CSS variable. `cardElevation` becomes
 * `--kometio-override-card-elevation`, derived: a theme naming it could
 * point two properties at one variable or collide with a core one, and
 * neither mistake announces itself. The theme's CSS reads the derived
 * name.
 */
export interface ThemeStyleProperty {
  /** Becomes a CSS custom property name, so it is a lower camel-case identifier and nothing else. */
  key: string;
  /** Which control the editor draws. `select` needs `options`; `length` may offer a `placeholder`. */
  control: 'color' | 'length' | 'select';
  /** One label per locale the editor speaks — registered under `blocks.<type>.styleProperties.<key>`. */
  label: Record<string, string>;
  placeholder?: string;
  options?: readonly string[];
}

/** One theme file: the block type it extends, and the properties it adds. */
export interface ThemeStylePropertyExtension {
  blockType: string;
  properties: ThemeStyleProperty[];
}

export interface ThemeStylePropertyError {
  blockType: string;
  message: string;
}

const PROPERTY_KEY = /^[a-z][A-Za-z0-9]{0,63}$/;
const CONTROLS = new Set(['color', 'length', 'select']);

/** The property names core itself ships, read from the schema rather than repeated — the one list that cannot drift because it IS the source. */
export const CORE_STYLE_PROPERTY_KEYS: readonly string[] = Object.keys(
  blockStyleOverrideSchema.shape,
);

/**
 * Shapes an `import.meta.glob({ eager: true })` map of `<Type>.style.ts`
 * files into extensions. Pure and Vite-agnostic, so the real loader and a
 * theme's own spec run identical code — the same arrangement as
 * `collectThemeVariantExtensions`.
 */
export function collectThemeStyleProperties(
  styleModules: Record<string, { default: ThemeStyleProperty[] }>,
): ThemeStylePropertyExtension[] {
  return Object.entries(styleModules).map(([path, mod]) => {
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    return {
      blockType: fileName.endsWith('.style.ts')
        ? fileName.slice(0, -'.style.ts'.length)
        : fileName,
      properties: mod.default,
    };
  });
}

/**
 * What can be checked without the core registry: keys, controls, labels,
 * and a theme repeating itself. The core-aware half —
 * the type exists, and the key is not one core already ships — is
 * `checkStylePropertiesAgainstCore`, called from each theme's own spec,
 * for the reason given on the variant equivalent.
 */
export function validateThemeStyleProperties(
  extensions: readonly ThemeStylePropertyExtension[],
  locales: readonly string[],
): ThemeStylePropertyError[] {
  const errors: ThemeStylePropertyError[] = [];

  for (const extension of extensions) {
    if (
      !Array.isArray(extension.properties) ||
      extension.properties.length === 0
    ) {
      errors.push({
        blockType: extension.blockType,
        message: 'must default-export a non-empty array of style properties',
      });
      continue;
    }

    const seen = new Set<string>();
    for (const property of extension.properties) {
      if (!PROPERTY_KEY.test(property.key)) {
        errors.push({
          blockType: extension.blockType,
          message: `property "${property.key}" must be a lower camel-case name — it becomes a CSS custom property`,
        });
        continue;
      }
      if (seen.has(property.key)) {
        errors.push({
          blockType: extension.blockType,
          message: `property "${property.key}" is declared twice`,
        });
        continue;
      }
      seen.add(property.key);

      if (!CONTROLS.has(property.control)) {
        errors.push({
          blockType: extension.blockType,
          message: `property "${property.key}" has no usable control — one of color, length, select`,
        });
      }
      if (property.control === 'select' && !property.options?.length) {
        errors.push({
          blockType: extension.blockType,
          message: `property "${property.key}" is a select with no options`,
        });
      }

      const missing = locales.filter((locale) => !property.label?.[locale]);
      if (missing.length > 0) {
        errors.push({
          blockType: extension.blockType,
          message: `property "${property.key}" has no label for ${missing.join(', ')}`,
        });
      }
    }
  }

  return errors;
}

/**
 * The half that needs the core registry: a theme may only extend a type
 * that EXISTS, and may not redeclare a property core already ships —
 * which would put two controls for one value in the panel, writing to the
 * same key.
 */
export function checkStylePropertiesAgainstCore(
  extensions: readonly ThemeStylePropertyExtension[],
  coreBlockTypes: readonly string[],
): ThemeStylePropertyError[] {
  const known = new Set(coreBlockTypes);
  const core = new Set(CORE_STYLE_PROPERTY_KEYS);
  return extensions.flatMap((extension) => {
    if (!known.has(extension.blockType)) {
      return [
        {
          blockType: extension.blockType,
          message:
            'is not a core block type — a theme adds style properties to a type that exists, and declares its own type with a .block.ts',
        },
      ];
    }
    return extension.properties
      .filter((property) => core.has(property.key))
      .map((property) => ({
        blockType: extension.blockType,
        message: `property "${property.key}" is one core already ships — add it to this block's stylableProperties instead of redeclaring it`,
      }));
  });
}
