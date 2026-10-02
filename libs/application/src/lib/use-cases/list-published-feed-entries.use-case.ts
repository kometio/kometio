import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
} from '@kometio/ports';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import { listPublishedPagePaths } from './list-published-page-paths';

export interface ListPublishedFeedEntriesDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** Only asked when the feed is a term's own — see `termSlug`. */
  taxonomyRepository: TaxonomyRepositoryPort;
}

export interface ListPublishedFeedEntriesInput {
  tenantId: string;
  domain: string;
  locale: string;
  /**
   * The feed of one term rather than of the whole site — the slug it
   * answers at in this language, which is what its own address carries.
   */
  termSlug?: string;
  /** How many of the most recent entries. A feed is a way in, not an archive. */
  limit?: number;
}

export interface FeedEntry {
  title: string;
  /** Ready to use as a link, ancestors included (ADR-0029). */
  path: string;
  description: string;
  /** `null` for a page published before the column existed — such an entry carries no date rather than today's. */
  publishedAt: Date | null;
}

export interface FeedListing {
  siteName: string;
  entries: FeedEntry[];
}

const DEFAULT_LIMIT = 20;

/**
 * The site's most recent pages, or one term's, as a reader's feed.
 *
 * A feed and the archive page are two views of the same question, so it
 * is answered once here rather than assembled twice — and deliberately
 * NOT from the archive page's own blocks: a feed that only worked where
 * somebody had placed a `PageGrid` would be a feed that quietly stopped
 * working when they moved it.
 *
 * Newest first, and a page with no publication date sorts last: a missing
 * date means "we do not know", not "today", and a reader's unread list is
 * not the place to guess.
 *
 * `null` for an unknown domain, like every other public listing here: the
 * caller answers with an empty feed rather than an error, because a
 * request for a feed on a domain this deployment does not serve is not
 * the reader's mistake to see.
 */
export async function listPublishedFeedEntries(
  deps: ListPublishedFeedEntriesDeps,
  input: ListPublishedFeedEntriesInput,
): Promise<FeedListing | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) return null;

  const paths = (
    await listPublishedPagePaths(deps, input.tenantId, site.id)
  ).filter((path) => path.locale === input.locale);

  const allowed = await allowedGroupIds(deps, input, site.id);
  const wanted = allowed
    ? paths.filter((path) => allowed.has(path.groupId))
    : paths;

  const entries = wanted
    .slice()
    .sort((a, b) => {
      if (!a.publishedAt && !b.publishedAt)
        return a.title.localeCompare(b.title);
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    })
    .slice(0, input.limit ?? DEFAULT_LIMIT)
    .map((path) => ({
      title: path.title,
      path: localePathFromAncestors(
        input.locale,
        path.ancestorSlugs,
        path.slug,
      ),
      description: path.description,
      publishedAt: path.publishedAt,
    }));

  return { siteName: site.name, entries };
}

/**
 * `null` when the whole site is the feed; a set when one term is.
 *
 * An empty set for a term nobody can find, which then renders an empty
 * feed: a feed reader asking for a term that was renamed gets a valid,
 * empty answer rather than the whole site's pages under the wrong name.
 */
async function allowedGroupIds(
  deps: ListPublishedFeedEntriesDeps,
  input: ListPublishedFeedEntriesInput,
  siteId: string,
): Promise<Set<string> | null> {
  if (!input.termSlug) return null;
  const terms = await deps.taxonomyRepository.listTermsBySite(
    input.tenantId,
    siteId,
  );
  const term = terms.find(
    (candidate) => candidate.slugFor(input.locale) === input.termSlug,
  );
  if (!term) return new Set();
  const groupIds = await deps.taxonomyRepository.listPageGroupIdsForTerm(
    input.tenantId,
    term.id,
  );
  return new Set(groupIds);
}
