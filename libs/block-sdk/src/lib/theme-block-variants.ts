/**
 * A theme adding named looks to a block type core already ships
 * (ADR-0047's fourth decision, under ADR-0048's additive rule).
 *
 * This is the surface ADR-0048 promised in place of letting a theme
 * redefine the block outright: twenty buttons out of a Figma file arrive
 * as twenty LOOKS of the one Button, not as twenty block types with
 * duplicated fields and a lost core Button. A theme declares them in
 * `themes/<name>/blocks/<Type>.variants.ts` and writes the CSS for
 * `.kometio-button--ghost` in its own stylesheet; nothing else changes, and
 * no stored page is touched.
 *
 * Labels live here rather than in a sibling `.locales.json`, unlike a
 * theme's own block type: that file exists because a whole descriptor has
 * many labels to translate, while a variant has exactly one. A second
 * file to remember, for one string per locale, buys nothing.
 */
export interface ThemeBlockVariant {
  /** Becomes part of a CSS class (`.kometio-button--ghost`), so it is checked like every other value that reaches a selector. */
  value: string;
  /** One label per locale the editor speaks. Registered under `blocks.<type>.variants.<value>`, the same key a core variant uses. */
  label: Record<string, string>;
}

/**
 * A `<Type>.variants.ts` file as a module: the looks it adds as its
 * default export, and — optionally — the core looks it `hides`.
 *
 * A theme may replace a core block outright and leave some of its looks
 * out; that is its call. What it could not do was say so: the editor kept
 * offering every core look, and a person who picked one got a block
 * drawn as if nothing had been chosen, with nothing to tell them why.
 * `hides` is that sentence — the editor stops offering those looks on a
 * site using the theme.
 */
export interface ThemeBlockVariantModule {
  default?: ThemeBlockVariant[];
  hides?: readonly string[];
}

/** One theme file: the core block type it extends, what it adds and what it hides. */
export interface ThemeBlockVariantExtension {
  blockType: string;
  variants: ThemeBlockVariant[];
  hides: string[];
}

export interface ThemeBlockVariantError {
  blockType: string;
  message: string;
}

const VARIANT_NAME = /^[a-z][a-z0-9-]{0,63}$/;
/** Reserved for the type's own look — `DEFAULT_VARIANT` in @kometio/shared-types, repeated rather than imported: this SDK stays free of that dependency so a theme can be built outside the monorepo (ADR-0037). */
const RESERVED_VARIANT = 'default';

/**
 * Shapes an `import.meta.glob({ eager: true })` map of
 * `<Type>.variants.ts` files into extensions. Pure and Vite-agnostic, for
 * the same reason as `collectThemeBlockCandidates`: the real loader and a
 * theme's own spec run the identical code, so a passing spec is evidence
 * about the loader and not merely about the spec.
 */
export function collectThemeVariantExtensions(
  variantModules: Record<string, ThemeBlockVariantModule>,
): ThemeBlockVariantExtension[] {
  return Object.entries(variantModules).map(([path, mod]) => {
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    return {
      blockType: fileName.endsWith('.variants.ts')
        ? fileName.slice(0, -'.variants.ts'.length)
        : fileName,
      variants: mod.default ?? [],
      hides: [...(mod.hides ?? [])],
    };
  });
}

/**
 * What can be checked without knowing the core registry: names, labels,
 * and a theme repeating itself.
 *
 * `apps/public-site` deliberately does not import `@kometio/block-registry`
 * (a real TypeScript resolution conflict, see
 * resolve-theme-block-style-defaults.ts), so the runtime loader can only
 * go this far. The checks that need the core descriptors — the type
 * actually exists, and the theme is not redeclaring a variant core
 * already has — live in `checkVariantsAgainstCore` below, called from
 * each theme's own spec, which may import the registry freely. Same split
 * as the block-type collision guard, and for the same reason.
 */
export function validateThemeVariantExtensions(
  extensions: readonly ThemeBlockVariantExtension[],
  locales: readonly string[],
): ThemeBlockVariantError[] {
  const errors: ThemeBlockVariantError[] = [];

  for (const extension of extensions) {
    if (!Array.isArray(extension.variants) || !Array.isArray(extension.hides)) {
      errors.push({
        blockType: extension.blockType,
        message:
          'must default-export an array of variants, and may export `hides`, an array of core variant names',
      });
      continue;
    }
    if (extension.variants.length === 0 && extension.hides.length === 0) {
      errors.push({
        blockType: extension.blockType,
        message: 'adds no look and hides none',
      });
      continue;
    }

    const hidden = new Set<string>();
    for (const value of extension.hides) {
      if (value === RESERVED_VARIANT) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${RESERVED_VARIANT}" is the block type's own look and cannot be hidden`,
        });
      } else if (!VARIANT_NAME.test(value)) {
        errors.push({
          blockType: extension.blockType,
          message: `hidden variant "${value}" is not a variant name`,
        });
      } else if (hidden.has(value)) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${value}" is hidden twice`,
        });
      }
      hidden.add(value);
    }

    const seen = new Set<string>();
    for (const variant of extension.variants) {
      if (!VARIANT_NAME.test(variant.value)) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${variant.value}" must be lower case letters, digits and dashes, starting with a letter — it becomes a CSS class`,
        });
        continue;
      }
      if (variant.value === RESERVED_VARIANT) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${RESERVED_VARIANT}" is reserved for the block type's own look`,
        });
        continue;
      }
      if (seen.has(variant.value)) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${variant.value}" is declared twice`,
        });
        continue;
      }
      seen.add(variant.value);
      if (hidden.has(variant.value)) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${variant.value}" is both added and hidden`,
        });
      }

      const missing = locales.filter((locale) => !variant.label?.[locale]);
      if (missing.length > 0) {
        errors.push({
          blockType: extension.blockType,
          message: `variant "${variant.value}" has no label for ${missing.join(', ')}`,
        });
      }
    }
  }

  return errors;
}

/**
 * The half that needs the core registry: a theme may only extend a type
 * that EXISTS, and may not redeclare a look core already ships.
 *
 * Extending an unknown type is almost always a typo — `Buttton.variants.ts`
 * would otherwise sit there declaring looks nobody can pick, with nothing
 * failing. Redeclaring a core variant would put the same value in the
 * picker twice, one of them unreachable.
 */
export function checkVariantsAgainstCore(
  extensions: readonly ThemeBlockVariantExtension[],
  coreVariantsByType: Readonly<Record<string, readonly string[]>>,
  coreBlockTypes: readonly string[],
): ThemeBlockVariantError[] {
  const known = new Set(coreBlockTypes);
  return extensions.flatMap((extension) => {
    if (!known.has(extension.blockType)) {
      return [
        {
          blockType: extension.blockType,
          message:
            'is not a core block type — a theme extends the variants of a type that exists, and adds a new type with its own .block.ts',
        },
      ];
    }
    const core = new Set(coreVariantsByType[extension.blockType] ?? []);
    return [
      ...extension.variants
        .filter((variant) => core.has(variant.value))
        .map((variant) => ({
          blockType: extension.blockType,
          message: `variant "${variant.value}" is already one of this block's own — add a different look, or restyle that one from the editor`,
        })),
      // A typo would hide nothing and say nothing.
      ...extension.hides
        .filter((value) => !core.has(value))
        .map((value) => ({
          blockType: extension.blockType,
          message: `hides "${value}", which is not one of this block's own looks`,
        })),
    ];
  });
}

/** `Button` → `kometio-button`, `FeatureGrid` → `kometio-feature-grid`: the class a block's looks hang from. Repeated from @kometio/shared-types for the same reason as `RESERVED_VARIANT`. */
function blockClassName(blockType: string): string {
  return `kometio-${blockType.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/**
 * A theme that replaces a core block (`<Type>.astro`) draws that block's
 * looks itself, so each of them needs a rule there —
 * `.kometio-button--outline` — or a place in the theme's `hides`.
 *
 * The replacement is the theme's to write, and leaving a look out is its
 * call; what this refuses is leaving it out without saying so. docs-
 * showcase's Button did exactly that: the editor offered Outline and Link
 * on the docs site and the page drew a bare button for both.
 *
 * `overrideSources` is each replacement's text, by block type; a type
 * core does not ship is the theme's own block and is skipped.
 */
export function checkOverridesDrawVariants(
  overrideSources: Readonly<Record<string, string>>,
  extensions: readonly ThemeBlockVariantExtension[],
  coreVariantsByType: Readonly<Record<string, readonly string[]>>,
): ThemeBlockVariantError[] {
  return Object.entries(overrideSources).flatMap(([blockType, source]) => {
    const hidden = new Set(
      extensions.find((extension) => extension.blockType === blockType)
        ?.hides ?? [],
    );
    const className = blockClassName(blockType);
    return (coreVariantsByType[blockType] ?? [])
      .filter(
        (variant) =>
          !hidden.has(variant) && !source.includes(`.${className}--${variant}`),
      )
      .map((variant) => ({
        blockType,
        message: `replaces the core block but draws no ".${className}--${variant}": add the rule, or list "${variant}" in ${blockType}.variants.ts's \`hides\``,
      }));
  });
}
