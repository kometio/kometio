/**
 * What Kometio core puts on `Astro.locals` for a theme to use.
 *
 * This exists because the icon registry cannot be a package: it is an
 * eager `import.meta.glob` over `themes/<name>/icons/` plus `lucide-static`
 * resolved through `import.meta.resolve` — all of it apps/public-site's,
 * none of it something a theme could carry. Rather than have a theme
 * import from the app (which is exactly what stops a theme from living
 * outside this repo), core hands the resolver over per request.
 *
 * A theme picks this up with one line in its own `env.d.ts`:
 *
 * ```ts
 * /// <reference types="@kometio/theme-runtime/locals" />
 * ```
 *
 * and then calls it with no import at all:
 *
 * ```astro
 * const globe = Astro.locals.resolveIcon('globe', site.themeName);
 * ```
 */
export interface KometioThemeLocals {
  /**
   * The raw SVG for `name` in the given theme's icon set, or `null` when
   * that set has no such icon (or `name` is empty). A theme shipping its
   * own `icons/` directory uses only that set; one shipping none falls
   * back to the full Lucide set (docs/adr/0023). A `themeName` this
   * deployment never bundled resolves through to the fallback theme
   * rather than returning nothing.
   *
   * Pass the `themeName` your block already receives as a prop — core
   * gives it to every block it renders.
   */
  resolveIcon(
    name: string | null | undefined,
    themeName: string,
  ): string | null;
}
