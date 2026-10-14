import type { APIRoute } from 'astro';
import { errorReporter } from '../lib/error-reporter';
import {
  listPublishedPagesForSitemap,
  resolveRedirect,
} from '../lib/public-api-client';
import {
  hasOnlyTrackingParams,
  redirectForMissing,
  responseForRedirect,
} from '../lib/redirects';

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
  // The front door asked a question — a migrated site is asked `/?p=123` — is
  // answered by the rules (docs/adr/0127) before it is sent to the default
  // language. A campaign's tags are not a question, and cost no call.
  if (url.search !== '' && !hasOnlyTrackingParams(url.search)) {
    const answer = await redirectForMissing(url, {
      ask: resolveRedirect,
      report: (error) => errorReporter.captureException(error),
    });
    if (answer) return responseForRedirect(answer);
  }
  const { defaultLocale } = await listPublishedPagesForSitemap(url.hostname);
  return new Response(null, {
    status: 302,
    headers: { Location: `/${defaultLocale}/` },
  });
};
