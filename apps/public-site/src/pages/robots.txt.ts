import type { APIRoute } from 'astro';
import { listPublishedPagesForSitemap } from '../lib/public-api-client';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  // A domain that matches no site is a deployment misconfiguration — falls
  // back to "allow" rather than blocking everything for a request that
  // shouldn't be reachable under this domain in the first place.
  const { searchEngineIndexingEnabled } = await listPublishedPagesForSitemap(
    url.hostname,
  );

  // "Discourage search engines from indexing this site" (docs/adr/0016):
  // blocks crawling entirely here, and PageLayout.astro adds a per-page
  // <meta name="robots" content="noindex, nofollow"> on top — belt and
  // braces, since respecting either signal is up to the crawler, not
  // enforced by this server.
  const body = searchEngineIndexingEnabled
    ? `User-agent: *
Allow: /

Sitemap: ${url.origin}/sitemap.xml
`
    : `User-agent: *
Disallow: /
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
