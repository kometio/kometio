import { describe, expect, it } from 'vitest';
import type { PageContent } from './content-model';
import {
  collectPageGroupReferences,
  collectResolvedPageRefs,
  resolvePageReferences,
} from './page-reference';

describe('collectPageGroupReferences', () => {
  it('collects every referenced pageGroupId, including nested children', () => {
    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: 'group-docs', title: 'Docs' },
          url: '',
        },
      },
      {
        id: 'columns-1',
        type: 'Columns',
        props: {},
        children: [
          {
            id: 'button-1',
            type: 'Button',
            props: {
              label: 'Go',
              linkType: 'page',
              page: { pageGroupId: 'group-contact', title: 'Contact' },
              url: '',
            },
          },
        ],
      },
    ];

    expect(collectPageGroupReferences(content)).toEqual(
      new Set(['group-docs', 'group-contact']),
    );
  });

  it('ignores blocks with no page reference, including a null one', () => {
    const content: PageContent = [
      { id: 'text-1', type: 'Text', props: { body: 'hi' } },
      {
        id: 'link-1',
        type: 'Link',
        props: { label: 'x', linkType: 'url', page: null, url: '/x' },
      },
    ];

    expect(collectPageGroupReferences(content)).toEqual(new Set());
  });
});

describe('resolvePageReferences', () => {
  it('adds locale/slug to every matching page reference for the given map', () => {
    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: 'group-docs', title: 'Docs' },
          url: '',
        },
      },
    ];

    const resolved = resolvePageReferences(
      content,
      new Map([
        [
          'group-docs',
          { locale: 'it', slug: 'documentazione', ancestorSlugs: [] },
        ],
      ]),
    );

    expect(resolved[0].props['page']).toEqual({
      pageGroupId: 'group-docs',
      title: 'Docs',
      locale: 'it',
      slug: 'documentazione',
      ancestorSlugs: [],
    });
  });

  it('resolves to null when the referenced group has no translation in this locale', () => {
    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: 'group-docs', title: 'Docs' },
          url: '',
        },
      },
    ];

    const resolved = resolvePageReferences(content, new Map());

    expect(resolved[0].props['page']).toBeNull();
  });

  it('resolves nested children too, and leaves everything else untouched', () => {
    const content: PageContent = [
      {
        id: 'columns-1',
        type: 'Columns',
        props: { layout: 'two-equal' },
        children: [
          {
            id: 'button-1',
            type: 'Button',
            props: {
              label: 'Go',
              linkType: 'page',
              page: { pageGroupId: 'group-contact', title: 'Contact' },
              url: '',
            },
          },
          { id: 'text-1', type: 'Text', props: { body: 'hi' } },
        ],
      },
    ];

    const resolved = resolvePageReferences(
      content,
      new Map([
        ['group-contact', { locale: 'en', slug: 'contact', ancestorSlugs: [] }],
      ]),
    );

    expect(resolved[0].children?.[0].props['page']).toEqual({
      pageGroupId: 'group-contact',
      title: 'Contact',
      locale: 'en',
      slug: 'contact',
      ancestorSlugs: [],
    });
    expect(resolved[0].children?.[1]).toEqual({
      id: 'text-1',
      type: 'Text',
      props: { body: 'hi' },
    });
    expect(resolved[0].props).toEqual({ layout: 'two-equal' });
  });
});

describe('links written inside a sentence', () => {
  const GUIDE = '9f3a1c72-0000-4000-8000-000000000001';
  const richText = (id: string) =>
    `<p>come ho <a href="kometio://page/${id}">spiegato qui</a></p>`;

  it('is collected like any other page reference', () => {
    expect(
      collectPageGroupReferences([
        { id: 'a', type: 'Text', props: { body: richText(GUIDE) } },
      ]),
    ).toEqual(new Set([GUIDE]));
  });

  it('is collected from a nested block too', () => {
    expect(
      collectPageGroupReferences([
        {
          id: 'c',
          type: 'Container',
          props: {},
          children: [
            { id: 'a', type: 'Text', props: { body: richText(GUIDE) } },
          ],
        },
      ]),
    ).toEqual(new Set([GUIDE]));
  });

  // The whole reason the reference is stored instead of the address: the
  // page is renamed or read in another language, and the link inside the
  // paragraph follows it.
  it('resolves to the address of the locale being rendered', () => {
    const blocks = [
      { id: 'a', type: 'Text', props: { body: richText(GUIDE) } },
    ];

    const italian = resolvePageReferences(
      blocks,
      new Map([
        [GUIDE, { locale: 'it', slug: 'come-funziona', ancestorSlugs: [] }],
      ]),
    );
    expect(italian[0].props['body']).toBe(
      '<p>come ho <a href="/it/come-funziona">spiegato qui</a></p>',
    );

    const english = resolvePageReferences(
      blocks,
      new Map([
        [GUIDE, { locale: 'en', slug: 'how-it-works', ancestorSlugs: [] }],
      ]),
    );
    expect(english[0].props['body']).toBe(
      '<p>come ho <a href="/en/how-it-works">spiegato qui</a></p>',
    );
  });

  // The case the language-switcher fix (PR #137) was about, in the other
  // consumer of the same resolver: a link written inside a sentence has
  // to carry the ancestor chain too, or it points at a bare slug that
  // stopped resolving when slugs became sibling-scoped (ADR-0029).
  it('resolves to the nested address, not the bare slug', () => {
    const resolved = resolvePageReferences(
      [{ id: 'a', type: 'Text', props: { body: richText(GUIDE) } }],
      new Map([
        [
          GUIDE,
          {
            locale: 'en',
            slug: 'installation',
            ancestorSlugs: ['docs', 'getting-started'],
          },
        ],
      ]),
    );

    expect(resolved[0].props['body']).toBe(
      '<p>come ho <a href="/en/docs/getting-started/installation">spiegato qui</a></p>',
    );
  });

  it('uses the same "home" convention as every other address', () => {
    const resolved = resolvePageReferences(
      [{ id: 'a', type: 'Text', props: { body: richText(GUIDE) } }],
      new Map([[GUIDE, { locale: 'it', slug: 'home', ancestorSlugs: [] }]]),
    );
    expect(resolved[0].props['body']).toContain('href="/it/"');
  });

  // Same outcome the `page` prop already produces: nothing to link to,
  // so no address — never a dangling kometio:// link in public HTML.
  it('drops the address, keeping the words, when the page is gone', () => {
    const resolved = resolvePageReferences(
      [{ id: 'a', type: 'Text', props: { body: richText(GUIDE) } }],
      new Map(),
    );
    expect(resolved[0].props['body']).toBe(
      '<p>come ho <a>spiegato qui</a></p>',
    );
  });

  // Not just equal: the same object. A block with nothing to resolve
  // should not be copied, or every render would rebuild the whole tree.
  it('leaves a block with no internal link untouched', () => {
    const blocks = [{ id: 'a', type: 'Text', props: { body: '<p>ciao</p>' } }];
    expect(resolvePageReferences(blocks, new Map())[0]).toBe(blocks[0]);
  });
});

describe('collectResolvedPageRefs', () => {
  it('harvests pageGroupId -> locale/slug pairs from an already-resolved tree', () => {
    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: {
            pageGroupId: 'group-docs',
            title: 'Docs',
            locale: 'it',
            slug: 'documentazione',
            ancestorSlugs: [],
          },
          url: '',
        },
      },
    ];

    expect(collectResolvedPageRefs(content)).toEqual(
      new Map([
        [
          'group-docs',
          { locale: 'it', slug: 'documentazione', ancestorSlugs: [] },
        ],
      ]),
    );
  });

  it('skips an unresolved reference (no locale/slug yet)', () => {
    const content: PageContent = [
      {
        id: 'nav-1',
        type: 'NavLink',
        props: {
          label: 'Docs',
          linkType: 'page',
          page: { pageGroupId: 'group-docs', title: 'Docs' },
          url: '',
        },
      },
    ];

    expect(collectResolvedPageRefs(content)).toEqual(new Map());
  });
});
