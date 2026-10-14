import { z } from 'zod';
import { defineBlockContract } from './block-contract';

/**
 * A plain `<form method="get">` submitting to `/{locale}/search` (see
 * apps/public-site's search.astro) — no client-side fetch/dropdown, same
 * "prefer native mechanisms" reasoning already applied elsewhere
 * (NavDropdown's `<details>`, PromoBar's honeypot). `placeholder` is the
 * only editor-configurable text; the actual results page is not itself a
 * Block-composed page, it's a dedicated Astro route.
 */
/**
 * One entry a PageGrid draws — resolved server-side, never authored.
 *
 * Same treatment as `PickedPage.locale/slug`: the block stores WHICH
 * pages it wants (a term), and the render pass fills in what they are.
 * A client cannot supply these, which is the point — they are the
 * answer to a query, not content.
 */
export const pageGridItemSchema = z.object({
  pageGroupId: z.string(),
  title: z.string(),
  /** Ready to use as an `href`, ancestors included (ADR-0029). */
  path: z.string(),
  /** When this language went live, ISO — `null` for a page whose publication date predates the column. */
  publishedAt: z.string().nullable(),
  /** The page's meta description, which is the summary its author already writes. A card that invents its own from the body would be a second, quietly different summary. */
  excerpt: z.string(),
  /** The page's OG image — the picture it already shows when shared, which is the same one a card wants. */
  image: z.string().nullable(),
  /**
   * The terms this page carries, as the slugs they answer at in the
   * language being rendered — what a `TermList` filter matches against.
   *
   * Filled only for the dimensions a filter on the same page actually
   * offers: every other term would be a slug nobody can select, paid for
   * on every archive that has no filter at all.
   */
  termSlugs: z.array(z.string()).default([]),
});
export type PageGridItem = z.infer<typeof pageGridItemSchema>;

/**
 * The pages filed under a term (ADR-0064) — the block a term's default
 * layout is built from, and the same block an author can place by hand
 * on any page.
 *
 * `termId` is `null` on a freshly inserted one: the block exists before
 * anybody has said which dimension it lists, and rendering nothing is
 * the honest answer until they do.
 */
export const pageGridPropsSchema = z.object({
  termId: z.string().nullable().default(null),
  /**
   * The articles one person wrote, instead of a term's pages — what an
   * author's page lists. Not a field in the editor: it is set by the
   * layout an author's page is built with, the way `items` is filled.
   */
  authorId: z.string().nullable().default(null),
  /** `cards` is the one that shows the date, the summary and the picture — a list of links has nowhere to put them. */
  layout: z.enum(['list', 'grid', 'cards']).default('list'),
  /**
   * Alphabetical, or newest first.
   *
   * It defaults to `title` because that is what every existing list
   * already does, and a default that silently reorders somebody's
   * published pages is not a default, it is an edit. An archive of news
   * says `newest`.
   */
  order: z.enum(['title', 'newest']).default('title'),
  /** 0 = no limit. A term with two hundred pages is a real thing; a page listing all of them is not. */
  limit: z.number().int().min(0).max(100).default(0),
  /**
   * How many entries a reader sees at once, `0` for all of them on one
   * page.
   *
   * Separate from `limit`, which is a cap on the whole list: an archive
   * of two hundred articles wants every one of them reachable, ten at a
   * time, not the first ten and nothing else. Applied after the cap, so
   * the two compose rather than argue.
   */
  perPage: z.number().int().min(0).max(100).default(0),
  emptyText: z.string().default(''),
  items: z.array(pageGridItemSchema).default([]),
});
export type PageGridProps = z.infer<typeof pageGridPropsSchema>;
export const pageGridBlockContract = defineBlockContract({
  type: 'PageGrid',
  props: pageGridPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.75rem',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  search: {
    none: "what it draws is other pages' titles, which are indexed on those pages themselves: indexing them again would make one page answer for words that are not on it (ADR-0064)",
  },
});

/**
 * The line an article carries: when it went out, and who wrote it.
 *
 * Both values are FILLED BY THE RENDER PASS from the page the block sits
 * on, never authored — the same rule `PageGrid.items` follows. A date
 * somebody could type here would be a second, quietly different answer to
 * "when was this published", and the two would disagree the first time a
 * page was republished.
 *
 * The author is the display name of whoever created the page, and only
 * that: an account's email address is not something a page publishes.
 */
export const articleMetaPropsSchema = z.object({
  showDate: z.boolean().default(true),
  showAuthor: z.boolean().default(true),
  /** Filled: ISO, `null` when the page has never been published or predates the column. */
  publishedAt: z.string().nullable().default(null),
  /** Filled: empty when the account has no display name, and then nothing is drawn rather than a blank byline. */
  authorName: z.string().default(''),
  /** Filled: the author's page, `null` when they have none to link to. */
  authorPath: z.string().nullable().default(null),
});
export type ArticleMetaProps = z.infer<typeof articleMetaPropsSchema>;
export const articleMetaBlockContract = defineBlockContract({
  type: 'ArticleMeta',
  props: articleMetaPropsSchema,
  style: {
    backgroundColor: 'transparent',
    // What the block renders (it is the muted line under a title), not
    // `inherit`: the field in the Style dialog showed the second while the page
    // showed the first.
    textColor: 'var(--muted-foreground)',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: "every word it shows is filled in from elsewhere on the site (the page's own date, its neighbours): indexing it would file other pages' titles under this one",
  },
});

/**
 * The two neighbours of this article inside its own section, by date.
 *
 * "Previous" is the older one and "next" the newer, which is how a reader
 * moving through an archive expects to travel. A page that is not in a
 * section has no set to be a neighbour in, and the block draws nothing
 * rather than inventing one out of the page tree.
 */
export const articleNavPropsSchema = z.object({
  /** Filled: the older neighbour, `null` at the end of the archive. */
  previous: pageGridItemSchema.nullable().default(null),
  /** Filled: the newer neighbour, `null` on the most recent article. */
  next: pageGridItemSchema.nullable().default(null),
});
export type ArticleNavProps = z.infer<typeof articleNavPropsSchema>;
export const articleNavBlockContract = defineBlockContract({
  type: 'ArticleNav',
  props: articleNavPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
  },
  search: {
    none: "every word it shows is filled in from elsewhere on the site (the page's neighbours): indexing it would file other pages' titles under this one",
  },
});

/**
 * Other pages filed under the same terms as this one.
 *
 * The query, not a list somebody keeps up to date by hand: an author who
 * had to pick related articles would be maintaining a second index of the
 * site, and it would go stale the day after it was written.
 */
export const relatedPagesPropsSchema = z.object({
  /** `list` and `cards` are the two the reader can tell apart; cards are the ones with room for a date and a summary. */
  layout: z.enum(['list', 'cards']).default('cards'),
  limit: z.number().int().min(1).max(12).default(3),
  /** Filled: newest first, this page never among them. */
  items: z.array(pageGridItemSchema).default([]),
});
export type RelatedPagesProps = z.infer<typeof relatedPagesPropsSchema>;
export const relatedPagesBlockContract = defineBlockContract({
  type: 'RelatedPages',
  props: relatedPagesPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.75rem',
  },
  search: {
    none: "every word it shows is filled in from elsewhere on the site (the page's related pages): indexing it would file other pages' titles under this one",
  },
});

/**
 * One term a `TermList` offers, filled in by the render pass.
 *
 * `slug` and `path` are two different answers because the block asks two
 * different questions: narrowing this page needs the slug that goes in
 * `?term=`, opening the term's own page needs its address.
 */
export const termChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** What `?term=` carries — the term's slug in the language being rendered. */
  slug: z.string(),
  /** The term's own page (ADR-0066), for a list that browses rather than filters. */
  path: z.string(),
});
export type TermChoice = z.infer<typeof termChoiceSchema>;

/**
 * The terms of one dimension, as something a reader can click.
 *
 * Two behaviours, because the same row of chips answers two different
 * needs: `filter` narrows the lists already on this page, keeping the
 * reader where they are, and `browse` sends them to the term's own page.
 * The first is what an archive with a `PageGrid` wants; the second is a
 * category index.
 *
 * `choices` is not a field. Like `PageGrid.items` it is the answer to a
 * query, filled by the render pass for the language being read — a list
 * typed by hand would be a second index of the site's own classification,
 * wrong the first time somebody adds a term.
 */
export const termListPropsSchema = z.object({
  /** Which dimension to offer. `null` on a freshly inserted block: it draws nothing until somebody says. */
  taxonomyId: z.string().nullable().default(null),
  behaviour: z.enum(['filter', 'browse']).default('filter'),
  /** `dropdown` is a real `<form method="get">`, so it narrows the page with JavaScript switched off too. */
  style: z.enum(['chips', 'buttons', 'links', 'dropdown']).default('chips'),
  /** The way back to the unfiltered list. Off for a browse list, where "all" is the page the reader is already on. */
  showAll: z.boolean().default(true),
  choices: z.array(termChoiceSchema).default([]),
});
export type TermListProps = z.infer<typeof termListPropsSchema>;
export const termListBlockContract = defineBlockContract({
  type: 'TermList',
  props: termListPropsSchema,
  style: {
    backgroundColor: 'transparent',
    textColor: 'inherit',
    borderRadius: '0',
    paddingX: '0',
    paddingY: '0',
    gap: '0.5rem',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
  },
  search: {
    none: "the names of terms, which the term's own page already answers for: a filter is a way to move through a list, not words this page says",
  },
});

/** Every block this file declares, in the order the picker draws them. */
export const PAGE_LISTING_BLOCK_CONTRACTS = [
  articleMetaBlockContract,
  articleNavBlockContract,
  relatedPagesBlockContract,
  termListBlockContract,
  pageGridBlockContract,
] as const;
