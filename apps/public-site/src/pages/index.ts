import type { APIRoute } from 'astro';
import { listPublishedPagesForSitemap } from '../lib/public-api-client';

// Every locale gets a URL prefix, including the default (docs/adr/0017) —
// the bare root has no page of its own, it only ever redirects to the
// site's default locale's own root ([locale]/index.astro). Reuses the
// sitemap-listing endpoint purely for its bundled `defaultLocale` field
// (ADR-0016's same reasoning: one lookup already resolves the site by
// domain, no reason to add a second endpoint just for this).
//
// An endpoint and not a page: a redirect has nothing to render, and in an
// `.astro` frontmatter the `return Astro.redirect(...)` reads to
// `astro check` as unreachable code, which hid every name it used from the
// unused-locals check.
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const { defaultLocale } = await listPublishedPagesForSitemap(url.hostname);
  return new Response(null, {
    status: 302,
    headers: { Location: `/${defaultLocale}/` },
  });
};
