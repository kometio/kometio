import { fetchThemeForegroundTokens } from '../../lib/theme-api-client';
import { themeQueryOptions } from './theme-query-options';

/**
 * The same reason and pattern as `blockStyleDefaultsQueryOptions` — a given
 * theme's tokens do not change at runtime, and `themeName` in the key
 * (docs/adr/0042) makes changing theme refetch.
 */
export function themeForegroundTokensQueryOptions(themeName: string) {
  return themeQueryOptions(
    'theme-foreground-tokens',
    themeName,
    fetchThemeForegroundTokens,
  );
}
