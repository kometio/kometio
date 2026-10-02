import { queryOptions } from '@tanstack/react-query';

/**
 * A query for something the active theme provides. One theme's files never
 * change while it runs (docs/adr/0023), so it is fetched once per theme
 * and kept (`staleTime: Infinity`); the theme's name is in the key, so
 * switching theme is a new fetch (docs/adr/0042); and nothing is asked
 * until the theme is known, since no data is better than the wrong
 * theme's.
 */
export function themeQueryOptions<T>(
  kind: string,
  themeName: string,
  load: (themeName: string) => Promise<T>,
) {
  return queryOptions({
    queryKey: [kind, themeName] as const,
    queryFn: () => load(themeName),
    enabled: themeName !== '',
    staleTime: Infinity,
  });
}
