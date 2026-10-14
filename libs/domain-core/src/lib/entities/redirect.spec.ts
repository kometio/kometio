import { describe, expect, it } from 'vitest';
import { InvalidRedirectError } from '../errors';
import { Redirect } from './redirect';

const base = {
  id: 'r1',
  tenantId: 't1',
  siteId: 's1',
  origin: 'manual' as const,
  createdBy: 'u1',
};

const toUrl = (url: string) => ({ kind: 'url' as const, url });

function create(
  from: string,
  to: Parameters<typeof Redirect.create>[0]['to'],
  status: 301 | 302 | 410 = 301,
) {
  return Redirect.create({ ...base, from, to, status });
}

describe('Redirect', () => {
  it('reads what was pasted as the old address, once', () => {
    const redirect = create(
      'https://old.test/2019/05/Old-Post/?utm=1',
      toUrl('/en/post'),
    );

    expect(redirect.source).toEqual({
      path: '/2019/05/old-post',
      query: 'utm=1',
    });
    expect(redirect.kind).toBe('exact');
    expect(redirect.target).toEqual({ kind: 'url', url: '/en/post' });
    expect(redirect.hits).toBe(0);
  });

  it('is a pattern when the address has a part that varies, and its target may use it', () => {
    const redirect = create('/:year/:month/:slug', toUrl('/en/blog/:slug'));

    expect(redirect.kind).toBe('pattern');
    expect(redirect.placeholders).toEqual([':year', ':month', ':slug']);
  });

  it('holds a page by its id and language', () => {
    const redirect = create('/old', {
      kind: 'page',
      pageGroupId: 'g1',
      locale: 'en',
    });

    expect(redirect.target).toEqual({
      kind: 'page',
      pageGroupId: 'g1',
      locale: 'en',
    });
    expect(redirect.needsATarget).toBe(false);
  });

  it('says it needs a target once the page it held is gone', () => {
    const redirect = Redirect.fromProps({
      ...create('/old', toUrl('/x')).toProps(),
      target: { kind: 'page', pageGroupId: null, locale: 'en' },
    });

    expect(redirect.needsATarget).toBe(true);
  });

  it('says an address is gone with no target at all', () => {
    const redirect = create('/old', null, 410);

    expect(redirect.status).toBe(410);
    expect(redirect.target).toBeNull();
  });

  it('forgets the target when it is changed to gone', () => {
    const redirect = create('/old', toUrl('/new'));

    redirect.redirectTo(toUrl('/ignored'), 410);

    expect(redirect.target).toBeNull();
    expect(redirect.status).toBe(410);
  });

  it.each([
    ['a source the site itself answers', '/api/forms', toUrl('/x'), 'source'],
    ['a front door with no question', '/', toUrl('/x'), 'source'],
    ['a target with nowhere to go', '/old', null, 'target'],
    ['a target that is not an address', '/old', toUrl('nowhere'), 'target'],
    [
      'a target that uses a part the source does not take',
      '/old',
      toUrl('/en/:slug'),
      'target',
    ],
    ['an address sent to itself', '/old', toUrl('/old'), 'target'],
    [
      'a page for a pattern',
      '/blog/:slug',
      { kind: 'page' as const, pageGroupId: 'g', locale: 'en' },
      'target',
    ],
  ] as const)('refuses %s', (_label, from, to, side) => {
    expect(() => create(from, to)).toThrowError(InvalidRedirectError);
    try {
      create(from, to);
    } catch (error) {
      expect((error as InvalidRedirectError).side).toBe(side);
    }
  });

  it('may send an address to the same path on another host: that is the move', () => {
    expect(() =>
      create('/about', toUrl('https://new-site.com/about')),
    ).not.toThrow();
  });

  it('keeps itself as it was when a new address does not suit its target', () => {
    const redirect = create('/old', {
      kind: 'page',
      pageGroupId: 'g',
      locale: 'en',
    });

    expect(() => redirect.changeSource('/blog/:slug')).toThrowError(
      InvalidRedirectError,
    );
    expect(redirect.source.path).toBe('/old');
    expect(redirect.kind).toBe('exact');
  });

  it('counts the visits it was told of, and when the last was', () => {
    const redirect = create('/old', toUrl('/new'));
    const at = new Date('2026-10-14T10:00:00Z');

    redirect.registerHits(3, at);
    redirect.registerHits(2, at);

    expect(redirect.hits).toBe(5);
    expect(redirect.lastHitAt).toEqual(at);
  });
});
