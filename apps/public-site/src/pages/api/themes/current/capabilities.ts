import type { APIRoute } from 'astro';
import type { ThemeCapabilities } from '@kometio/shared-types';
import { getThemeManifest } from '../../../../lib/theme-registry';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// docs/adr/0042 — "current" means whichever theme the caller asks for via
// ?theme=, as with the other endpoints here; missing/unknown falls back to
// a bundled default rather than erroring.
//
// It exists so the editor can stop offering what the theme refuses. Until
// it did, a theme declaring `allowStyleOverrides: false` was honoured only
// at render: the editor still showed every styling control, saved what you
// chose, and the published page ignored it — with nothing anywhere saying
// why. The switch in the Style page admitted as much, telling you to go
// read the theme's own documentation.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

export const GET: APIRoute = ({ url }) => {
  const manifest = getThemeManifest(url.searchParams.get('theme') ?? '');
  // Resolved here rather than in each caller: absent means allowed, and a
  // default remembered in five places is a default forgotten in one.
  const capabilities: ThemeCapabilities = {
    allowStyleOverrides: manifest.allowStyleOverrides ?? true,
  };
  return new Response(JSON.stringify(capabilities), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...themesApiCorsHeaders(),
    },
  });
};
