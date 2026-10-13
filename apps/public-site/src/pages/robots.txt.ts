import type { APIRoute } from 'astro';
import { isDemoDeployment } from '../lib/demo-mode';
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
  // A demo is never offered to them, whatever the site's own setting says
  // (docs/adr/0118).
  const body =
    searchEngineIndexingEnabled && !isDemoDeployment()
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
