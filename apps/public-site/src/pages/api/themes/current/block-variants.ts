import type { APIRoute } from 'astro';
import { listThemeBlockVariants } from '../../../../lib/resolve-theme-block-variants';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// Docs/adr/0041/0042, same pattern as blocks.ts and capabilities.ts:
// resolved here because only apps/public-site really reaches themes/.
// Called by editor-app once per session, to put a theme's own looks in
// the block's variant picker — the render path needs none of this, since
// the variant class is built from `Block.variant` alone.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

export const GET: APIRoute = ({ url }) =>
  new Response(
    JSON.stringify(listThemeBlockVariants(url.searchParams.get('theme') ?? '')),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...themesApiCorsHeaders(),
      },
    },
  );
