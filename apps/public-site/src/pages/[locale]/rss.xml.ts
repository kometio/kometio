import type { APIRoute } from 'astro';
import { listPublishedFeedEntries } from '../../lib/public-api-client';
import { buildRssFeed } from '../../lib/rss-feed';

// Per-request, like every other public route here: a feed that was a
// build-time snapshot would be a feed that never reported a new article.
export const prerender = false;

/**
 * The site's feed, or one term's when `?term=` names it.
 *
 * A query parameter rather than a path of its own: a term's address is
 * already a path this site serves (ADR-0066), and hanging `/rss.xml` off
 * the end of it would mean a second, ambiguous way to read that path.
 */
export const GET: APIRoute = async ({ params, url }) => {
  const locale = params.locale ?? '';
  const term = url.searchParams.get('term') ?? undefined;
  const { siteName, entries } = await listPublishedFeedEntries(
    url.hostname,
    locale,
    { term },
  );

  const xml = buildRssFeed({
    title: siteName || url.hostname,
    feedUrl: `${url.origin}${url.pathname}${url.search}`,
    siteUrl: `${url.origin}/${locale}`,
    language: locale,
    items: entries.map((entry) => ({
      title: entry.title,
      link: `${url.origin}${entry.path}`,
      description: entry.description,
      publishedAt: entry.publishedAt,
    })),
  });

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
