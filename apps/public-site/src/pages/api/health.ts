import type { APIRoute } from 'astro';

// Docker/Caddy healthcheck target (docs/adr/0042) — deliberately independent
// of site/domain resolution and page content. `/` itself isn't a safe
// healthcheck target: it 302s to a locale path, and a brand-new deployment
// with no pages published yet legitimately 404s from there — a perfectly
// healthy server would still report "unhealthy" for having no content,
// which isn't what this check is supposed to mean.
export const prerender = false;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
