import type { APIRoute } from 'astro';
import { resolveThemeBaseTokens } from '../../../../lib/resolve-theme-base-tokens';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// docs/adr/0042 — "current" now means "whichever theme the caller asks
// for via ?theme=", not a single build-time value: editor-app passes the
// site it's editing's own `themeName`. Missing/unknown falls back to a
// safe default (resolveBundledThemeName) rather than erroring — a plain
// request with no ?theme= still gets a working response.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

export const GET: APIRoute = ({ url }) =>
  new Response(
    JSON.stringify(resolveThemeBaseTokens(url.searchParams.get('theme') ?? '')),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...themesApiCorsHeaders(),
      },
    },
  );
