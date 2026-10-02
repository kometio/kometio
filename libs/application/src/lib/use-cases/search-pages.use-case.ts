import type {
  PageSearchResult,
  SearchPort,
  SiteRepositoryPort,
} from '@kometio/ports';

export interface SearchPagesDeps {
  siteRepository: SiteRepositoryPort;
  searchPort: SearchPort;
}

export interface SearchPagesInput {
  tenantId: string;
  domain: string;
  locale: string;
  query: string;
}

/**
 * The public, unauthenticated search path (see apps/api's
 * PublicPagesModule) — resolves the site from `domain` rather than
 * trusting a client-supplied siteId, same reasoning as
 * getPublishedPageBySlug. An unmatched domain returns `null`, not an
 * error: same "nothing to show, not a failure" collapse the sibling
 * public use-cases already use.
 */
export async function searchPages(
  deps: SearchPagesDeps,
  input: SearchPagesInput,
): Promise<PageSearchResult[] | null> {
  const site = await deps.siteRepository.findByDomain(
    input.tenantId,
    input.domain,
  );
  if (!site) {
    return null;
  }

  return deps.searchPort.search(
    input.tenantId,
    site.id,
    input.locale,
    input.query,
  );
}
