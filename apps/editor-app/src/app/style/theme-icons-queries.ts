import { queryOptions } from '@tanstack/react-query';
import { fetchThemeIcons } from '../../lib/theme-api-client';

/**
 * ONE theme's icon set never changes at runtime (the theme's files are in
 * the image) — `staleTime: Infinity`, so a single fetch per theme per
 * session is enough (docs/adr/0023), with no refetch every time the picker
 * opens. Since docs/adr/0042 the key includes `themeName`: changing the
 * site's theme is a different key, and therefore an automatic refetch
 * rather than a stale cache. `enabled` until the theme is known: no data is
 * better than the wrong theme's.
 */
export function themeIconsQueryOptions(
  themeName: string,
  set: 'interface' | 'brand' = 'interface',
) {
  return queryOptions({
    // `set` is part of the key, so switching tabs fetches the other set
    // once and then reuses it — the brands are never requested at all
    // until somebody opens that tab.
    queryKey: ['theme-icons', themeName, set] as const,
    queryFn: () => fetchThemeIcons(themeName, set),
    enabled: themeName !== '',
    staleTime: Infinity,
  });
}

/** How many logos one search shows — enough to find one, far from the whole set. */
export const BRAND_SEARCH_LIMIT = 120;

/**
 * The logos matching a search, fetched per search rather than all at once:
 * the brand set is 5.2MB, and opening its tab to find one logo used to
 * download every logo there is (ADR-0053).
 */
export function brandIconSearchQueryOptions(themeName: string, search: string) {
  return queryOptions({
    queryKey: ['theme-icons', themeName, 'brand', 'search', search] as const,
    queryFn: () =>
      fetchThemeIcons(themeName, 'brand', {
        search,
        limit: BRAND_SEARCH_LIMIT,
      }),
    enabled: themeName !== '',
    staleTime: Infinity,
  });
}

/** One logo by name — the preview of a logo already chosen, without the set it belongs to. */
export function brandIconQueryOptions(themeName: string, name: string) {
  return queryOptions({
    queryKey: ['theme-icons', themeName, 'brand', 'name', name] as const,
    queryFn: async () =>
      (await fetchThemeIcons(themeName, 'brand', { names: [name] }))[0] ?? null,
    enabled: themeName !== '' && name !== '',
    staleTime: Infinity,
  });
}
