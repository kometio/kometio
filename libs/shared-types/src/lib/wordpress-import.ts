import { z } from 'zod';

/**
 * What becomes of one Gutenberg block when it is imported.
 *
 * - `native` — it has a Kometio block that means the same thing.
 * - `quarantine` — it does not, so its content is kept visibly unconverted
 *   rather than dropped. The words survive; the layout does not.
 * - `dropped` — it carries no content at all (a separator, a spacer), so
 *   there is nothing to lose. Counted, never silently ignored.
 */
export type GutenbergBlockSupport =
  'native' | 'fromFields' | 'quarantine' | 'dropped';

/**
 * The mapping table, and the single place that decides it.
 *
 * Shared on purpose between the analysis, which only counts, and the
 * converter that will later do the work: a report that promises something
 * the converter does not deliver is the exact failure this whole feature
 * exists to avoid.
 *
 * Anything not named here is `quarantine`. That is the safe default — a
 * block nobody has looked at is a block nobody can promise anything about
 * — and it is what every plugin block falls into.
 */
const BLOCK_SUPPORT: Record<string, GutenbergBlockSupport> = {
  'core/paragraph': 'native',
  'core/heading': 'native',
  'core/list': 'native',
  'core/list-item': 'native',
  'core/image': 'native',
  'core/gallery': 'native',
  'core/quote': 'native',
  'core/pullquote': 'native',
  'core/table': 'native',
  'core/code': 'native',
  'core/preformatted': 'native',
  'core/columns': 'native',
  'core/column': 'native',
  'core/group': 'native',
  'core/embed': 'native',
  'core/separator': 'dropped',
  'core/spacer': 'dropped',
  'core/nextpage': 'dropped',
  'core/more': 'dropped',
};

/**
 * Gutenberg writes core blocks without their namespace — `<!-- wp:paragraph -->`
 * is `core/paragraph`, while a plugin's block always carries its own
 * (`acf/hero`). Everything here works in the namespaced form.
 */
export function qualifyGutenbergBlockName(name: string): string {
  return name.includes('/') ? name : `core/${name}`;
}

export function gutenbergBlockSupport(name: string): GutenbergBlockSupport {
  return BLOCK_SUPPORT[qualifyGutenbergBlockName(name)] ?? 'quarantine';
}

/** One thing the person about to import should know before they decide. */
export const wordPressAnalysisWarningSchema = z.object({
  kind: z.enum([
    /** A page builder holds the layout somewhere this import cannot read. */
    'page-builder',
    /** The site has more than one language, and this import has one. */
    'multilingual',
    /** Content that lives outside `post_content` — a page arrives with its title and nothing else. */
    'content-outside-the-post',
    /** Post types this import does not bring across. */
    'unsupported-post-types',
    /** The menus, which are rebuilt by hand. */
    'menus',
    /** Blocks whose fields are registered in the theme's code, so only their values travel. */
    'fields-not-described',
  ]),
  /** What was found, as a number the reader can weigh — pages, entries, languages. */
  count: z.number(),
  /** The names behind the count, biggest first: plugin names, post types, locales. */
  detail: z.array(z.string()),
});
export type WordPressAnalysisWarning = z.infer<
  typeof wordPressAnalysisWarningSchema
>;

export const wordPressAnalysisSchema = z.object({
  siteTitle: z.string(),
  sourceUrl: z.string(),
  /** Everything the file holds, whether or not it can be imported. */
  found: z.object({
    pages: z.number(),
    posts: z.number(),
    attachments: z.number(),
    menuItems: z.number(),
    /** Every other post type, biggest first — this is usually where a real site keeps most of itself. */
    otherTypes: z.array(z.object({ type: z.string(), count: z.number() })),
  }),
  /** Of the pages and posts, how many arrive whole. */
  pages: z.object({
    whole: z.number(),
    partial: z.number(),
    /** No content to import at all: the body is empty in the export. */
    empty: z.number(),
  }),
  blocks: z.object({
    total: z.number(),
    /** Blocks with a Kometio block that means the same thing. */
    native: z.number(),
    dropped: z.number(),
    /**
     * Blocks with no Kometio equivalent, but whose **fields** the export
     * describes — so their content converts even though their layout
     * does not.
     *
     * This is most of a site built on custom fields: on the first client
     * site measured it turned 46 blocks that would have arrived empty
     * into 176 real ones, because the words live in the block's
     * attributes and only the definitions say which of them are content
     * and which are settings.
     */
    fromFields: z.number(),
    /**
     * Which blocks those are, biggest first, and how their shape was
     * learnt.
     *
     * `definitions` means the export described the fields. `values`
     * means it did not — the theme registers them in PHP, which is
     * ordinary practice — and the shape was read off the values
     * themselves. On the first client site measured, four of its nine
     * block types were `values`, a fifth of every instance: without that
     * second path their words would simply have been gone.
     */
    fromFieldsByBlock: z.array(
      z.object({
        name: z.string(),
        count: z.number(),
        knownFrom: z.enum(['definitions', 'values']),
      }),
    ),
    /** The blocks that would land in quarantine, biggest first. */
    quarantined: z.array(z.object({ name: z.string(), count: z.number() })),
  }),
  terms: z.array(z.object({ taxonomy: z.string(), count: z.number() })),
  warnings: z.array(wordPressAnalysisWarningSchema),
});
export type WordPressAnalysis = z.infer<typeof wordPressAnalysisSchema>;
