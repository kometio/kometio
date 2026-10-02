import { describe, expect, it } from 'vitest';
import { isLinkableUrl, resolveLinkHref } from './link-destination';

describe('resolveLinkHref', () => {
  it('builds the locale path of the picked page, ancestors included', () => {
    expect(
      resolveLinkHref({
        linkType: 'page',
        page: { locale: 'it', slug: 'prezzi', ancestorSlugs: ['docs'] },
        url: 'https://example.com',
      }),
    ).toBe('/it/docs/prezzi');
  });

  it('returns the url when that is what the block points at', () => {
    expect(
      resolveLinkHref({ linkType: 'url', url: 'https://example.com' }),
    ).toBe('https://example.com');
  });

  /*
   * The bug this function exists for. Every component used to fall back
   * to `url` whenever the page did not resolve — so a block whose author
   * chose "Site page" and never picked one linked to a URL the editor
   * stopped showing at all once the fields became conditional
   * (ADR-0062).
   */
  it('points nowhere when the type says page and no page is picked, even with a url set', () => {
    expect(
      resolveLinkHref({
        linkType: 'page',
        page: null,
        url: 'https://example.com',
      }),
    ).toBeNull();
  });

  /*
   * `resolvePageReferences` nulls the reference when the target has no
   * translation in the locale being rendered (deleted, or never
   * translated). Its own comment already calls that "nothing to link
   * to" — this is where that becomes true.
   */
  it('points nowhere when the picked page has no address in this locale', () => {
    expect(
      resolveLinkHref({
        linkType: 'page',
        page: { locale: 'it' },
        url: '/fallback',
      }),
    ).toBeNull();
  });

  /*
   * `href=""` is not an inert link: the empty string resolves against the
   * current document, so clicking reloads the page — which is what an
   * unfilled url field used to produce.
   */
  it('points nowhere for an empty or blank url', () => {
    expect(resolveLinkHref({ linkType: 'url', url: '' })).toBeNull();
    expect(resolveLinkHref({ linkType: 'url', url: '   ' })).toBeNull();
  });

  it("points nowhere when the type is 'none', whatever else is filled in", () => {
    expect(
      resolveLinkHref({
        linkType: 'none',
        page: { locale: 'it', slug: 'prezzi' },
        url: 'https://example.com',
      }),
    ).toBeNull();
  });
});

describe('isLinkableUrl', () => {
  it('lets through the web, email, phone and addresses without a scheme', () => {
    for (const url of [
      'https://example.com/a',
      'HTTP://example.com',
      'mailto:ciao@example.com',
      'tel:+390212345678',
      '/chi-siamo',
      '#contatti',
      '?page=2',
      '//cdn.example.com/x',
      'pagina-relativa',
    ]) {
      expect(isLinkableUrl(url), url).toBe(true);
    }
  });

  it('refuses what a browser would run or open instead of following', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      expect(isLinkableUrl(url), url).toBe(false);
    }
  });

  it('makes a block with such an address point nowhere', () => {
    expect(
      resolveLinkHref({ linkType: 'url', url: 'javascript:alert(1)' }),
    ).toBeNull();
  });
});
