import type { APIRoute } from 'astro';
import { listThemeStyleProperties } from '../../../../lib/resolve-theme-style-properties';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// Docs/adr/0041/0042, same pattern as blocks.ts, capabilities.ts and
// block-variants.ts. Called by editor-app once per session so its style
// panel can draw a control for a property core never heard of; the render
// path needs none of it, since the emitter derives the custom property
// name from the stored key.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

export const GET: APIRoute = ({ url }) =>
  new Response(
    JSON.stringify(
      listThemeStyleProperties(url.searchParams.get('theme') ?? ''),
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...themesApiCorsHeaders(),
      },
    },
  );
