import {
  blockStyleDefaultsResponseSchema,
  iconManifestSchema,
  themeBaseTokensSchema,
  themeBlocksResponseSchema,
  themeBlockVariantsResponseSchema,
  themeCapabilitiesSchema,
  themeForegroundTokensSchema,
  themeStylePropertiesResponseSchema,
  type BlockStyleDefaultsResponse,
  type IconEntry,
  type ThemeBaseTokens,
  type ThemeBlocksResponse,
  type ThemeBlockVariantsResponse,
  type ThemeCapabilities,
  type ThemeForegroundTokens,
  type ThemeStylePropertiesResponse,
} from '@kometio/shared-types';
import { PUBLIC_SITE_URL } from './public-site-url';

/**
 * Calls apps/public-site directly (never apps/api) — the same reason as
 * renderBlockFragment (block-fragment-api-client.ts): it is the only app
 * that actually reads the themes' files (docs/adr/0021), so it does not go
 * through http-client.ts, whose base URL points at apps/api.
 *
 * Every function takes a `themeName` (docs/adr/0042): now that every theme
 * is bundled into the same image and the choice is per-site
 * (`Site.themeName`), "current" no longer identifies anything on its own —
 * `?theme=` tells public-site WHICH theme to answer for.
 *
 * Not exported — a private collaborator of this module (security review
 * 2026-08-24: fetchThemeIcons and fetchBlockStyleDefaults used to live in
 * two separate files, each with the same fetch → check res.ok → throw →
 * schema.parse copied out).
 */
class ThemeApiFetcher {
  async fetchAndParse<T>(
    path: string,
    themeName: string,
    schema: { parse: (data: unknown) => T },
    params: Record<string, string> = {},
  ): Promise<T> {
    const query = new URLSearchParams({ theme: themeName, ...params });
    const url = `${PUBLIC_SITE_URL}${path}?${query.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${path} API error: ${res.status}`);
    }
    return schema.parse(await res.json());
  }
}

const themeApiFetcher = new ThemeApiFetcher();

/**
 * `set` decides which of the two icon sets comes back (ADR-0053). They
 * are separate requests on purpose: the interface icons serialise to
 * 1.1MB and the brand marks to another 5.2MB, so fetching both up front
 * would make everyone pay for logos they may never open.
 */
export async function fetchThemeIcons(
  themeName: string,
  set: 'interface' | 'brand' = 'interface',
  /**
   * Only part of the set: what a search box holds (`search`, at most
   * `limit` of them), or exactly the icons named (`names`, for a preview).
   * Without it the whole set comes back — fine for the interface icons,
   * the reason the logos tab was slow for the brand ones.
   */
  query: { search?: string; limit?: number; names?: string[] } = {},
): Promise<IconEntry[]> {
  const params: Record<string, string> = { set };
  if (query.search) params['q'] = query.search;
  if (query.limit) params['limit'] = String(query.limit);
  if (query.names?.length) params['names'] = query.names.join(',');
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/icons',
    themeName,
    iconManifestSchema,
    params,
  );
}

export async function fetchBlockStyleDefaults(
  themeName: string,
): Promise<BlockStyleDefaultsResponse> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/block-style-defaults',
    themeName,
    blockStyleDefaultsResponseSchema,
  );
}

export async function fetchThemeForegroundTokens(
  themeName: string,
): Promise<ThemeForegroundTokens> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/foreground-tokens',
    themeName,
    themeForegroundTokensSchema,
  );
}

export async function fetchThemeBaseTokens(
  themeName: string,
): Promise<ThemeBaseTokens> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/base-tokens',
    themeName,
    themeBaseTokensSchema,
  );
}

export async function fetchThemePageBlocks(
  themeName: string,
): Promise<ThemeBlocksResponse> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/blocks',
    themeName,
    themeBlocksResponseSchema,
  );
}

export async function fetchThemeCapabilities(
  themeName: string,
): Promise<ThemeCapabilities> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/capabilities',
    themeName,
    themeCapabilitiesSchema,
  );
}

export async function fetchThemeBlockVariants(
  themeName: string,
): Promise<ThemeBlockVariantsResponse> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/block-variants',
    themeName,
    themeBlockVariantsResponseSchema,
  );
}

export async function fetchThemeStyleProperties(
  themeName: string,
): Promise<ThemeStylePropertiesResponse> {
  return themeApiFetcher.fetchAndParse(
    '/api/themes/current/block-style-properties',
    themeName,
    themeStylePropertiesResponseSchema,
  );
}
