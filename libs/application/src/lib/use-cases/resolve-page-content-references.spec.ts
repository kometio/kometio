import { describe, expect, it } from 'vitest';
import type { PageContent } from '@kometio/shared-types';
import { createPageGroup } from './create-page-group.use-case';
import { createPageGroupTranslation } from './create-page-group-translation.use-case';
import { resolvePageContentReferences } from './resolve-page-content-references';
import {
  InMemoryPageGroupRepository,
  InMemoryPageGroupVersionRepository,
  InMemoryPageTranslationRepository,
  InMemoryPageTranslationVersionRepository,
  InMemoryReusableSectionRepository,
  InMemoryTaxonomyRepository,
  InMemorySiteRepository,
  InMemoryCollectionRepository,
  buildSite,
} from '@kometio/testing';

describe('resolvePageContentReferences', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup() {
    const pageGroupVersionRepository = new InMemoryPageGroupVersionRepository();
    const pageGroupRepository = new InMemoryPageGroupRepository(
      pageGroupVersionRepository,
    );
    const pageTranslationVersionRepository =
      new InMemoryPageTranslationVersionRepository();
    const pageTranslationRepository = new InMemoryPageTranslationRepository(
      pageTranslationVersionRepository,
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
      reusableSectionRepository: new InMemoryReusableSectionRepository(),
    };
  }

  async function createGroupWithTranslation(
    deps: ReturnType<typeof setup>,
    locale: string,
    slug: string,
    parentId: string | null = null,
  ) {
    const group = await createPageGroup(deps, {
      tenantId,
      siteId: 'site-1',
      parentId,
      createdBy: 'user-1',
    });
    const translation = await createPageGroupTranslation(deps, {
      tenantId,
      pageGroupId: group.id,
      locale,
      slug,
      seoMeta: { title: slug, description: '' },
      createdBy: 'user-1',
    });
    return { group, translation };
  }

  it('resolves a page reference to the destination locale/slug', async () => {
    const deps = setup();
    const { group: docsGroup } = await createGroupWithTranslation(
      deps,
      'it',
      'documentazione',
    );

    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: docsGroup.id, title: 'Documentazione' },
          url: '',
        },
      },
    ];

    const [resolved] = await resolvePageContentReferences(
      deps,
      tenantId,
      siteId,
      'it',
      [content],
    );

    expect(resolved[0].props['page']).toEqual({
      pageGroupId: docsGroup.id,
      title: 'Documentazione',
      locale: 'it',
      slug: 'documentazione',
      ancestorSlugs: [],
    });
  });

  it('resolves to null when the referenced group has no translation in this locale', async () => {
    const deps = setup();
    const { group: docsGroup } = await createGroupWithTranslation(
      deps,
      'it',
      'documentazione',
    );

    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: docsGroup.id, title: 'Documentazione' },
          url: '',
        },
      },
    ];

    // Requesting 'en', but the group only has an 'it' translation.
    const [resolved] = await resolvePageContentReferences(
      deps,
      tenantId,
      siteId,
      'en',
      [content],
    );

    expect(resolved[0].props['page']).toBeNull();
  });

  it('shares one lookup across multiple content trees (e.g. page content + header)', async () => {
    const deps = setup();
    const { group: docsGroup } = await createGroupWithTranslation(
      deps,
      'it',
      'documentazione',
    );
    const pageRefBlock = {
      id: 'nav-1',
      type: 'NavLink',
      props: {
        label: 'Docs',
        linkType: 'page',
        page: { pageGroupId: docsGroup.id, title: 'Documentazione' },
        url: '',
      },
    };
    const header: PageContent = [pageRefBlock];
    const footer: PageContent = [{ ...pageRefBlock, id: 'nav-2' }];

    const [resolvedHeader, resolvedFooter] = await resolvePageContentReferences(
      deps,
      tenantId,
      siteId,
      'it',
      [header, footer],
    );

    expect(resolvedHeader[0].props['page']).toMatchObject({
      locale: 'it',
      slug: 'documentazione',
    });
    expect(resolvedFooter[0].props['page']).toMatchObject({
      locale: 'it',
      slug: 'documentazione',
    });
  });

  /*
   * It used to be resolved on the term route alone, so the very thing
   * the block's own description promises — "the three articles in this
   * category, here" — rendered empty on every ordinary page and in every
   * preview.
   */
  it('fills in what a PageGrid lists, wherever the page is being served from', async () => {
    const deps = setup();
    const { group, translation } = await createGroupWithTranslation(
      deps,
      'it',
      'un-articolo',
    );
    translation.publish([], { by: null });
    await deps.pageTranslationRepository.publish(translation);
    await deps.taxonomyRepository.setTermsForPageGroup(tenantId, group.id, [
      'term-1',
    ]);

    const [resolved] = await resolvePageContentReferences(
      deps,
      tenantId,
      siteId,
      'it',
      [
        [
          {
            id: 'grid-1',
            type: 'PageGrid',
            props: { termId: 'term-1', order: 'title', items: [] },
          },
        ],
      ],
    );

    expect(resolved[0].props['items']).toEqual([
      expect.objectContaining({
        title: 'un-articolo',
        path: '/it/un-articolo',
      }),
    ]);
  });

  it('returns the content trees unchanged when nothing references a page', async () => {
    const deps = setup();
    const content: PageContent = [
      { id: 'text-1', type: 'Text', props: { body: 'hi' } },
    ];

    const [resolved] = await resolvePageContentReferences(
      deps,
      tenantId,
      siteId,
      'it',
      [content],
    );

    expect(resolved).toEqual(content);
  });

  // A slug alone is not an address: slugs are scoped to their siblings
  // (ADR-0029), so a Link/NavLink/Button pointing at a nested page
  // rendered `/it/primo-avvio` and sent the visitor to a 404.
  describe('links to a nested page', () => {
    function navLinkTo(pageGroupId: string): PageContent {
      return [
        {
          id: 'nav-1',
          type: 'NavLink',
          props: {
            label: 'Vai',
            linkType: 'page',
            page: { pageGroupId, title: 'Vai' },
            url: '',
          },
        },
      ];
    }

    it('resolves the whole ancestor chain, in the locale being rendered', async () => {
      const deps = setup();
      const { group: parent } = await createGroupWithTranslation(
        deps,
        'it',
        'documentazione',
      );
      const { group: child } = await createGroupWithTranslation(
        deps,
        'it',
        'primo-avvio',
        parent.id,
      );

      const [resolved] = await resolvePageContentReferences(
        deps,
        tenantId,
        siteId,
        'it',
        [navLinkTo(child.id)],
      );

      expect(resolved[0].props['page']).toEqual({
        pageGroupId: child.id,
        title: 'Vai',
        locale: 'it',
        slug: 'primo-avvio',
        ancestorSlugs: ['documentazione'],
      });
    });

    // The target exists in this locale but its parent does not, so no URL
    // reaches it here — the top-down walk would stop at the missing
    // segment. `null` is what every block already renders as "no link",
    // which is right: better no link than one that 404s.
    it('resolves to null when an ancestor is missing in this locale', async () => {
      const deps = setup();
      const { group: parent } = await createGroupWithTranslation(
        deps,
        'it',
        'documentazione',
      );
      const { group: child } = await createGroupWithTranslation(
        deps,
        'it',
        'primo-avvio',
        parent.id,
      );
      await createPageGroupTranslation(deps, {
        tenantId,
        pageGroupId: child.id,
        locale: 'en',
        slug: 'first-run',
        seoMeta: { title: 'First run', description: '' },
        createdBy: 'user-1',
      });

      const [resolved] = await resolvePageContentReferences(
        deps,
        tenantId,
        siteId,
        'en',
        [navLinkTo(child.id)],
      );

      expect(resolved[0].props['page']).toBeNull();
    });
  });
});
