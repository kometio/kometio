import type { BlockStyleDefaults } from '@kometio/shared-types';

/**
 * Isolated from the file that imports `~theme/theme.css?raw`
 * (resolve-theme-block-style-defaults.ts) for the same reason as
 * render-block-fragment-helpers.ts: the pure logic should be unit-tested,
 * the Vite-aliased import should not (it needs the Astro plugin this
 * project's vitest config does not register).
 */

/**
 * Extracts the custom properties declared inside a `theme.css`'s
 * `:root { ... }` — not a full CSS parser: every theme in this project
 * declares a SINGLE flat `:root` block (no nesting, no `@media`), see
 * themes/classic/theme.css and themes/docs-showcase/theme.css for the real
 * shape this regex covers.
 */
export function parseRootCustomProperties(css: string): Map<string, string> {
  const map = new Map<string, string>();
  // Comments out first: core's global.css explains its values in them,
  // and a `--name: value;` quoted in a comment is not a declaration.
  const declarations = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .match(/:root\s*{([^}]*)}/)?.[1];
  if (declarations === undefined) return map;
  for (const [, name, value] of declarations.matchAll(
    /--([\w-]+)\s*:\s*([^;]+);/g,
  )) {
    if (name === undefined || value === undefined) continue;
    map.set(`--${name}`, value.trim());
  }
  return map;
}

/** `var(--name)` or `var(--name, fallback)`, the fallback being anything up to the closing parenthesis. */
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+?))?\s*\)$/;

/** A variable that refers to a variable that refers to one: a theme does not go deeper than a handful. */
const MAX_REFERENCE_DEPTH = 8;

/**
 * An expression declared in a block contract's `style` is a CSS literal
 * (`'transparent'`, `'0.5rem'`), which passes through unchanged, or a
 * reference to a custom property of the theme, optionally with a fallback
 * the way a block's own CSS writes it — `var(--link, var(--primary))`.
 *
 * A reference is answered with what the page would show: the first variable
 * the theme declares, followed through whatever that one refers to (core's
 * `--link` is itself `var(--primary)`), or the fallback when it declares
 * none. What cannot be answered is returned as it was written, so the editor
 * shows the expression and not something made up.
 */
export function resolveDefaultStyleExpression(
  expression: string,
  themeVars: Map<string, string>,
): string {
  const resolved = resolveReference(expression, themeVars, 0);
  return VAR_REFERENCE.test(resolved) ? expression : resolved;
}

function resolveReference(
  expression: string,
  themeVars: Map<string, string>,
  depth: number,
): string {
  const match = VAR_REFERENCE.exec(expression.trim());
  if (match === null || depth >= MAX_REFERENCE_DEPTH) return expression;
  const [, name, fallback] = match;
  const declared = name === undefined ? undefined : themeVars.get(name);
  if (declared !== undefined) {
    return resolveReference(declared, themeVars, depth + 1);
  }
  if (fallback !== undefined) {
    return resolveReference(fallback, themeVars, depth + 1);
  }
  return expression;
}

export function resolveBlockStyleDefaults(
  declared: BlockStyleDefaults,
  themeVars: Map<string, string>,
): BlockStyleDefaults {
  const resolved: BlockStyleDefaults = {};
  for (const [key, expression] of Object.entries(declared)) {
    resolved[key as keyof BlockStyleDefaults] = resolveDefaultStyleExpression(
      expression,
      themeVars,
    );
  }
  return resolved;
}
