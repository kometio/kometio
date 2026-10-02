import { fetchThemeBaseTokens } from '../../lib/theme-api-client';
import { themeQueryOptions } from './theme-query-options';

/**
 * The same reason and pattern as `themeForegroundTokensQueryOptions` — a
 * given theme's tokens do not change at runtime, and `themeName` in the key
 * (docs/adr/0042) makes changing theme refetch rather than reuse the
 * previous theme's.
 */
export function themeBaseTokensQueryOptions(themeName: string) {
  return themeQueryOptions(
    'theme-base-tokens',
    themeName,
    fetchThemeBaseTokens,
  );
}
