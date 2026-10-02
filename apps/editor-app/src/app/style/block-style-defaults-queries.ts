import { queryOptions } from '@tanstack/react-query';
import { fetchBlockStyleDefaults } from '../../lib/theme-api-client';

/**
 * Each block type's resolved default depends on the active theme's tokens
 * and never changes at runtime for a given theme — `staleTime: Infinity`,
 * with `themeName` in the key so a theme change refetches by itself
 * (docs/adr/0042). The same pattern as themeIconsQueryOptions.
 */
export function blockStyleDefaultsQueryOptions(themeName: string) {
  return queryOptions({
    queryKey: ['block-style-defaults', themeName] as const,
    queryFn: () => fetchBlockStyleDefaults(themeName),
    enabled: themeName !== '',
    staleTime: Infinity,
  });
}
