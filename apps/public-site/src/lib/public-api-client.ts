import { z } from 'zod';
import type { PageTreeNodeDto } from '@kometio/theme-runtime';
import { requireEnv } from '@kometio/env-config';
import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from '@kometio/api-contracts';
import { currentVisitorIp } from './request-context';
import { pageContentSchema } from '@kometio/shared-types';
import {
  publicFormSchema,
  publishedAuthorSchema,
  publishedPageSchema,
  publishedSiteSchema,
  publishedTermSchema,
  type PublicForm,
  type PublishedAuthor,
  type PublishedPage,
  type PublishedTerm,
} from '@kometio/api-contracts';

/** Where to send the visitor when (locale, path) has no published page — see resolveUntranslatedPageFallback on the application side. */
export interface UntranslatedPageFallbackTargetDto {
  locale: string;
  /** The same segmented path as the input, under `locale` — see resolvePageByPath. */
  segments: string[];
}

export type PublishedPageLookupResult =
  | { found: true; page: PublishedPage }
  | {
      found: false;
      fallback: UntranslatedPageFallbackTargetDto | null;
      /**
       * The address this content lives at now — a term claimed it as its
       * landing page (docs/adr/0067). Distinct from `fallback`, which is
       * a courtesy for a language that has no such page at all: this one
       * is a permanent move, and the route answers it with a 301 rather
       * than a 302.
       */
      movedTo: string | null;
    };

// process.env, not import.meta.env: this must read the real deployment's
// value at request time (Node adapter, SSR), not whatever was baked in at
// build time — one built image serves whichever domains its env points at.
function apiUrl(): string {
  return requireEnv('API_URL');
}

// Security review 2026-08-24, point 18: without this, a hung apps/api
// (pool exhausted, a slow query) blocked the Node worker rendering this
// request indefinitely — in SSR (astro.config.mjs's output:'server') that
// worker serves other visitors too, not just this one request.
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Who is asking, on behalf of whom.
 *
 * The public API rate-limits per IP, and every call below is made by this
 * server: without these two headers the entire site shares one bucket and
 * a busy minute becomes a 500 for every visitor at once. The visitor's
 * address alone would not be enough — the API is reachable from the
 * internet through Caddy, so a header anyone can set is a limit anyone can
 * evade. The token is what makes the address believable.
 *
 * Both optional by design: with `PUBLIC_API_SERVICE_TOKEN` unset the API
 * trusts nothing and counts this server, exactly as it did before. An
 * upgrade that does not set it keeps working, and there is no default
 * secret anywhere for one that forgets.
 */
function callerHeaders(): Record<string, string> {
  const token = process.env['PUBLIC_API_SERVICE_TOKEN'];
  const visitorIp = currentVisitorIp();
  if (!token || !visitorIp) return {};
  return {
    [PUBLIC_API_SERVICE_TOKEN_HEADER]: token,
    [PUBLIC_API_VISITOR_IP_HEADER]: visitorIp,
  };
}

/**
 * Not exported — an injected collaborator private to this module, not a
 * general-purpose "fetch helper". Every one of the 10 functions below owns
 * its own response interpretation (404-collapses-to-null, `{ ok, status }`
 * discriminated results, differing error message prefixes); this class
 * owns only the one thing they genuinely share: applying the timeout and
 * turning `AbortSignal.timeout()`'s `DOMException` into a readable error.
 */
class TimedFetcher {
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: { ...init?.headers, ...callerHeaders() },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error(`Public API request timed out: ${url}`);
      }
      throw error;
    }
  }
}

const timedFetcher = new TimedFetcher();

/**
 * Talks to the public, unauthenticated endpoint only (see
 * apps/api/src/app/public-pages) — never the authenticated CRUD one
 * editor-app uses. A 404 here means "nothing to show at this exact
 * (locale, slug)" (no page, or a page that's still a draft — the API
 * deliberately doesn't distinguish the two, see that module's own
 * comments), not an error — `found: false` still carries an optional
 * `fallback` (a sibling page in the site's default locale, only when the
 * site is configured for it) that the caller decides whether to redirect
 * to. See resolveUntranslatedPageFallback in @kometio/application.
 */
export async function getPublishedPageBySlug(
  domain: string,
  locale: string,
  segments: string[],
): Promise<PublishedPageLookupResult> {
  const params = new URLSearchParams({
    domain,
    locale,
    path: segments.join('/'),
  });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/by-slug?${params.toString()}`,
  );

  if (res.status === 404) {
    const body: unknown = await res.json().catch(() => null);
    const parsed =
      body && typeof body === 'object'
        ? (body as {
            fallback?: UntranslatedPageFallbackTargetDto | null;
            movedTo?: string | null;
          })
        : {};
    return {
      found: false,
      fallback: parsed.fallback ?? null,
      movedTo: parsed.movedTo ?? null,
    };
  }
  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return { found: true, page: publishedPageSchema.parse(await res.json()) };
}

/**
 * A term's own page (docs/adr/0064), asked for ONLY after the page
 * lookup came back empty — a page always wins, and doing the two in that
 * order is what makes that true at render time rather than only at write
 * time.
 *
 * `null` for anything that is not a term: no term at that address, a
 * path too deep to be one, an unknown domain. The route then 404s
 * exactly as it did before terms existed.
 */
export async function getPublishedTermByPath(
  domain: string,
  locale: string,
  segments: string[],
): Promise<PublishedTerm | null> {
  const params = new URLSearchParams({
    domain,
    locale,
    path: segments.join('/'),
  });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/term-by-path?${params.toString()}`,
  );

  if (res.status === 404 || res.status === 400) {
    // 400 is a path this endpoint refuses to even look up — three
    // segments, say. For the caller that is the same answer as "no term
    // here", and it is the page route's 404 that the visitor sees.
    return null;
  }
  if (!res.ok) {
    throw new Error(`Public terms API error: ${res.status}`);
  }
  return publishedTermSchema.parse(await res.json());
}

export type PublishedAuthorLookupResult =
  | { found: true; author: PublishedAuthor }
  | { found: false; movedTo: string | null };

/**
 * An author's own page (docs/adr/0071), asked for only after the page and
 * the term lookups came back empty: what an editor put at an address
 * always wins over what the system made there.
 *
 * `movedTo` is the person's current address when they left this one — the
 * route turns it into a 301, as it does for a moved page.
 */
export async function getPublishedAuthorBySlug(
  domain: string,
  locale: string,
  slug: string,
): Promise<PublishedAuthorLookupResult> {
  const params = new URLSearchParams({ domain, locale, slug });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/author-by-slug?${params.toString()}`,
  );

  if (res.status === 404 || res.status === 400) {
    const body: unknown = await res.json().catch(() => null);
    const movedTo =
      body && typeof body === 'object' && 'movedTo' in body
        ? body.movedTo
        : null;
    return {
      found: false,
      movedTo: typeof movedTo === 'string' ? movedTo : null,
    };
  }
  if (!res.ok) {
    throw new Error(`Public authors API error: ${res.status}`);
  }
  return {
    found: true,
    author: publishedAuthorSchema.parse(await res.json()),
  };
}

/**
 * The draft-editing, unauthenticated read path (see the visual editor plan,
 * Day 1) — used only by the preview route
 * (src/pages/preview/[pageId].astro), never by the real public route. The
 * same 404 -> null collapse as getPublishedPageBySlug: a missing, expired
 * or mismatched token is indistinguishable from a page that does not exist.
 */
export async function getPreviewPageById(
  pageId: string,
  token: string,
): Promise<PublishedPage | null> {
  const params = new URLSearchParams({ token });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/${pageId}/preview?${params.toString()}`,
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return publishedPageSchema.parse(await res.json());
}

/**
 * The reusable section behind a preview token, shaped as a page so the
 * section editor's canvas can render it with the same components
 * (docs/adr/0059). Same 404 -> null collapse as everything else here.
 */
export async function getPreviewSectionById(
  sectionId: string,
  token: string,
  locale: string,
): Promise<PublishedPage | null> {
  const params = new URLSearchParams({ token, locale });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/sections/${sectionId}/preview?${params.toString()}`,
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return publishedPageSchema.parse(await res.json());
}

const publishedSiteChromeSchema = z.object({
  site: publishedSiteSchema,
  header: pageContentSchema.nullable(),
  footer: pageContentSchema.nullable(),
  headerSticky: z.boolean(),
});

export type PublishedSiteChromeDto = z.infer<typeof publishedSiteChromeSchema>;

/**
 * Site-level header/footer with no specific page in the picture — for
 * routes with no backing Page row (e.g. search.astro), so they can still
 * render the site's normal chrome instead of a bare page. Same 404 ->
 * null collapse as getPublishedPageBySlug.
 */
export async function getPublishedSiteChrome(
  domain: string,
  locale: string,
): Promise<PublishedSiteChromeDto | null> {
  const params = new URLSearchParams({ domain, locale });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/chrome?${params.toString()}`,
  );

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return publishedSiteChromeSchema.parse(await res.json());
}

const pageTreeSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      slug: z.string(),
      title: z.string(),
      ancestorSlugs: z.array(z.string()),
      order: z.number(),
      createdAt: z.string(),
    }) satisfies z.ZodType<PageTreeNodeDto>,
  ),
});

// Built for a theme's own sidebar/tree navigation (docs-showcase,
// docs/adr/0021's per-block override escalation) — flat list, not nested;
// the caller (a theme's PageLayout.astro override) groups it into whatever
// shape its own sidebar needs.
export async function listPublishedPageTree(
  domain: string,
  locale: string,
): Promise<PageTreeNodeDto[]> {
  const params = new URLSearchParams({ domain, locale });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/tree?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return pageTreeSchema.parse(await res.json()).items;
}

const sitemapEntrySchema = z.object({
  slug: z.string(),
  locale: z.string(),
  // Links locale-siblings together (docs/adr/0017) so sitemap.xml can group
  // entries into hreflang alternates instead of one flat <loc> per page.
  groupId: z.string(),
  // Root-to-parent slugs (page hierarchy) — the canonical nested URL is
  // built from these, not the flat slug alone (see locale-path.ts).
  ancestorSlugs: z.array(z.string()),
  updatedAt: z.string(),
});

const sitemapListingSchema = z.object({
  items: z.array(sitemapEntrySchema),
  // Bundled with the page list rather than a separate lookup — both
  // sitemap.xml and robots.txt (docs/adr/0016) need "what does this
  // domain's site say about crawling", and both already need this same
  // site resolved by domain. An unmatched domain still resolves (never
  // 404s, see the API's own comment) with an empty, indexing-allowed
  // response, not an error.
  searchEngineIndexingEnabled: z.boolean(),
  // The bare "/" route (docs/adr/0017) needs this to redirect to the
  // site's locale-prefixed home before it knows any slug at all.
  defaultLocale: z.string(),
});

export type SitemapEntryDto = z.infer<typeof sitemapEntrySchema>;
export type SitemapListingDto = z.infer<typeof sitemapListingSchema>;

export async function listPublishedPagesForSitemap(
  domain: string,
): Promise<SitemapListingDto> {
  const params = new URLSearchParams({ domain });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return sitemapListingSchema.parse(await res.json());
}

const feedListingSchema = z.object({
  siteName: z.string(),
  entries: z.array(
    z.object({
      title: z.string(),
      path: z.string(),
      description: z.string(),
      /** ISO, or `null` for a page published before the column existed. */
      publishedAt: z.string().nullable(),
    }),
  ),
});

export type FeedListingDto = z.infer<typeof feedListingSchema>;
export type FeedEntryDto = FeedListingDto['entries'][number];

/** The site's most recent pages, or one term's, for the RSS route. */
export async function listPublishedFeedEntries(
  domain: string,
  locale: string,
  options: { term?: string; limit?: number } = {},
): Promise<FeedListingDto> {
  const params = new URLSearchParams({ domain, locale });
  if (options.term) params.set('term', options.term);
  if (options.limit) params.set('limit', String(options.limit));
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/feed?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return feedListingSchema.parse(await res.json());
}

const searchResultsSchema = z.object({
  items: z.array(
    z.object({
      pageId: z.string(),
      slug: z.string(),
      title: z.string(),
      excerpt: z.string(),
    }),
  ),
});

export type SearchResultDto = z.infer<
  typeof searchResultsSchema
>['items'][number];

export async function searchPublishedPages(
  domain: string,
  locale: string,
  query: string,
): Promise<SearchResultDto[]> {
  const params = new URLSearchParams({ domain, locale, q: query });
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/pages/search?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(`Public pages API error: ${res.status}`);
  }
  return searchResultsSchema.parse(await res.json()).items;
}

/**
 * Called on every render of a Form block (docs/adr/0015 — live-fetched,
 * never snapshotted), so a form's field definitions edited in the admin
 * panel show up on already-published pages without republishing them.
 * A 404 means the form was deleted after the page picked it — same
 * "nothing to show" handling as a missing page, not an error.
 */
export async function getPublicForm(
  formId: string,
): Promise<PublicForm | null> {
  const res = await timedFetcher.fetch(`${apiUrl()}/public/forms/${formId}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Public forms API error: ${res.status}`);
  }
  return publicFormSchema.parse(await res.json());
}

const uploadedFormAttachmentSchema = z.object({
  url: z.string(),
  filename: z.string(),
});

export type UploadedFormAttachment = z.infer<
  typeof uploadedFormAttachmentSchema
>;

/**
 * Called server-side from the submit proxy (docs/adr/0015's pattern),
 * before the main JSON submission — a `file`-typed field's value has to
 * become `{ url, filename }` (form-fields.ts's own formFieldFileValueSchema)
 * ahead of that JSON POST, since a File object itself isn't JSON-
 * serializable. No CAPTCHA token needed here: the real API endpoint this
 * calls doesn't re-verify one (a Turnstile token is single-use, and the
 * main submission below already verifies it once for the whole
 * transaction — see public-forms.controller.ts's own comment on this).
 */
export async function uploadFormAttachment(
  formId: string,
  file: File,
): Promise<UploadedFormAttachment> {
  const body = new FormData();
  body.append('file', file, file.name);
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/forms/${formId}/attachments`,
    { method: 'POST', body },
  );
  if (!res.ok) {
    throw new Error(`Public forms API error: ${res.status}`);
  }
  return uploadedFormAttachmentSchema.parse(await res.json());
}

export interface SubmitPublicFormInput {
  pageId: string | null;
  values: Record<string, unknown>;
  honeypot: string;
  captchaToken: string;
}

export type SubmitPublicFormResult =
  { ok: true } | { ok: false; status: number };

/** Called server-side from the same-origin proxy endpoint (docs/adr/0015), never directly from the browser. */
export async function submitPublicForm(
  formId: string,
  input: SubmitPublicFormInput,
): Promise<SubmitPublicFormResult> {
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/forms/${formId}/submissions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  return { ok: false, status: res.status };
}

export interface SubscribeNewsletterInput {
  email: string;
  honeypot: string;
  captchaToken: string;
}

export type SubscribeNewsletterResult =
  { ok: true } | { ok: false; status: number };

/** Called server-side from NewsletterSignup's same-origin proxy endpoint — same reasoning as submitPublicForm. */
export async function subscribeNewsletter(
  input: SubscribeNewsletterInput,
): Promise<SubscribeNewsletterResult> {
  const res = await timedFetcher.fetch(
    `${apiUrl()}/public/newsletter/subscribe`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (res.ok) {
    return { ok: true };
  }
  return { ok: false, status: res.status };
}

/**
 * Whether this deployment has been through its first-run wizard. Only the
 * 500 page asks: it is where every failing route ends up, and "nobody has
 * set this up yet" is the one failure there with a remedy worth naming
 * instead of a generic apology.
 *
 * Resolves to `true` when the API cannot be reached at all — a backend
 * that is down is a different problem, and claiming the site is
 * unconfigured would send the reader off to fix the wrong thing.
 */
export async function hasDeploymentBeenSetUp(): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl()}/setup/status`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) return true;
    return z.object({ hasBeenSetUp: z.boolean() }).parse(await res.json())
      .hasBeenSetUp;
  } catch {
    return true;
  }
}
