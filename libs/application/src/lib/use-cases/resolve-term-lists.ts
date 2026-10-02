import type { Block, PageContent, TermChoice } from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import type { TaxonomyRepositoryPort } from '@kometio/ports';

export interface ResolveTermListsDeps {
  taxonomyRepository: TaxonomyRepositoryPort;
}

export interface ResolvedTermLists {
  contents: PageContent[];
  /**
   * Which of the offered terms each page carries, by page group.
   *
   * Handed to the `PageGrid` pass rather than read there directly: the
   * two blocks are asking one question between them — "what can be
   * narrowed, and what does each entry answer to" — and asking it twice
   * would mean walking the same terms twice.
   */
  slugsByGroup: Map<string, string[]>;
}

function collectTaxonomyIds(blocks: PageContent, into: Set<string>): void {
  for (const block of blocks) {
    if (block.type === 'TermList') {
      const taxonomyId = block.props['taxonomyId'];
      if (typeof taxonomyId === 'string' && taxonomyId !== '')
        into.add(taxonomyId);
    }
    if (block.children) collectTaxonomyIds(block.children, into);
  }
}

/** Any language it has a name in beats its id — a term is named once per language, and not always in all of them. */
function labelFor(name: Record<string, string>, locale: string): string {
  const own = name[locale]?.trim();
  if (own) return own;
  return Object.values(name).find((value) => value.trim() !== '') ?? '';
}

/**
 * Fills in the terms each `TermList` offers, and says which of them every
 * listed page carries.
 *
 * Nothing here is authorable, for the reason `PageGrid.items` is not: a
 * row of chips typed by hand is a second copy of the site's own
 * classification, and it is wrong the first time somebody adds a term.
 *
 * A term with no slug in the language being rendered is left out rather
 * than offered: its page does not answer in this language, and a filter
 * that narrows to nothing is worse than one option fewer.
 */
export async function resolveTermLists(
  deps: ResolveTermListsDeps,
  tenantId: string,
  locale: string,
  contents: PageContent[],
): Promise<ResolvedTermLists> {
  const taxonomyIds = new Set<string>();
  for (const content of contents) collectTaxonomyIds(content, taxonomyIds);
  if (taxonomyIds.size === 0) {
    return { contents, slugsByGroup: new Map() };
  }

  const choicesByTaxonomy = new Map<string, TermChoice[]>();
  const slugsByGroup = new Map<string, string[]>();

  for (const taxonomyId of taxonomyIds) {
    const [taxonomy, terms] = await Promise.all([
      deps.taxonomyRepository.findTaxonomyById(tenantId, taxonomyId),
      deps.taxonomyRepository.listTermsByTaxonomy(tenantId, taxonomyId),
    ]);
    // Deleted between the block being placed and the page being read:
    // the block draws nothing, the page renders. A classification that
    // lost a dimension must not take an archive down with it.
    if (!taxonomy) continue;

    const choices: TermChoice[] = [];
    // A term with no address in this language is left out, and the ones that
    // stay carry the address they were kept for.
    const usable = terms.flatMap((term) => {
      const slug = term.slugFor(locale);
      return slug === null ? [] : [{ term, slug }];
    });
    const groupIdLists = await Promise.all(
      usable.map(({ term }) =>
        deps.taxonomyRepository.listPageGroupIdsForTerm(tenantId, term.id),
      ),
    );
    usable.forEach(({ term, slug }, index) => {
      const prefix = taxonomy.prefix;
      choices.push({
        id: term.id,
        label: labelFor(term.name, locale),
        slug,
        // The same address the sitemap writes for it: flat under the
        // dimension's prefix, ancestors deliberately absent (ADR-0064).
        path: localePathFromAncestors(locale, prefix ? [prefix] : [], slug),
      });
      for (const groupId of groupIdLists[index] ?? []) {
        const already = slugsByGroup.get(groupId);
        if (already) already.push(slug);
        else slugsByGroup.set(groupId, [slug]);
      }
    });
    choicesByTaxonomy.set(taxonomyId, choices);
  }

  return {
    contents: contents.map((content) => fillBlocks(content, choicesByTaxonomy)),
    slugsByGroup,
  };
}

function fillBlocks(
  blocks: PageContent,
  choicesByTaxonomy: Map<string, TermChoice[]>,
): PageContent {
  return blocks.map((block) => {
    const children = block.children
      ? fillBlocks(block.children, choicesByTaxonomy)
      : undefined;
    if (block.type !== 'TermList') {
      return children ? { ...block, children } : block;
    }
    const taxonomyId = block.props['taxonomyId'];
    const choices =
      typeof taxonomyId === 'string'
        ? (choicesByTaxonomy.get(taxonomyId) ?? [])
        : [];
    const next: Block = { ...block, props: { ...block.props, choices } };
    return children ? { ...next, children } : next;
  });
}
