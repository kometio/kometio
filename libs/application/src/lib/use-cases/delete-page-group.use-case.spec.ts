import { describe, expect, it } from 'vitest';
import {
  ChildPageAddressTakenError,
  PageGroupNotFoundError,
  Taxonomy,
} from '@kometio/domain-core';
import {
  InMemoryCollectionRepository,
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemorySiteRepository,
  InMemoryTaxonomyRepository,
  buildSite,
} from '@kometio/testing';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { deletePageGroup } from './delete-page-group.use-case';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  const pageTranslationRepository = new InMemoryPageTranslationRepository(
    new InMemoryPageTranslationVersionRepository(),
  );
  return {
    pageGroupRepository: new InMemoryPageGroupRepository(
      new InMemoryPageGroupVersionRepository(),
      pageTranslationRepository,
    ),
    pageTranslationRepository,
    taxonomyRepository: new InMemoryTaxonomyRepository(),
    siteRepository: new InMemorySiteRepository(
      buildSite({ enabledLocales: ['it', 'en'] }),
    ),
    collectionRepository: new InMemoryCollectionRepository(),
  };
}
type Deps = ReturnType<typeof setup>;

/** A page in Italian (and English when asked), under `parentId`. */
async function givenPage(
  deps: Deps,
  slug: string,
  parentId: string | null = null,
  options: { english?: string } = {},
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
  if (options.english) {
    await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale: 'en',
      slug: options.english,
      seoMeta: { title: options.english, description: '' },
      createdBy: null,
    });
  }
  return group;
}

const del = (deps: Deps, pageGroupId: string) =>
  deletePageGroup(deps, { tenantId, pageGroupId, actorUserId: 'user-1' });

describe('deletePageGroup', () => {
  it('deletes a page without subpages', async () => {
    const deps = setup();
    const page = await givenPage(deps, 'about');

    await del(deps, page.id);

    expect(
      await deps.pageGroupRepository.findById(tenantId, page.id),
    ).toBeNull();
  });

  it('says so for a page that does not exist', async () => {
    const deps = setup();

    await expect(del(deps, 'nowhere')).rejects.toBeInstanceOf(
      PageGroupNotFoundError,
    );
  });

  it('moves the subpages to the top level, every language, and then deletes the page', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id, {
      english: 'plumbing',
    });
    const heating = await givenPage(deps, 'riscaldamento', services.id);

    await del(deps, services.id);

    expect(
      await deps.pageGroupRepository.findById(tenantId, services.id),
    ).toBeNull();
    for (const child of [plumbing, heating]) {
      const moved = await deps.pageGroupRepository.findById(tenantId, child.id);
      expect(moved?.parentId).toBeNull();
    }
    // Each language answers at the top level now — the copy of the parent
    // each one carries follows its page.
    for (const [locale, slug, group] of [
      ['it', 'idraulica', plumbing],
      ['en', 'plumbing', plumbing],
      ['it', 'riscaldamento', heating],
    ] as const) {
      const found =
        await deps.pageTranslationRepository.findByParentGroupAndLocaleSlug(
          tenantId,
          siteId,
          locale,
          null,
          slug,
        );
      expect(found?.pageGroupId).toBe(group.id);
    }
    const top = await deps.pageGroupRepository.listSiblings(
      tenantId,
      siteId,
      null,
    );
    expect(top.map((g) => g.id).sort()).toEqual(
      [plumbing.id, heating.id].sort(),
    );
  });

  it('leaves what is under a subpage under it', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);
    const faucets = await givenPage(deps, 'rubinetti', plumbing.id);

    await del(deps, services.id);

    expect(
      (await deps.pageGroupRepository.findById(tenantId, faucets.id))?.parentId,
    ).toBe(plumbing.id);
    expect(
      (await deps.pageGroupRepository.findById(tenantId, plumbing.id))
        ?.parentId,
    ).toBeNull();
  });

  it('records who moved them', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);

    await del(deps, services.id);

    const [translation] = await deps.pageTranslationRepository.listByGroup(
      tenantId,
      plumbing.id,
    );
    expect(translation?.updatedBy).toBe('user-1');
    expect(translation?.formerParents).toEqual([
      { parentGroupId: services.id, slug: 'idraulica' },
    ]);
  });

  it('refuses when a subpage’s address is already taken at the top level, naming it, and moves nothing', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    const plumbing = await givenPage(deps, 'idraulica', services.id);
    const heating = await givenPage(deps, 'riscaldamento', services.id);
    // A page at the top already answers /it/riscaldamento.
    await givenPage(deps, 'riscaldamento');

    const attempt = del(deps, services.id);

    await expect(attempt).rejects.toBeInstanceOf(ChildPageAddressTakenError);
    await expect(attempt).rejects.toMatchObject({
      slug: 'riscaldamento',
      locale: 'it',
    });
    // Nothing moved — not even the subpage that could have — and nothing was deleted.
    expect(
      (await deps.pageGroupRepository.findById(tenantId, plumbing.id))
        ?.parentId,
    ).toBe(services.id);
    expect(
      (await deps.pageGroupRepository.findById(tenantId, heating.id))?.parentId,
    ).toBe(services.id);
    expect(
      await deps.pageGroupRepository.findById(tenantId, services.id),
    ).not.toBeNull();
  });

  it('refuses when the top-level address is a category’s, too', async () => {
    const deps = setup();
    const services = await givenPage(deps, 'servizi');
    await givenPage(deps, 'blog', services.id);
    await deps.taxonomyRepository.addTaxonomy(
      Taxonomy.create({
        id: 'tax-1',
        tenantId,
        siteId,
        prefix: 'blog',
        name: { it: 'Blog' },
      }),
    );

    await expect(del(deps, services.id)).rejects.toBeInstanceOf(
      ChildPageAddressTakenError,
    );
    expect(
      await deps.pageGroupRepository.findById(tenantId, services.id),
    ).not.toBeNull();
  });
});
