import type { Translator } from './i18n';

/**
 * One published page as a region receives it. It lives here rather than in
 * apps/public-site's API client because it is part of the contract a theme
 * codes against: `ThemeRegionProps.pageTree()` resolves to a list of these,
 * and a theme built outside this repo has no way to import from the app.
 */
export interface PageTreeNodeDto {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  ancestorSlugs: string[];
  // Sibling-scoped manual position (drag-to-reorder in the pages list) —
  // the sort key a theme's sidebar should use; createdAt below is only a
  // legacy tiebreak for pages that predate manual ordering (see
  // list-published-page-tree.use-case.ts).
  order: number;
  createdAt: string;
}

/**
 * The successor to docs/adr/0042's full-shell override — the three regions
 * a theme may supply in place of core's own wrappers, without
 * reimplementing the page shell.
 *
 * These types live here rather than in `resolve-theme-regions.ts` on
 * purpose: that file runs an `import.meta.glob` over the themes' own files,
 * so a theme importing its props from there would create a cycle that does
 * not exist today.
 *
 * What always stays core's, and a theme therefore cannot break: all of
 * `<html>`/`<head>`/`<body>`, the skip-to-content link, the
 * `data-kometio-root-blocks` attributes the visual editor hooks onto, block
 * rendering, CSP, consent, schema.org and the preview bridge. A region
 * receives the already-rendered blocks as a slot and decides only the
 * element that wraps them.
 */
export type ThemeRegionRoute = 'page' | 'search' | 'error';

export interface ThemeRegionProps {
  locale: string;
  /** `Astro.url.pathname` with trailing slashes stripped, `'/'` for the root. */
  currentPath: string;
  /** Core's own UI dictionary, already bound to `locale`. */
  i18n: Translator;
  /**
   * The site's published page tree. Fetched at most once per request, and
   * only if the region actually calls it: the fetch, the memoization, the
   * domain guard and the error policy (resolves to `[]`, never throws) are
   * core's, not the theme's — exactly the kind of thing a copy gets wrong.
   */
  pageTree: () => Promise<PageTreeNodeDto[]>;
  /** Which core route is rendering. */
  route: ThemeRegionRoute;
  /** True only inside the editor's preview iframe. */
  editable: boolean;
  /**
   * Injected by Astro because core's layout has `<style>` blocks of its
   * own: forward it onto the region's root element to let core's scoped
   * styles reach it, or ignore it.
   */
  class?: string;
}

export interface ThemeHeaderProps extends ThemeRegionProps {
  /** Configured per (site, locale) in the editor — the theme decides how to honour it. */
  sticky: boolean;
}

export type ThemeFooterProps = ThemeRegionProps;
export type ThemeContentShellProps = ThemeRegionProps;
