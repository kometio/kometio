import type { PageListState } from '@kometio/shared-types';
import type {
  PageGroupListFilters,
  PageGroupListItem,
  PageGroupRepositoryPort,
  PaginatedResult,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface ListPageGroupsDeps {
  pageGroupRepository: Pick<PageGroupRepositoryPort, 'listBySiteFiltered'>;
  /** Only to name the site's default language when the list is filtered by state. */
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface ListPageGroupsInput {
  tenantId: string;
  siteId: string;
  page: number;
  pageSize: number;
  filters?: Omit<PageGroupListFilters, 'status'>;
  /** Only the pages in this state, as the list row shows it. */
  status?: PageListState;
}

/**
 * Fase 4's pages-list view — one row per PageGroup, filterable.
 *
 * A section of the editor comes back as a feed, newest first; the site's
 * own pages come back in the order somebody dragged them into. That rule
 * lives here rather than in the repository, which should be told what
 * order to return and not have to infer it from a filter.
 */
export async function listPageGroups(
  deps: ListPageGroupsDeps,
  input: ListPageGroupsInput,
): Promise<PaginatedResult<PageGroupListItem>> {
  const filters: PageGroupListFilters = { ...input.filters };
  if (input.status) {
    // A page is in the state of the language its row shows, and which
    // language that is depends on the site's default one.
    const site = await requireSite(
      deps.siteRepository,
      input.tenantId,
      input.siteId,
    );
    filters.status = {
      state: input.status,
      defaultLocale: site.defaultLocale,
    };
  }
  return deps.pageGroupRepository.listBySiteFiltered(
    input.tenantId,
    input.siteId,
    { page: input.page, pageSize: input.pageSize },
    filters,
    filters.collectionId ? 'newest' : 'tree',
  );
}
