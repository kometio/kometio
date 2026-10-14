import type { WordPressPermalink } from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';

/** What of a published page of the site this needs: where it answers. */
export interface PlannablePage {
  locale: string;
  slug: string;
  /** Root-to-parent, in this page's language. */
  ancestorSlugs: readonly string[];
}

/** One redirect the move needs: an old address, and the address of the page that took its place. */
export interface PlannedRow {
  from: string;
  to: string;
}

export interface WordPressRedirectPlan {
  rows: PlannedRow[];
  /** Pages and posts that have a page of this site to go to. */
  matched: WordPressPermalink[];
  /** More than one page of this site could be it, and nothing says which. */
  ambiguous: WordPressPermalink[];
  /** No page of this site has its slug: it was not brought across, or not published. */
  unmatched: WordPressPermalink[];
}

/** WordPress's parents are a chain of pages: more than this is a loop in somebody's data. */
const MAX_DEPTH = 12;

/** The path and query an old link was asked at, or `null` for a link that is not an address. */
function addressOf(link: string): string | null {
  try {
    const url = new URL(link);
    return `${url.pathname}${url.search}`;
  } catch {
    return link.startsWith('/') ? link : null;
  }
}

/** The slugs of the pages an item sat under, root first. */
function ancestorSlugsOf(
  item: WordPressPermalink,
  byId: ReadonlyMap<number, WordPressPermalink>,
): string[] {
  const chain: string[] = [];
  const seen = new Set<number>([item.id]);
  let parentId = item.parentId;
  while (parentId !== null && chain.length < MAX_DEPTH) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.unshift(parent.slug.toLowerCase());
    parentId = parent.parentId;
  }
  return chain;
}

const sameSlugs = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((slug, index) => slug === b[index]);

type Choice =
  { kind: 'none' } | { kind: 'one'; page: PlannablePage } | { kind: 'many' };

/**
 * Which page of the site an item became.
 *
 * By its slug, which is the one thing an import keeps; then by who it sat
 * under, when two pages have the slug; then by the site's own language, when
 * it is in several. What is still more than one is not guessed at: a redirect
 * to the wrong page is worse than none, because nothing says it is wrong.
 */
function choose(
  candidates: readonly PlannablePage[],
  chain: readonly string[],
  defaultLocale: string,
): Choice {
  if (candidates.length === 0) return { kind: 'none' };

  const underTheSame = candidates.filter((candidate) =>
    sameSlugs(candidate.ancestorSlugs, chain),
  );
  // A post has no chain and lives under a "blog" page now, so the chain only
  // narrows where it finds something: it never refuses.
  const pool = underTheSame.length > 0 ? underTheSame : candidates;

  const inTheSiteLanguage = pool.filter(
    (candidate) => candidate.locale === defaultLocale,
  );
  const narrowed = inTheSiteLanguage.length > 0 ? inTheSiteLanguage : pool;

  const [only] = narrowed;
  return narrowed.length === 1 && only
    ? { kind: 'one', page: only }
    : { kind: 'many' };
}

/**
 * The redirects a WordPress move needs, from the old addresses in its export
 * and the pages the site has now (docs/adr/0127): each page and post at the
 * address it had, and at the number WordPress answered for it (`/?p=123`,
 * `/?page_id=45`), to the page that took its place.
 *
 * Pure. What is written, and what is already written, is the import's.
 */
export function planWordPressRedirects(
  permalinks: readonly WordPressPermalink[],
  pages: readonly PlannablePage[],
  defaultLocale: string,
): WordPressRedirectPlan {
  const pagesBySlug = new Map<string, PlannablePage[]>();
  for (const page of pages) {
    const key = page.slug.toLowerCase();
    pagesBySlug.set(key, [...(pagesBySlug.get(key) ?? []), page]);
  }
  const byId = new Map(
    permalinks.filter((one) => one.type === 'page').map((one) => [one.id, one]),
  );

  const plan: WordPressRedirectPlan = {
    rows: [],
    matched: [],
    ambiguous: [],
    unmatched: [],
  };
  const said = new Set<string>();
  const say = (from: string, to: string) => {
    if (said.has(from)) return;
    said.add(from);
    plan.rows.push({ from, to });
  };

  for (const item of permalinks) {
    const choice = choose(
      pagesBySlug.get(item.slug.toLowerCase()) ?? [],
      ancestorSlugsOf(item, byId),
      defaultLocale,
    );
    if (choice.kind === 'none') {
      plan.unmatched.push(item);
      continue;
    }
    if (choice.kind === 'many') {
      plan.ambiguous.push(item);
      continue;
    }

    plan.matched.push(item);
    const to = localePathFromAncestors(
      choice.page.locale,
      [...choice.page.ancestorSlugs],
      choice.page.slug,
    );
    const address = addressOf(item.link);
    // The front page's own address is the site's front door: it has no rule
    // of its own, and its number is the one thing left to say.
    if (address !== null && address.replace(/\/+$/, '') !== '') {
      say(address, to);
    }
    say(item.type === 'page' ? `/?page_id=${item.id}` : `/?p=${item.id}`, to);
  }
  return plan;
}
