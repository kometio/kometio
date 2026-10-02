import { describe, expect, it } from 'vitest';
import {
  buildPageLinkHref,
  collectRichTextPageReferences,
  pageLinkResolverFor,
  resolveRichTextPageLinks,
} from './rich-text-page-links';
import type { PageGroupSlugMap } from './page-reference';

const GUIDE = '9f3a1c72-0000-4000-8000-000000000001';
const ABOUT = '9f3a1c72-0000-4000-8000-000000000002';

function html(...ids: string[]): string {
  return ids.map((id) => `<a href="${buildPageLinkHref(id)}">x</a>`).join(' ');
}

describe('collectRichTextPageReferences', () => {
  it('finds every referenced page', () => {
    expect(collectRichTextPageReferences(html(GUIDE, ABOUT))).toEqual([
      GUIDE,
      ABOUT,
    ]);
  });

  it('finds nothing in text with no internal link', () => {
    expect(
      collectRichTextPageReferences('<p>solo <a href="/it/x">testo</a></p>'),
    ).toEqual([]);
  });

  it('finds nothing in an empty value', () => {
    expect(collectRichTextPageReferences('')).toEqual([]);
  });
});

describe('resolveRichTextPageLinks', () => {
  it('swaps the stored reference for the address it resolves to', () => {
    expect(resolveRichTextPageLinks(html(GUIDE), () => '/it/guida')).toBe(
      '<a href="/it/guida">x</a>',
    );
  });

  // The same stored value, read by two readers, produces two addresses.
  // That is the whole reason the reference is stored instead of the path.
  it('gives each locale its own address from ONE stored value', () => {
    const stored = html(GUIDE);
    expect(resolveRichTextPageLinks(stored, () => '/it/come-funziona')).toBe(
      '<a href="/it/come-funziona">x</a>',
    );
    expect(resolveRichTextPageLinks(stored, () => '/en/how-it-works')).toBe(
      '<a href="/en/how-it-works">x</a>',
    );
  });

  // Same outcome the block-prop path already produces (resolveBlock sets
  // `page: null`, Link.astro renders an <a> with no address). Leaving the
  // kometio:// href would ship a link no browser can follow, and leak an
  // internal id into public HTML.
  it('drops the address, keeping the words, when the page has no translation here', () => {
    const out = resolveRichTextPageLinks(html(GUIDE), () => null);
    expect(out).toBe('<a>x</a>');
    expect(out).not.toContain('kometio://');
  });

  it('resolves several links in one value independently', () => {
    const out = resolveRichTextPageLinks(html(GUIDE, ABOUT), (id) =>
      id === GUIDE ? '/it/guida' : null,
    );
    expect(out).toBe('<a href="/it/guida">x</a> <a>x</a>');
  });

  it('leaves an ordinary link alone', () => {
    const stored = '<p><a href="https://e.example">x</a></p>';
    expect(resolveRichTextPageLinks(stored, () => '/it/no')).toBe(stored);
  });

  it('returns text with no internal link untouched, without scanning it', () => {
    expect(resolveRichTextPageLinks('<p>ciao</p>', () => '/it/x')).toBe(
      '<p>ciao</p>',
    );
  });
});

describe('pageLinkResolverFor', () => {
  const join = (locale: string, ancestors: string[], slug: string) =>
    `/${[locale, ...ancestors, slug].join('/')}`;

  it('builds the path for the locale actually being rendered', () => {
    const map: PageGroupSlugMap = new Map([
      [GUIDE, { locale: 'it', slug: 'guida', ancestorSlugs: [] }],
    ]);
    expect(pageLinkResolverFor(map, join)(GUIDE)).toBe('/it/guida');
  });

  // A slug alone is not an address: slugs are scoped to their siblings
  // (ADR-0029), so a link written inside a sentence needs the chain too.
  it('passes the ancestor chain through, not just the slug', () => {
    const map: PageGroupSlugMap = new Map([
      [
        GUIDE,
        {
          locale: 'en',
          slug: 'installation',
          ancestorSlugs: ['docs', 'getting-started'],
        },
      ],
    ]);
    expect(pageLinkResolverFor(map, join)(GUIDE)).toBe(
      '/en/docs/getting-started/installation',
    );
  });

  it('returns null for a page missing from the map', () => {
    const resolve = pageLinkResolverFor(new Map(), join);
    expect(resolve(ABOUT)).toBeNull();
  });
});
