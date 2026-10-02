import { authorPathSegment } from '@kometio/shared-types';
import type {
  PageGroupRepositoryPort,
  PageTranslationRepositoryPort,
  SiteRepositoryPort,
  TaxonomyRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';
import {
  listPublishedPagePaths,
  type PublishedPagePath,
} from './list-published-page-paths';
import { articlesIn, hasAuthorPage } from './author-profile';

export interface ListPublishedPagesForSitemapDeps {
  siteRepository: SiteRepositoryPort;
  pageGroupRepository: PageGroupRepositoryPort;
  pageTranslationRepository: PageTranslationRepositoryPort;
  /** Terms are addresses too, and a page a term claimed is no longer one (docs/adr/0067). */
  taxonomyRepository: TaxonomyRepositoryPort;
  /** Authors' pages are addresses too (docs/adr/0071). */
  userRepository: UserRepositoryPort;
}

export interface ListPublishedPagesForSitemapInput {
  tenantId: string;
  domain: string;
}

export interface SitemapEntry {
  slug: string;
  locale: string;
  // Links locale-siblings together so apps/public-site can group entries
  // into one <url> block with hreflang alternates per group, instead of
  // one flat <loc> per page regardless of translation. Was the old Page's
  // denormalized `groupId` field — now this IS the PageGroup's own id.
  groupId: string;
  // Root-to-parent slugs (page hierarchy) — lets the sitemap list the
  // canonical nested URL directly instead of a flat one that would just
  // 301-redirect, see apps/public-site's [locale]/[...slug].astro.
  ancestorSlugs: string[];
  updatedAt: Date;
}

export interface SitemapListing {
  items: SitemapEntry[];
  searchEngineIndexingEnabled: boolean;
  defaultLocale: string;
}

/**
 * i18n a livello di campo (see the plan) — replaces the old Page-based
 * implementation. Public, unauthenticated, same domain-resolution and
 * "empty listing on unknown domain, not an error" posture as before.
 *
 * The hierarchy walk itself moved to `listPublishedPagePaths`, which the
 * page lists a term draws also need (docs/adr/0064): two walks of the
 * same tree is how two answers to one question start disagreeing.
 */
export async function listPublishedPagesForSitemap(
  deps: ListPublishedPagesForSitemapDeps,
  input: ListPublishedPagesForSitemapInput,
): Promise<SitemapListing | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }

  const [paths, taxonomies, terms] = await Promise.all([
    listPublishedPagePaths(deps, input.tenantId, site.id),
    deps.taxonomyRepository.listTaxonomiesBySite(input.tenantId, site.id),
    deps.taxonomyRepository.listTermsBySite(input.tenantId, site.id),
  ]);
  const prefixByTaxonomy = new Map(
    taxonomies.map((taxonomy) => [taxonomy.id, taxonomy.prefix]),
  );
  // A page a term renders on its own address answers at that address
  // only — its old URL is a 301 now (docs/adr/0067). Listing both would
  // hand a crawler the duplicate the redirect exists to remove.
  //
  // Per (group, LOCALE) and not per group: a term with no slug in one
  // language does not answer there, so the page keeps serving its own
  // URL in that language — and a URL that answers belongs in the
  // sitemap. Dropping the group outright would hide a live page.
  const claimed = new Set<string>();
  for (const term of terms) {
    if (!term.landingPageGroupId) continue;
    for (const locale of site.enabledLocales) {
      if (term.slugFor(locale) !== null) {
        claimed.add(`${term.landingPageGroupId}:${locale}`);
      }
    }
  }

  const termEntries: SitemapEntry[] = [];
  for (const term of terms) {
    // A term kept out of search engines is kept out of the map that
    // invites them in: listing it and then telling the crawler to go
    // away wastes the crawl and contradicts the page itself.
    if (term.noindex) continue;
    // Only where the term is actually reachable: a language it has no
    // slug in, or that the site does not publish, has no URL to list.
    for (const locale of site.enabledLocales) {
      const slug = term.slugFor(locale);
      if (slug === null) continue;
      const prefix = prefixByTaxonomy.get(term.taxonomyId) ?? null;
      termEntries.push({
        slug,
        locale,
        // The TERM's id groups its own languages together, exactly as a
        // page group does for a page — that is what the hreflang block
        // is built from.
        groupId: term.id,
        ancestorSlugs: prefix ? [prefix] : [],
        updatedAt: term.updatedAt,
      });
    }
  }

  const authorEntries = await listAuthorEntries(
    deps,
    input.tenantId,
    site.enabledLocales,
    paths,
  );

  return {
    items: [
      ...paths
        .filter((path) => !claimed.has(`${path.groupId}:${path.locale}`))
        .map((path) => ({
          slug: path.slug,
          locale: path.locale,
          groupId: path.groupId,
          ancestorSlugs: path.ancestorSlugs,
          updatedAt: path.updatedAt,
        })),
      ...termEntries,
      ...authorEntries,
    ],
    searchEngineIndexingEnabled: site.searchEngineIndexingEnabled,
    defaultLocale: site.defaultLocale,
  };
}

/**
 * An author's page, in every language it answers in — the same rule the
 * page itself answers by (`hasAuthorPage`), so the sitemap never lists an
 * address that 404s. Dated by their newest article there: that is what
 * changes what the page shows.
 *
 * Only the people whose articles are published here are read, not every
 * account of the tenant: an admin who never wrote is not asked about.
 */
async function listAuthorEntries(
  deps: Pick<ListPublishedPagesForSitemapDeps, 'userRepository'>,
  tenantId: string,
  locales: readonly string[],
  paths: readonly PublishedPagePath[],
): Promise<SitemapEntry[]> {
  const authorIds = new Set(
    paths
      .filter((path) => path.collectionId !== null)
      .map((path) => path.authorUserId)
      .filter((id): id is string => id !== null),
  );
  const authors = await Promise.all(
    [...authorIds].map((id) => deps.userRepository.findById(tenantId, id)),
  );

  const entries: SitemapEntry[] = [];
  for (const user of authors) {
    if (!user?.slug) continue;
    for (const locale of locales) {
      if (!hasAuthorPage(user, locale, paths)) continue;
      const newest = articlesIn(paths, locale)
        .filter((path) => path.authorUserId === user.id)
        .reduce(
          (latest, path) => (path.updatedAt > latest ? path.updatedAt : latest),
          new Date(0),
        );
      entries.push({
        slug: user.slug,
        locale,
        groupId: `author:${user.id}`,
        ancestorSlugs: [authorPathSegment(locale)],
        updatedAt: newest,
      });
    }
  }
  return entries;
}
