import type { Block } from '@kometio/shared-types';

/** The id a glossary term's element carries, and the index links to. From the block's id, so two glossaries on one page never share one. */
export function glossaryTermAnchor(blockId: string): string {
  return `glossary-term-${blockId}`;
}

/** Where a symbol or a digit is filed: after Z, under one heading. */
export const NON_LETTER_HEADING = '#';

/**
 * The letter a term is filed under: its first letter without its accent,
 * so "Èlite" sits under E with "Elenco" — which is where an Italian
 * reader looks for it — and anything that does not start with a letter
 * under `#`.
 */
export function glossaryInitial(term: string, locale: string): string {
  const first = term
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .charAt(0);
  return /\p{L}/u.test(first)
    ? first.toLocaleUpperCase(locale || undefined)
    : NON_LETTER_HEADING;
}

export interface GlossaryIndexEntry {
  letter: string;
  /** The first term under this letter, in the order the author put them. */
  anchor: string;
}

/**
 * The A–Z index over a glossary's own terms: each letter that has one,
 * alphabetically in this language, linking to its first term.
 *
 * The terms themselves are not re-sorted. Their order is the one the
 * author dragged them into, and a page that shows them in a different
 * order from the editor's would be a page nobody could predict.
 */
export function glossaryIndex(
  items: readonly Block[],
  locale: string,
): GlossaryIndexEntry[] {
  const firstByLetter = new Map<string, string>();
  for (const item of items) {
    if (item.type !== 'GlossaryTerm' || !item.id) continue;
    const term = item.props['term'];
    if (typeof term !== 'string' || !term.trim()) continue;
    const letter = glossaryInitial(term, locale);
    if (!firstByLetter.has(letter)) {
      firstByLetter.set(letter, glossaryTermAnchor(item.id));
    }
  }
  const collator = new Intl.Collator(locale || undefined);
  return [...firstByLetter.entries()]
    .map(([letter, anchor]) => ({ letter, anchor }))
    .sort((a, b) => {
      if (a.letter === NON_LETTER_HEADING) return 1;
      if (b.letter === NON_LETTER_HEADING) return -1;
      return collator.compare(a.letter, b.letter);
    });
}
