import { describe, expect, it } from 'vitest';
import {
  PageGroupCannotBeItsOwnAncestorError,
  PageGroupNotFoundError,
  PageSlugAlreadyExistsError,
} from '@kometio/domain-core';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryTaxonomyRepository,
  InMemorySiteRepository,
  InMemoryCollectionRepository,
  buildSite,
} from '@kometio/testing';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { movePageGroupToParent } from './move-page-group-to-parent.use-case';

describe('movePageGroupToParent', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
    );
    const pageGroupRepository = new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
      pageTranslationRepository,
    );
    return {
      pageGroupRepository,
      pageTranslationRepository,
      taxonomyRepository: new InMemoryTaxonomyRepository(),
      // The site these pages live on, in every language they are written in.
      siteRepository: new InMemorySiteRepository(
        buildSite({ enabledLocales: ['it', 'en'] }),
      ),
      collectionRepository: new InMemoryCollectionRepository(),
    };
  }

  type Deps = ReturnType<typeof setup>;

  /** A page with one Italian language, saved where `parentId` says. */
  async function givenPage(
    deps: Deps,
    slug: string,
    parentId: string | null = null,
  ) {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId,
      parentId,
      createdBy: null,
    });
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'it',
      slug,
      seoMeta: { title: slug, description: '' },
      createdBy: null,
    });
    return group;
  }

  async function translationOf(deps: Deps, pageGroupId: string) {
    const translations = await deps.pageTranslationRepository.listByGroup(
      tenantId,
      pageGroupId,
    );
    return translations[0];
  }

  it('hangs the page from its new parent', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica');

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: plumbing.id,
      parentId: services.id,
      actorUserId: 'user-1',
    });

    const moved = await deps.pageGroupRepository.findById(
      tenantId,
      plumbing.id,
    );
    expect(moved?.parentId).toBe(services.id);
  });

  /*
   * The address the page answered at is gone the moment it moves, and
   * every link anyone saved points at it — this is what
   * `resolvePageGroupByPath` follows to answer with a 301.
   */
  it('every language remembers the address it used to answer at', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);
    const home = await givenPage(deps, 'casa');

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: plumbing.id,
      parentId: home.id,
      actorUserId: 'user-1',
    });

    expect((await translationOf(deps, plumbing.id)).formerParents).toEqual([
      { parentGroupId: services.id, slug: 'idraulica' },
    ]);
  });

  it('lands last among its new siblings', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    await givenPage(deps, 'primo', services.id);
    await givenPage(deps, 'secondo', services.id);
    const arriving = await givenPage(deps, 'terzo');

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: arriving.id,
      parentId: services.id,
      actorUserId: null,
    });

    const siblings = await deps.pageGroupRepository.listSiblings(
      tenantId,
      siteId,
      services.id,
    );
    const moved = siblings.find((sibling) => sibling.id === arriving.id);
    expect(moved?.order).toBe(2);
  });

  it('refuses to move a page inside itself', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');

    await expect(
      movePageGroupToParent(deps, {
        tenantId,
        pageGroupId: services.id,
        parentId: services.id,
        actorUserId: null,
      }),
    ).rejects.toBeInstanceOf(PageGroupCannotBeItsOwnAncestorError);
  });

  /*
   * The ring this prevents is not hypothetical: a walk of the tree —
   * public resolution, the sitemap, the editor's own list — would either
   * never end or drop the whole branch.
   */
  it('refuses to move a page inside one of its own children', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);
    const emergencies = await givenPage(deps, 'urgenze', plumbing.id);

    await expect(
      movePageGroupToParent(deps, {
        tenantId,
        pageGroupId: services.id,
        parentId: emergencies.id,
        actorUserId: null,
      }),
    ).rejects.toBeInstanceOf(PageGroupCannotBeItsOwnAncestorError);
  });

  it('refuses a destination that does not exist', async () => {
    const deps = setup();
    const page = await givenPage(deps, 'idraulica');

    await expect(
      movePageGroupToParent(deps, {
        tenantId,
        pageGroupId: page.id,
        parentId: 'nowhere',
        actorUserId: null,
      }),
    ).rejects.toBeInstanceOf(PageGroupNotFoundError);
  });

  /*
   * Two children of the same parent cannot share an address, and the
   * destination is where that is decided — the same rule a rename obeys.
   */
  it('refuses a destination where that address is taken', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    await givenPage(deps, 'idraulica', services.id);
    const other = await givenPage(deps, 'idraulica');

    await expect(
      movePageGroupToParent(deps, {
        tenantId,
        pageGroupId: other.id,
        parentId: services.id,
        actorUserId: null,
      }),
    ).rejects.toBeInstanceOf(PageSlugAlreadyExistsError);
  });

  it('records nothing when the page is already where it is asked to go', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);

    await movePageGroupToParent(deps, {
      tenantId,
      pageGroupId: plumbing.id,
      parentId: services.id,
      actorUserId: null,
    });

    expect((await translationOf(deps, plumbing.id)).formerParents).toEqual([]);
  });
});
