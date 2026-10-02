import {
  gutenbergBlockSupport,
  qualifyGutenbergBlockName,
  type WordPressAnalysis,
  type WordPressAnalysisWarning,
} from '@kometio/shared-types';
import type {
  WordPressExportItem,
  WordPressExportReaderPort,
} from '@kometio/ports';
import { holdsContent } from '../wordpress-import/convert-acf-fields';
import { recoverAcfValues } from '../wordpress-import/recover-acf-values';

export interface AnalyzeWordPressExportDeps {
  exportReader: WordPressExportReaderPort;
}

export interface AnalyzeWordPressExportInput {
  filePath: string;
}

/** The post types the import brings across. Everything else is reported, not imported. */
const IMPORTED_TYPES = new Set(['page', 'post']);

/**
 * Taxonomies that are plugin bookkeeping rather than how a site files its
 * content, and would only pad the report.
 *
 * `translation_priority` is WPML's; `post_format` is WordPress's own
 * standard/aside/gallery flag; the Polylang pair is how it stores which
 * language a post is in, which the multilingual warning already says.
 */
const INTERNAL_TAXONOMIES = new Set([
  'translation_priority',
  'post_format',
  'language',
  'post_translations',
  'product_visibility',
  'product_type',
]);

/**
 * Postmeta keys that give away a page builder, and the name to report.
 *
 * Detection by key, because the layout these plugins hold is in their own
 * format inside that value — unreadable here, and worth saying out loud
 * before anybody decides to import.
 */
const PAGE_BUILDERS: { key: string; name: string }[] = [
  { key: '_elementor_data', name: 'Elementor' },
  { key: '_et_pb_use_builder', name: 'Divi' },
  { key: '_fl_builder_data', name: 'Beaver Builder' },
  { key: '_vc_post_settings', name: 'WPBakery' },
];

/** Postmeta and taxonomies that give away a multilingual plugin. */
const MULTILINGUAL_META_PREFIXES: { prefix: string; name: string }[] = [
  { prefix: '_icl_', name: 'WPML' },
  { prefix: '_wpml_', name: 'WPML' },
  { prefix: '_pll_', name: 'Polylang' },
];

/** `<!-- wp:name ... -->`, opening tags only: a self-closing block has no closing comment, and `/wp:` is the close. */
const BLOCK_OPENING = /<!--\s+wp:([a-z0-9][a-z0-9/-]*)/g;

/**
 * A block that carries its own attributes, which is where a block built
 * out of custom fields keeps everything it says. One sample of each kind
 * is enough to tell whether that kind converts, and keeping one rather
 * than all of them is what stops this growing with the export: the
 * largest measured holds 43 597 entries.
 */
const BLOCK_WITH_ATTRIBUTES =
  /<!--\s+wp:([a-z0-9][a-z0-9/-]*)\s+(\{.*?\})\s*\/?-->/gs;

/** Nothing is imported while analysing, so nothing a value points at resolves. */
const RESOLVES_NOTHING = {
  resolveMedia: () => null,
  resolvePage: () => null,
};

/**
 * What a WordPress export would actually bring across, said out loud
 * before anything is imported.
 *
 * This exists because every importer on the market fails the same way:
 * quietly. Pages arrive missing their middle, a catalogue of four hundred
 * products arrives as nothing, and the person finds out weeks later. The
 * first thing this one does is count, and the counting is deliberately
 * pessimistic — a block nobody has mapped is reported as quarantine, not
 * hoped about.
 *
 * Nothing is written. The file is read once, streamed, and the numbers
 * are all that is kept: the two client sites this was built against are
 * 6.5 MB and 314 MB, and the second holds 43 597 entries.
 */
export async function analyzeWordPressExport(
  deps: AnalyzeWordPressExportDeps,
  input: AnalyzeWordPressExportInput,
): Promise<WordPressAnalysis> {
  const byType = new Map<string, number>();
  const quarantined = new Map<string, number>();
  const blockSamples = new Map<string, Record<string, unknown>>();
  const termsByTaxonomy = new Map<string, number>();
  const pageBuilders = new Map<string, number>();
  const multilingual = new Set<string>();

  let totalBlocks = 0;
  let nativeBlocks = 0;
  let droppedBlocks = 0;
  const emptyTitles: string[] = [];

  /**
   * One line per page, kept until the whole file has been read.
   *
   * A block with no Kometio equivalent is not necessarily lost: if the
   * export describes its fields, its content converts. But the
   * definitions are entries in the same stream, so whether a page
   * arrives whole cannot be decided while reading it — only afterwards.
   *
   * The file itself is still never held: this is a title and a handful
   * of counts per page, where the export is hundreds of megabytes of
   * media rows and postmeta.
   */
  const pending: { unmapped: Map<string, number>; empty: boolean }[] = [];

  const channel = await deps.exportReader.read(input.filePath, (item) => {
    byType.set(item.postType, (byType.get(item.postType) ?? 0) + 1);
    notePlugins(item, pageBuilders, multilingual);

    if (!IMPORTED_TYPES.has(item.postType) || isNotWorthImporting(item)) {
      return;
    }

    // Counted from the items being imported, not from the file's own list
    // of terms. One real site declares 36 taxonomies, 35 of them
    // WooCommerce product attributes with 659 terms in one of them — none
    // of which apply to a page, and all of which would bury the one
    // taxonomy that does.
    for (const term of item.terms) {
      if (INTERNAL_TAXONOMIES.has(term.taxonomy)) continue;
      termsByTaxonomy.set(
        term.taxonomy,
        (termsByTaxonomy.get(term.taxonomy) ?? 0) + 1,
      );
    }

    rememberBlockAttributes(item.content, blockSamples);

    const counted = countBlocks(item.content);
    totalBlocks += counted.total;
    nativeBlocks += counted.native;
    droppedBlocks += counted.dropped;

    const isEmpty = item.content.trim() === '';
    if (isEmpty && emptyTitles.length < 10) {
      // Named, not just counted: "5 pages arrive empty" is a number,
      // "Home, Contatti… arrive empty" is something to act on.
      emptyTitles.push(item.title || item.slug);
    }
    pending.push({ unmapped: counted.quarantined, empty: isEmpty });
  });

  // Now that the definitions have been read, the blocks with no Kometio
  // equivalent split in two: the ones whose fields the export describes,
  // whose content converts, and the ones it does not.
  const knownFrom = (blockName: string): 'definitions' | 'values' | null => {
    // The definitions decide, when the export has any: they are the
    // site saying what its own block is made of, and a block they
    // describe as nothing but settings — a "latest news" that draws a
    // query — holds no content however full one instance looks.
    //
    // Asked of the block and not of one instance, so which instance
    // happened to be sampled cannot change the answer.
    const fields = channel.acfSchema.forBlock(blockName);
    if (fields.length > 0) {
      return holdsContent(fields) ? 'definitions' : null;
    }

    // With no definitions at all the values are the only evidence, and
    // their shape has to say enough on its own — the case for a theme
    // that registers its fields in code rather than in the database.
    const sample = blockSamples.get(blockName);
    if (!sample) return null;
    const recovered = recoverAcfValues(sample, RESOLVES_NOTHING);
    return recovered.blocks.length + recovered.unconverted.length > 0
      ? 'values'
      : null;
  };

  let whole = 0;
  let partial = 0;
  let empty = 0;
  let fromFields = 0;
  // Two different facts, both worth saying: which blocks the export does
  // not describe (they come out plainer, whatever else happens), and
  // which ones convert and how.
  const undescribed = new Map<string, number>();
  const fromFieldsByBlock = new Map<
    string,
    { count: number; knownFrom: 'definitions' | 'values' }
  >();

  for (const page of pending) {
    let stillQuarantined = 0;
    for (const [name, count] of page.unmapped) {
      const source = knownFrom(name);
      if (source !== 'definitions' && name.includes('/')) {
        undescribed.set(name, (undescribed.get(name) ?? 0) + count);
      }
      if (source !== null) {
        fromFields += count;
        const seen = fromFieldsByBlock.get(name);
        fromFieldsByBlock.set(name, {
          count: (seen?.count ?? 0) + count,
          knownFrom: source,
        });
        continue;
      }
      stillQuarantined += count;
      quarantined.set(name, (quarantined.get(name) ?? 0) + count);
    }
    if (page.empty) empty += 1;
    else if (stillQuarantined > 0) partial += 1;
    else whole += 1;
  }

  const otherTypes = [...byType]
    .filter(([type]) => !KNOWN_TYPES.has(type))
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    siteTitle: channel.title,
    sourceUrl: channel.baseBlogUrl || channel.baseSiteUrl,
    found: {
      pages: byType.get('page') ?? 0,
      posts: byType.get('post') ?? 0,
      attachments: byType.get('attachment') ?? 0,
      menuItems: byType.get('nav_menu_item') ?? 0,
      otherTypes,
    },
    pages: { whole, partial, empty },
    blocks: {
      total: totalBlocks,
      native: nativeBlocks,
      dropped: droppedBlocks,
      fromFields,
      fromFieldsByBlock: [...fromFieldsByBlock]
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.count - a.count),
      quarantined: [...quarantined]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
    terms: [...termsByTaxonomy]
      .map(([taxonomy, count]) => ({ taxonomy, count }))
      .sort((a, b) => b.count - a.count),
    warnings: buildWarnings({
      pageBuilders,
      multilingual,
      emptyTitles,
      empty,
      otherTypes,
      menuItems: byType.get('nav_menu_item') ?? 0,
      undescribed,
    }),
  };
}

/**
 * The types the analysis accounts for by name. Everything else is a custom
 * post type — which on a real site is usually most of it, and is the
 * number the person needs to see.
 */
const KNOWN_TYPES = new Set([
  'page',
  'post',
  'attachment',
  'nav_menu_item',
  'revision',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'user_request',
  'wp_global_styles',
  'acf-field',
  'acf-field-group',
]);

/** WordPress keeps drafts of drafts; only what somebody would recognise as their page counts. */
function isNotWorthImporting(item: WordPressExportItem): boolean {
  return item.status === 'auto-draft' || item.status === 'trash';
}

function countBlocks(content: string): {
  total: number;
  native: number;
  dropped: number;
  quarantined: Map<string, number>;
} {
  const quarantined = new Map<string, number>();
  let total = 0;
  let native = 0;
  let dropped = 0;

  for (const [, blockName] of content.matchAll(BLOCK_OPENING)) {
    // The pattern's one group always takes part in a match.
    if (blockName === undefined) continue;
    const name = qualifyGutenbergBlockName(blockName);
    total += 1;
    const support = gutenbergBlockSupport(name);
    if (support === 'native') native += 1;
    else if (support === 'dropped') dropped += 1;
    else quarantined.set(name, (quarantined.get(name) ?? 0) + 1);
  }

  // No block delimiters at all and a body that is not empty: a classic
  // WordPress page, from before Gutenberg or written by a theme. It is
  // HTML, which converts — so it counts as one native block rather than
  // as nothing, which would have read as "this page is empty".
  if (total === 0 && content.trim() !== '') {
    return { total: 1, native: 1, dropped: 0, quarantined };
  }
  return { total, native, dropped, quarantined };
}

function notePlugins(
  item: WordPressExportItem,
  pageBuilders: Map<string, number>,
  multilingual: Set<string>,
): void {
  for (const key of item.metaKeys) {
    for (const builder of PAGE_BUILDERS) {
      if (key === builder.key) {
        pageBuilders.set(
          builder.name,
          (pageBuilders.get(builder.name) ?? 0) + 1,
        );
      }
    }
    for (const plugin of MULTILINGUAL_META_PREFIXES) {
      if (key.startsWith(plugin.prefix)) multilingual.add(plugin.name);
    }
  }
  for (const term of item.terms) {
    if (term.taxonomy === 'language' || term.taxonomy === 'post_translations') {
      multilingual.add('Polylang');
    }
  }
}

function buildWarnings(context: {
  pageBuilders: Map<string, number>;
  multilingual: Set<string>;
  emptyTitles: string[];
  empty: number;
  otherTypes: { type: string; count: number }[];
  menuItems: number;
  undescribed: Map<string, number>;
}): WordPressAnalysisWarning[] {
  const warnings: WordPressAnalysisWarning[] = [];

  for (const [name, count] of context.pageBuilders) {
    warnings.push({ kind: 'page-builder', count, detail: [name] });
  }
  if (context.multilingual.size > 0) {
    warnings.push({
      kind: 'multilingual',
      count: context.multilingual.size,
      detail: [...context.multilingual],
    });
  }
  if (context.empty > 0) {
    warnings.push({
      kind: 'content-outside-the-post',
      count: context.empty,
      detail: context.emptyTitles,
    });
  }
  const otherTotal = context.otherTypes.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  if (otherTotal > 0) {
    warnings.push({
      kind: 'unsupported-post-types',
      count: otherTotal,
      detail: context.otherTypes
        .slice(0, 6)
        .map((entry) => `${entry.type} (${entry.count})`),
    });
  }
  if (context.menuItems > 0) {
    warnings.push({ kind: 'menus', count: context.menuItems, detail: [] });
  }
  const undescribedTotal = [...context.undescribed.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  if (undescribedTotal > 0) {
    // A theme may register its fields in code instead of in the
    // database, and then only the values travel — so their content can
    // be recovered but not what any of it means. Common enough to be
    // worth saying: on the first client site it was 12 blocks of 58.
    warnings.push({
      kind: 'fields-not-described',
      count: undescribedTotal,
      detail: [...context.undescribed]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => `${name} (${count})`),
    });
  }
  return warnings;
}

/**
 * Keeps one instance of each kind of block that carries attributes.
 *
 * One, not all: what the report needs to know is whether a *kind* of
 * block converts, and holding every instance would grow with the export.
 */
function rememberBlockAttributes(
  content: string,
  samples: Map<string, Record<string, unknown>>,
): void {
  if (!content.includes('<!-- wp:')) return;
  for (const [, blockName, rawAttributes] of content.matchAll(
    BLOCK_WITH_ATTRIBUTES,
  )) {
    if (blockName === undefined || rawAttributes === undefined) continue;
    const name = qualifyGutenbergBlockName(blockName);
    if (samples.has(name)) continue;
    try {
      const attributes: unknown = JSON.parse(rawAttributes);
      const data =
        attributes !== null &&
        typeof attributes === 'object' &&
        'data' in attributes
          ? (attributes as { data: unknown }).data
          : null;
      if (data !== null && typeof data === 'object') {
        samples.set(name, data as Record<string, unknown>);
      }
    } catch {
      // Attributes that are not JSON describe nothing; the block is
      // counted where it always was.
    }
  }
}
