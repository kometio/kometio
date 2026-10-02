import type { APIRoute } from 'astro';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import {
  listPublishedPagesForSitemap,
  type SitemapEntryDto,
} from '../lib/public-api-client';

// Explicit even though this route has no dynamic [param] segment (see
// [locale]/[slug].astro's own comment on why a bracketed route needs it) —
// this genuinely has to run per-request (a fresh page list every time, not
// a once-at-build snapshot), so the intent is spelled out rather than
// relying on output: 'server' alone to imply it for a static-looking path.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  // Listing pages here is independent of the site's indexing preference
  // (docs/adr/0016) — robots.txt, not this route, is what actually tells a
  // compliant crawler to stay away when indexing is discouraged.
  const { items } = await listPublishedPagesForSitemap(url.hostname);

  // Grouped by groupId (docs/adr/0017) so every entry can list its
  // locale-siblings as hreflang alternates — including itself, per Google's
  // own guidance that each URL's alternates block should be self-referential.
  const groups = new Map<string, SitemapEntryDto[]>();
  for (const entry of items) {
    const group = groups.get(entry.groupId) ?? [];
    group.push(entry);
    groups.set(entry.groupId, group);
  }

  const urlEntries = items
    .map((entry) => {
      const alternates = (groups.get(entry.groupId) ?? [])
        .map(
          (sibling) =>
            `    <xhtml:link rel="alternate" hreflang="${sibling.locale}" href="${url.origin}${localePathFromAncestors(sibling.locale, sibling.ancestorSlugs, sibling.slug)}" />`,
        )
        .join('\n');
      return `  <url>
    <loc>${url.origin}${localePathFromAncestors(entry.locale, entry.ancestorSlugs, entry.slug)}</loc>
    <lastmod>${new Date(entry.updatedAt).toISOString()}</lastmod>
${alternates}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
