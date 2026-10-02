import { describe, expect, it, vi } from 'vitest';
import { SiteNotFoundError } from '@kometio/domain-core';
import { InMemorySiteRepository, buildSite } from '@kometio/testing';
import { listPageGroups } from './list-page-groups.use-case';

const tenantId = 'tenant-1';

function setup() {
  const listBySiteFiltered = vi.fn().mockResolvedValue({ items: [], total: 0 });
  return {
    listBySiteFiltered,
    deps: {
      pageGroupRepository: { listBySiteFiltered },
      siteRepository: new InMemorySiteRepository(
        buildSite({ defaultLocale: 'it', enabledLocales: ['it', 'en'] }),
      ),
    },
  };
}

describe('listPageGroups', () => {
  it('asks for a state with the site’s default language, which is the one the row is read from', async () => {
    const { deps, listBySiteFiltered } = setup();

    await listPageGroups(deps, {
      tenantId,
      siteId: 'site-1',
      page: 1,
      pageSize: 20,
      status: 'pending',
    });

    expect(listBySiteFiltered).toHaveBeenCalledWith(
      tenantId,
      'site-1',
      { page: 1, pageSize: 20 },
      { status: { state: 'pending', defaultLocale: 'it' } },
      'tree',
    );
  });

  it('keeps the other filters beside the state', async () => {
    const { deps, listBySiteFiltered } = setup();

    await listPageGroups(deps, {
      tenantId,
      siteId: 'site-1',
      page: 2,
      pageSize: 10,
      filters: { search: 'contatti', collectionId: 'news' },
      status: 'draft',
    });

    expect(listBySiteFiltered).toHaveBeenCalledWith(
      tenantId,
      'site-1',
      { page: 2, pageSize: 10 },
      {
        search: 'contatti',
        collectionId: 'news',
        status: { state: 'draft', defaultLocale: 'it' },
      },
      // A section comes back as a feed, newest first.
      'newest',
    );
  });

  it('does not look at the site when no state is asked for', async () => {
    const { deps, listBySiteFiltered } = setup();
    const findById = vi.spyOn(deps.siteRepository, 'findById');

    await listPageGroups(deps, {
      tenantId,
      siteId: 'site-1',
      page: 1,
      pageSize: 20,
    });

    expect(findById).not.toHaveBeenCalled();
    expect(listBySiteFiltered).toHaveBeenCalledWith(
      tenantId,
      'site-1',
      { page: 1, pageSize: 20 },
      {},
      'tree',
    );
  });

  it('says not found for a site that is not this tenant’s, when a state is asked for', async () => {
    const { deps, listBySiteFiltered } = setup();

    await expect(
      listPageGroups(deps, {
        tenantId: 'tenant-2',
        siteId: 'site-1',
        page: 1,
        pageSize: 20,
        status: 'draft',
      }),
    ).rejects.toThrow(SiteNotFoundError);
    expect(listBySiteFiltered).not.toHaveBeenCalled();
  });
});
