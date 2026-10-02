import { z } from 'zod';
import { blockSchema, seoMetaSchema } from '@kometio/shared-types';
import { publishedSiteSchema } from './published-site';

/** One entry per published locale-translation of this page (docs/adr/0017), including itself. */
export const publishedPageTranslationSchema = z.object({
  locale: z.string(),
  slug: z.string(),
  /**
   * The page's ancestors IN THIS LANGUAGE, root first — what turns a slug
   * into the address the page actually answers on.
   *
   * Slugs are scoped to their siblings (ADR-0029), so `/it/first-run` is
   * not where `first-run` lives; `/it/docs/getting-started/first-run` is.
   * Every consumer that had only `slug` built the first shape and linked
   * to a 404 — the language switcher on every nested page, and the
   * `hreflang` alternates, which were telling search engines those URLs
   * existed.
   *
   * Per-locale rather than shared, because a site may call a section
   * `docs` in one language and `documentazione` in another. A language in
   * which the chain is incomplete is not listed at all: the page is
   * unreachable there, so there is nothing to link to.
   */
  ancestorSlugs: z.array(z.string()).default([]),
});

export type PublishedPageTranslation = z.infer<
  typeof publishedPageTranslationSchema
>;

/** Root-to-parent order (does not include the page itself). Empty for a root-level page. */
export const publishedPageAncestorSchema = z.object({
  slug: z.string(),
  title: z.string(),
});

export type PublishedPageAncestor = z.infer<typeof publishedPageAncestorSchema>;

/**
 * The public, unauthenticated read shape (see apps/api's PublicPagesModule)
 * — only ever `publishedContent`, never a draft. Shared by
 * libs/application's getPublishedPageBySlug/getPreviewPageById (which build
 * it server-side) and apps/public-site's public-api-client.ts (which parses
 * it off the wire) — same reasoning as publishedSiteSchema.
 */
export const publishedPageSchema = z.object({
  /**
   * This page in this language — the identity `form_submissions.page_id`
   * points at, and the only reason it is on the public shape at all: a
   * form block is rendered deep inside `content` and has no way to reach
   * back up to the page it sits on, so the id has to travel down with the
   * page itself (apps/public-site's `Astro.locals.pageTranslationId`).
   *
   * Nullable because a term's own page is a `PublishedPage` without a
   * page behind it (ADR-0064) whenever the term has no landing page —
   * there is nothing to name there, and a form on the default layout
   * simply records no origin.
   */
  id: z.string().nullable(),
  content: z.array(blockSchema),
  seoMeta: seoMetaSchema,
  locale: z.string(),
  translations: z.array(publishedPageTranslationSchema),
  ancestors: z.array(publishedPageAncestorSchema),
  site: publishedSiteSchema,
  header: z.array(blockSchema).nullable(),
  footer: z.array(blockSchema).nullable(),
  headerSticky: z.boolean(),
  /**
   * The published blocks of every reusable section this page uses, by id —
   * PREVIEW ONLY, and absent everywhere else.
   *
   * A published page has nothing to do with them: its sections are already
   * expanded into `content`. The canvas does: it re-renders one block at a
   * time, and a `Section` block on its own carries a reference and no
   * blocks (docs/adr/0059), so without this the editor could only show a
   * pasted or restored section by reloading the whole iframe.
   */
  sections: z.record(z.string(), z.array(blockSchema)).optional(),
});

export type PublishedPage = z.infer<typeof publishedPageSchema>;

/**
 * A term's own page (ADR-0064) — the shape apps/public-site renders for
 * `/{locale}/{prefix}/{slug}`.
 *
 * Deliberately a `PublishedPage` plus one field. A term's page is a page:
 * it has the site's header and footer, its own SEO block, its
 * translations, and a list of blocks to render — so making it the same
 * shape means `PublicPageContent.astro` draws it with no new rendering
 * path, and every block, style rule and instance class works there
 * without knowing it is on a term.
 *
 * `content` is the hand-built landing page's blocks when the term has
 * one, and the generated default layout otherwise — the caller cannot
 * tell which, which is exactly the promise ADR-0064 makes about
 * rendering in place: unlinking that page changes what is drawn, never
 * whether the address answers.
 */
export const publishedTermSchema = publishedPageSchema.extend({
  term: z.object({
    id: z.string(),
    /** Empty when the term has no name in this language — it can still be reached, so it still renders. */
    name: z.string(),
    description: z.string(),
    /** True when the blocks above came from a page somebody built by hand. */
    hasLandingPage: z.boolean(),
    /** Kept out of search engines by whoever publishes — the page says so in its own head, and the sitemap leaves it out. */
    noindex: z.boolean(),
  }),
});

export type PublishedTerm = z.infer<typeof publishedTermSchema>;
