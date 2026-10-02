import type { APIRoute } from 'astro';
import { listThemeIcons } from '../../../../lib/resolve-theme-icons';
import { selectIcons } from '../../../../lib/select-icons';
import { themesApiCorsHeaders } from '../../../../lib/themes-api-cors';

// docs/adr/0042 — see base-tokens.ts's own comment on the ?theme= param.
export const prerender = false;

export const OPTIONS: APIRoute = () =>
  new Response(null, { status: 204, headers: themesApiCorsHeaders() });

// `?set=brand` asks for the logos, anything else for the interface icons
// (ADR-0053). They are separate requests because the brands serialise to
// 5.2MB against the interface set's 1.1MB, and an editor that never opens
// the brand tab should not pay for them.
//
// `q` + `limit` answer a search box and `names` a preview, so the logos
// are never sent whole; with none of the three the whole set comes back,
// as it always did.
const MAX_LIMIT = 500;

export const GET: APIRoute = ({ url }) => {
  const params = url.searchParams;
  const requestedLimit = Number(params.get('limit'));
  const names = params.get('names');
  const icons = selectIcons(
    listThemeIcons(
      params.get('theme') ?? '',
      params.get('set') === 'brand' ? 'brand' : 'interface',
    ),
    {
      search: params.get('q') ?? undefined,
      names: names ? names.split(',').filter(Boolean) : undefined,
      limit:
        Number.isInteger(requestedLimit) && requestedLimit > 0
          ? Math.min(requestedLimit, MAX_LIMIT)
          : undefined,
    },
  );
  return new Response(JSON.stringify(icons), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...themesApiCorsHeaders(),
    },
  });
};
