import type { APIRoute } from 'astro';
import { listBlockStyleDefaults } from '../../../../lib/resolve-theme-block-style-defaults';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// docs/adr/0042 — see base-tokens.ts's own comment on the ?theme= param.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

export const GET: APIRoute = ({ url }) =>
  new Response(
    JSON.stringify(listBlockStyleDefaults(url.searchParams.get('theme') ?? '')),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...themesApiCorsHeaders(),
      },
    },
  );
