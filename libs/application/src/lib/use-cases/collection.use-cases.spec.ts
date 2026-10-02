import { describe, expect, it } from 'vitest';
import {
  CollectionNotFoundError,
  NotAPageTemplateError,
  PageGroup,
  PageGroupNotFoundError,
  ReusableSection,
  ReusableSectionNotFoundError,
} from '@kometio/domain-core';
import type { ReusableSectionKind } from '@kometio/shared-types';
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from './collection.use-cases';
import { movePageGroupToCollection } from './move-page-group-to-collection.use-case';
import {
  InMemoryCollectionRepository,
  InMemoryPageGroupRepository,
  InMemoryReusableSectionRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';

const tenantId = 'tenant-1';
const siteId = 'site-1';

function setup() {
  return {
    collectionRepository: new InMemoryCollectionRepository(),
    // Two sites: one test files a page under the other site's section.
    siteRepository: new InMemorySiteRepository(
      buildSite(),
      buildSite({ id: 'site-2', domain: 'altro.example' }),
    ),
    pageGroupRepository: new InMemoryPageGroupRepository(),
    reusableSectionRepository: new InMemoryReusableSectionRepository(),
  };
}

describe('collections', () => {
  /*
   * A new section goes at the bottom of the sidebar: adding one must not
   * move the entries somebody has learned the position of.
   */
  it('appends a new section after the ones already there', async () => {
    const deps = setup();

    const first = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'News',
    });
    const second = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'Events',
    });

    expect([first.order, second.order]).toEqual([0, 1]);
    const listed = await listCollections(deps, tenantId, siteId);
    expect(listed.map((one) => one.name)).toEqual(['News', 'Events']);
  });

  it('renaming a section keeps everything else', async () => {
    const deps = setup();
    const collection = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'News',
      icon: 'star',
    });

    const renamed = await updateCollection(deps, {
      tenantId,
      collectionId: collection.id,
      name: 'Press',
    });

    expect(renamed.name).toBe('Press');
    expect(renamed.icon).toBe('star');
  });

  it('refuses to touch a section that does not exist', async () => {
    const deps = setup();

    await expect(
      updateCollection(deps, {
        tenantId,
        collectionId: 'missing',
        name: 'Press',
      }),
    ).rejects.toThrow(CollectionNotFoundError);
    await expect(deleteCollection(deps, tenantId, 'missing')).rejects.toThrow(
      CollectionNotFoundError,
    );
  });

  it('sees nothing of another tenant', async () => {
    const deps = setup();
    await createCollection(deps, { tenantId, siteId, name: 'News' });

    expect(await listCollections(deps, 'tenant-2', siteId)).toEqual([]);
  });
});

describe("a collection's default template", () => {
  async function seedSection(
    deps: ReturnType<typeof setup>,
    id: string,
    options: {
      kind?: ReusableSectionKind;
      published?: boolean;
      site?: string;
    } = {},
  ) {
    const section = ReusableSection.create({
      id,
      tenantId,
      siteId: options.site ?? siteId,
      name: id,
      kind: options.kind ?? 'template',
      content: [{ id: 'hero-1', type: 'Hero', props: { title: 'Hi' } }],
    });
    if (options.published ?? true) {
      section.publish();
    }
    await deps.reusableSectionRepository.add(section);
  }

  it('is set to a published template of the site, and cleared with null', async () => {
    const deps = setup();
    await seedSection(deps, 'article-template');
    const collection = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'News',
    });

    const withDefault = await updateCollection(deps, {
      tenantId,
      collectionId: collection.id,
      defaultTemplateId: 'article-template',
    });
    expect(withDefault.defaultTemplateId).toBe('article-template');

    const renamed = await updateCollection(deps, {
      tenantId,
      collectionId: collection.id,
      name: 'Press',
    });
    expect(renamed.defaultTemplateId).toBe('article-template');

    const cleared = await updateCollection(deps, {
      tenantId,
      collectionId: collection.id,
      defaultTemplateId: null,
    });
    expect(cleared.defaultTemplateId).toBeNull();
  });

  /*
   * The New page dialog offers only published templates of the site, so
   * a default it cannot offer would be preselected as nothing at all.
   */
  it('refuses anything the New page dialog could not offer, and keeps the old one', async () => {
    const deps = setup();
    await seedSection(deps, 'article-template');
    await seedSection(deps, 'newsletter', { kind: 'shared' });
    await seedSection(deps, 'unfinished', { published: false });
    await seedSection(deps, 'elsewhere', { site: 'site-2' });
    const collection = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'News',
    });
    await updateCollection(deps, {
      tenantId,
      collectionId: collection.id,
      defaultTemplateId: 'article-template',
    });

    for (const [defaultTemplateId, error] of [
      ['newsletter', NotAPageTemplateError],
      ['unfinished', NotAPageTemplateError],
      ['elsewhere', ReusableSectionNotFoundError],
      ['missing', ReusableSectionNotFoundError],
    ] as const) {
      await expect(
        updateCollection(deps, {
          tenantId,
          collectionId: collection.id,
          defaultTemplateId,
        }),
      ).rejects.toThrow(error);
    }
    const [stored] = await listCollections(deps, tenantId, siteId);
    expect(stored.defaultTemplateId).toBe('article-template');
  });
});

describe('movePageGroupToCollection', () => {
  async function withPage(deps: ReturnType<typeof setup>) {
    const group = PageGroup.create({ id: 'group-1', tenantId, siteId });
    await deps.pageGroupRepository.add(group);
    return group;
  }

  it('refuses a section of another site: the page would vanish from both', async () => {
    const deps = setup();
    await withPage(deps);
    const elsewhere = await createCollection(deps, {
      tenantId,
      siteId: 'site-2',
      name: 'News',
    });

    await expect(
      movePageGroupToCollection(deps, {
        tenantId,
        pageGroupId: 'group-1',
        collectionId: elsewhere.id,
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(CollectionNotFoundError);
  });

  it('files a page under a section, and takes it back out', async () => {
    const deps = setup();
    await withPage(deps);
    const collection = await createCollection(deps, {
      tenantId,
      siteId,
      name: 'News',
    });

    const filed = await movePageGroupToCollection(deps, {
      tenantId,
      pageGroupId: 'group-1',
      collectionId: collection.id,
      actorUserId: 'user-1',
    });
    expect(filed.collectionId).toBe(collection.id);
    expect(filed.updatedBy).toBe('user-1');

    const back = await movePageGroupToCollection(deps, {
      tenantId,
      pageGroupId: 'group-1',
      collectionId: null,
      actorUserId: 'user-1',
    });
    expect(back.collectionId).toBeNull();
  });

  /*
   * A page pointing at a section that does not exist would simply vanish
   * from every screen, which is the worst way to lose something.
   */
  it('refuses a section that does not exist, leaving the page where it was', async () => {
    const deps = setup();
    await withPage(deps);

    await expect(
      movePageGroupToCollection(deps, {
        tenantId,
        pageGroupId: 'group-1',
        collectionId: 'missing',
        actorUserId: null,
      }),
    ).rejects.toThrow(CollectionNotFoundError);
    const group = await deps.pageGroupRepository.findById(tenantId, 'group-1');
    expect(group?.collectionId).toBeNull();
  });

  it('refuses a page that does not exist', async () => {
    const deps = setup();

    await expect(
      movePageGroupToCollection(deps, {
        tenantId,
        pageGroupId: 'missing',
        collectionId: null,
        actorUserId: null,
      }),
    ).rejects.toThrow(PageGroupNotFoundError);
  });
});
