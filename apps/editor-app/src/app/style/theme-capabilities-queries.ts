import { fetchThemeCapabilities } from '../../lib/theme-api-client';
import { themeQueryOptions } from './theme-query-options';

/**
 * What the active theme lets this site do to it (docs/adr/0021's ceiling).
 * Fixed for a given theme and never changes at runtime — `staleTime:
 * Infinity`, with `themeName` in the key so switching theme refetches by
 * itself (docs/adr/0042). The same pattern as
 * `blockStyleDefaultsQueryOptions`.
 */
export function themeCapabilitiesQueryOptions(themeName: string) {
  return themeQueryOptions(
    'theme-capabilities',
    themeName,
    fetchThemeCapabilities,
  );
}

/**
 * Whether the theme allows a site to style anything on top of it.
 *
 * `true` while the answer has not arrived, and that is the deliberate
 * choice: the alternative flickers every styling control in the editor
 * off and back on for every user of every theme, to spare the one case
 * where a theme forbids it. A control shown for a moment too long costs a
 * click; a control hidden for a moment costs trust in the editor.
 */
export function themeAllowsStyleOverrides(
  capabilities: { allowStyleOverrides: boolean } | undefined,
): boolean {
  return capabilities?.allowStyleOverrides ?? true;
}
