import { describe, expect, it } from 'vitest';
import {
  FragmentComponentScripts,
  buildFragmentBlock,
  isValidRenderBlockFragmentBody,
  renderBlockFragmentCorsHeaders,
} from './render-block-fragment-helpers';

describe('isValidRenderBlockFragmentBody', () => {
  const valid = {
    pageId: 'page-1',
    token: 'tok',
    blockId: 'block-1',
    blockType: 'Button',
    props: { label: 'Click me' },
  };

  it('accepts a well-formed body', () => {
    expect(isValidRenderBlockFragmentBody(valid)).toBe(true);
  });

  it('rejects a body missing any required field', () => {
    for (const key of Object.keys(valid) as (keyof typeof valid)[]) {
      const rest = { ...valid };
      delete rest[key];
      expect(isValidRenderBlockFragmentBody(rest)).toBe(false);
    }
  });

  it('rejects non-object data', () => {
    expect(isValidRenderBlockFragmentBody(null)).toBe(false);
    expect(isValidRenderBlockFragmentBody('nonsense')).toBe(false);
    expect(isValidRenderBlockFragmentBody(42)).toBe(false);
  });

  it('rejects props that are not an object', () => {
    expect(isValidRenderBlockFragmentBody({ ...valid, props: 'nope' })).toBe(
      false,
    );
  });

  it('accepts an optional children array', () => {
    expect(
      isValidRenderBlockFragmentBody({
        ...valid,
        children: [{ id: 'child-1', type: 'Text', props: { body: 'x' } }],
      }),
    ).toBe(true);
  });

  it('rejects children that are not an array', () => {
    expect(isValidRenderBlockFragmentBody({ ...valid, children: 'nope' })).toBe(
      false,
    );
  });

  it('accepts an optional styleOverride object', () => {
    expect(
      isValidRenderBlockFragmentBody({
        ...valid,
        styleOverride: { backgroundColor: '#ff0000' },
      }),
    ).toBe(true);
  });

  it('rejects a styleOverride that is not an object', () => {
    expect(
      isValidRenderBlockFragmentBody({ ...valid, styleOverride: 'nope' }),
    ).toBe(false);
  });
});

describe('renderBlockFragmentCorsHeaders', () => {
  it('allows only POST/OPTIONS and only the editor-app origin', () => {
    const headers = renderBlockFragmentCorsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe(
      'http://localhost:4200',
    );
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
  });
});

/*
 * A reusable section keeps its blocks on the server: the page's own render
 * grafts them at read time, but the canvas re-renders ONE block, and a
 * Section handed over on its own carries a reference and nothing else. It
 * used to come back as "this section has not been published yet" — for a
 * section plainly published and visible further up the same page.
 */
describe('buildFragmentBlock', () => {
  const page = {
    content: [
      {
        id: 'placed',
        type: 'Section',
        props: { section: { sectionId: 'cta', sectionName: 'Footer CTA' } },
        children: [{ id: 'placed--h', type: 'Heading', props: { text: 'Hi' } }],
      },
    ],
    seoMeta: { title: '', description: '' },
    locale: 'en',
    translations: [],
    ancestors: [],
    site: {} as never,
    header: null,
    footer: null,
    headerSticky: false,
    sections: {
      cta: [{ id: 'h', type: 'Heading', props: { text: 'Hi' } }],
    },
  } as never;

  it('grafts the blocks of a section the page uses', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'copy',
        blockType: 'Section',
        props: { section: { sectionId: 'cta', sectionName: 'Footer CTA' } },
      },
      page,
    );

    expect(block.children?.map((child) => child.type)).toEqual(['Heading']);
    // The ids are derived from the instance, so two copies of one section
    // on a page never share a per-instance style rule.
    expect(block.children?.[0]?.id).toBe('copy--h');
  });

  it('leaves a section the page does not use empty, for the editor to reload', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'copy',
        blockType: 'Section',
        props: { section: { sectionId: 'unknown', sectionName: 'Other' } },
      },
      page,
    );

    expect(block.children).toEqual([]);
  });

  it('keeps the children the caller passed rather than reading the page back', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'box',
        blockType: 'Container',
        props: {},
        children: [{ id: 'fresh', type: 'Text', props: { body: 'new' } }],
      },
      page,
    );

    expect(block.children?.map((child) => child.id)).toEqual(['fresh']);
  });
});

/*
 * Found by review on 2026-09-13: every fragment of a block with a
 * behaviour carried `<script type="module" src="/Users/…/Tabs.astro?astro…">`
 * — the server's absolute path, handed to the editor. The route itself
 * cannot run under vitest (it imports an .astro file); what it does with
 * the container is exercised here with the tag exactly as Astro writes it
 * (astro/dist/runtime/server/render/script.js), and live against the build.
 */
describe('FragmentComponentScripts', () => {
  it('gives Astro a placeholder that is not the module path', async () => {
    const scripts = new FragmentComponentScripts();
    const resolved = await scripts.resolve(
      '/Users/someone/project/apps/public-site/src/components/blocks/Tabs.astro?astro&type=script&index=0&lang.ts',
    );

    expect(resolved).not.toContain('/Users/');
    expect(resolved).not.toContain('.astro');
  });

  it('removes the component scripts it resolved and nothing else', async () => {
    const scripts = new FragmentComponentScripts();
    const first = await scripts.resolve(
      '/a/Tabs.astro?astro&type=script&index=0&lang.ts',
    );
    const second = await scripts.resolve(
      '/a/Form.astro?astro&type=script&index=0&lang.ts',
    );
    const turnstile =
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
    const jsonLd = '<script type="application/ld+json">{"a":1}</script>';
    const html = [
      '<div data-kometio-block-id="b1">Tabs</div>',
      `<script type="module" src="${first}"></script>`,
      turnstile,
      jsonLd,
      `<script type="module" src="${second}"></script>`,
    ].join('');

    expect(scripts.strip(html)).toBe(
      `<div data-kometio-block-id="b1">Tabs</div>${turnstile}${jsonLd}`,
    );
  });

  it('never matches a placeholder another fragment resolved', async () => {
    const one = new FragmentComponentScripts();
    const other = new FragmentComponentScripts();
    const placeholder = await one.resolve('/a/Tabs.astro?astro&type=script');
    const html = `<script type="module" src="${placeholder}"></script>`;

    expect(other.strip(html)).toBe(html);
  });
});

describe('buildFragmentBlock — a block the server fills', () => {
  const author = {
    id: 'u1',
    name: 'Giulia Rossi',
    bio: 'Scrive di caffè.',
    avatar: null,
    path: '/it/autore/giulia-rossi',
  };
  const page = {
    content: [
      {
        id: 'box',
        type: 'Container',
        props: {},
        children: [
          {
            id: 'author',
            type: 'AuthorBox',
            props: { showBio: true, author, isProfilePage: false },
          },
        ],
      },
      {
        id: 'meta',
        type: 'ArticleMeta',
        props: {
          showDate: true,
          publishedAt: '2026-09-01T00:00:00.000Z',
          authorName: 'Giulia Rossi',
          authorPath: '/it/autore/giulia-rossi',
        },
      },
    ],
    seoMeta: { title: '', description: '' },
    locale: 'it',
    translations: [],
    ancestors: [],
    site: {} as never,
    header: null,
    footer: null,
    headerSticky: false,
  } as never;

  /*
   * Found live: switching off an article's date re-rendered the byline from
   * the editor's copy — no date, no author — and the whole line vanished
   * from the canvas until a reload.
   */
  it('keeps the edit as sent and takes the answer from the resolved page', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'meta',
        blockType: 'ArticleMeta',
        props: {
          showDate: false,
          publishedAt: null,
          authorName: '',
          authorPath: null,
        },
      },
      page,
    );

    expect(block.props).toEqual({
      showDate: false,
      publishedAt: '2026-09-01T00:00:00.000Z',
      authorName: 'Giulia Rossi',
      authorPath: '/it/autore/giulia-rossi',
    });
  });

  it('fills one nested in a container being re-rendered', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'box',
        blockType: 'Container',
        props: {},
        children: [
          {
            id: 'author',
            type: 'AuthorBox',
            props: { showBio: false, author: null, isProfilePage: false },
          },
        ],
      },
      page,
    );

    expect(block.children?.[0]?.props).toEqual({
      showBio: false,
      author,
      isProfilePage: false,
    });
  });

  it('leaves a block the page does not have yet as it came', () => {
    const block = buildFragmentBlock(
      {
        pageId: 'p1',
        token: 'tok',
        blockId: 'just-inserted',
        blockType: 'AuthorBox',
        props: { showBio: true, author: null, isProfilePage: false },
      },
      page,
    );

    expect(block.props['author']).toBeNull();
  });
});
