import { describe, expect, it } from 'vitest';
import {
  compileRedirectMatcher,
  describeRedirectSource,
  fillRedirectTarget,
  isKnownProbe,
  parseRedirectSource,
  parseRedirectTarget,
  readRequestedAddress,
  redirectLocation,
  redirectQueryPairs,
  redirectTargetPlaceholders,
  type MatchableRedirect,
} from './redirect-rules';

function source(input: string) {
  const parsed = parseRedirectSource(input);
  if (!parsed.ok) throw new Error(`not a source: ${input} (${parsed.problem})`);
  return parsed;
}

let sequence = 0;
function rule(input: string): MatchableRedirect {
  const parsed = source(input);
  sequence += 1;
  return {
    id: `rule-${sequence}`,
    source: parsed.source,
    kind: parsed.kind,
    createdAt: new Date(2026, 0, sequence),
  };
}

const asked = (url: string) => {
  const parsed = new URL(url, 'https://site.test');
  return readRequestedAddress(parsed.pathname, parsed.search);
};

describe('parseRedirectSource', () => {
  it('reads a path as it is, in lower case, without its trailing slash', () => {
    expect(source('/2019/05/Old-Post/').source).toEqual({
      path: '/2019/05/old-post',
      query: '',
    });
    expect(source('/2019/05/Old-Post/').kind).toBe('exact');
  });

  it('reads a whole pasted link: the host, the scheme and the fragment are not part of the address', () => {
    expect(
      source('https://old-site.com/blog/post?utm_source=x#comments').source,
    ).toEqual({ path: '/blog/post', query: 'utm_source=x' });
    expect(source('http://www.old-site.com/about/').source.path).toBe('/about');
  });

  it('reads a link copied without its scheme, and keeps a bare file name a path', () => {
    expect(source('old-site.com/about').source.path).toBe('/about');
    expect(source('www.old-site.com/about').source.path).toBe('/about');
    // `about.html` is a file, and `old-site.com` alone is not an address.
    expect(source('about.html').source.path).toBe('/about.html');
  });

  it('reads a path with no leading slash', () => {
    expect(source('old-page').source.path).toBe('/old-page');
  });

  it('does not count index.php or index.html as part of the address', () => {
    expect(source('/index.php/2019/05/post').source.path).toBe('/2019/05/post');
    expect(source('/blog/index.html').source.path).toBe('/blog');
    expect(source('/index.php?p=123').source).toEqual({
      path: '/',
      query: 'p=123',
    });
  });

  it('reads a query alone: `?p=123` is the front door with a question', () => {
    expect(source('?p=123').source).toEqual({ path: '/', query: 'p=123' });
    expect(source('/?page_id=45').source).toEqual({
      path: '/',
      query: 'page_id=45',
    });
  });

  it('keeps the query canonical: sorted, so that its order is not a second rule', () => {
    expect(source('/x?b=2&a=1').source.query).toBe('a=1&b=2');
    expect(source('/x?a=1&b=2').source.query).toBe('a=1&b=2');
  });

  it('decodes a path per segment, and keeps an encoded slash inside its segment', () => {
    expect(source('/citt%C3%A0').source.path).toBe('/città');
    expect(source('/a%2Fb/c').source.path).toBe('/a%2fb/c');
  });

  it('recognises a pattern, and names what it takes', () => {
    const parsed = source('/:year/:month/:slug');
    expect(parsed.kind).toBe('pattern');
    expect(parsed.placeholders).toEqual([':year', ':month', ':slug']);
    expect(source('/category/*').placeholders).toEqual(['*']);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['/', 'root-without-query'],
    ['https://old-site.com', 'root-without-query'],
    ['/api/forms/1/submit', 'reserved'],
    ['/robots.txt', 'reserved'],
    ['/_astro/chunk.js', 'reserved'],
    ['/post-:id', 'bad-pattern'],
    ['/blog/*/more', 'bad-pattern'],
    ['/:Bad-Name', 'bad-pattern'],
    ['/:slug/:slug', 'bad-pattern'],
    ['/:slug?x=1', 'pattern-with-query'],
    ['/a?1=1&2=2&3=3&4=4&5=5&6=6', 'too-many-query-pairs'],
    ['/a/b/c/d/e/f/g/h/i/j/k/l/m', 'too-deep'],
  ])('refuses %j as %s', (input, problem) => {
    const parsed = parseRedirectSource(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem).toBe(problem);
  });

  it('refuses an address too long to be one', () => {
    const parsed = parseRedirectSource(`/${'a'.repeat(3000)}`);
    expect(parsed).toMatchObject({ ok: false, problem: 'too-long' });
  });
});

describe('the matcher', () => {
  it('finds an exact path, whatever the case, the slash or the host asked with', () => {
    const matcher = compileRedirectMatcher([rule('/2019/05/old-post')]);

    expect(matcher.match(asked('/2019/05/Old-Post/'))).not.toBeNull();
    expect(matcher.match(asked('/index.php/2019/05/old-post'))).not.toBeNull();
    expect(matcher.match(asked('/2019/05/other'))).toBeNull();
  });

  it('keeps the query a request carries beside the one a rule asks for', () => {
    const matcher = compileRedirectMatcher([rule('/?p=123')]);

    expect(matcher.match(asked('/?p=123'))).not.toBeNull();
    expect(matcher.match(asked('/?p=123&utm_source=mail'))).not.toBeNull();
    expect(matcher.match(asked('/?p=124'))).toBeNull();
    expect(matcher.match(asked('/'))).toBeNull();
  });

  it('says which keys a rule consumed, so that the rest can be carried on', () => {
    const matcher = compileRedirectMatcher([rule('/?p=123')]);

    expect(
      matcher.match(asked('/?p=123&utm_source=mail'))?.matchedQueryKeys,
    ).toEqual(['p']);
  });

  it('prefers the rule that asks for more of the query', () => {
    const general = rule('/shop?cat=1');
    const specific = rule('/shop?cat=1&color=red');
    const matcher = compileRedirectMatcher([general, specific]);

    expect(matcher.match(asked('/shop?cat=1&color=red'))?.rule).toBe(specific);
    expect(matcher.match(asked('/shop?cat=1&color=blue'))?.rule).toBe(general);
  });

  it('takes what a pattern names', () => {
    const matcher = compileRedirectMatcher([rule('/:year/:month/:slug')]);

    const match = matcher.match(asked('/2019/05/My-Post/'));

    expect(match?.captures).toEqual({
      year: '2019',
      month: '05',
      slug: 'my-post',
    });
    expect(matcher.match(asked('/2019/05'))).toBeNull();
    expect(matcher.match(asked('/2019/05/a/b'))).toBeNull();
  });

  it('takes the rest of the path with a *, and needs at least one segment for it', () => {
    const matcher = compileRedirectMatcher([rule('/category/*')]);

    expect(matcher.match(asked('/category/news/2019'))?.splat).toBe(
      'news/2019',
    );
    expect(matcher.match(asked('/category'))).toBeNull();
  });

  it('answers an exact rule before a pattern that would also match', () => {
    const exact = rule('/2019/05/special');
    const pattern = rule('/:year/:month/:slug');
    const matcher = compileRedirectMatcher([pattern, exact]);

    expect(matcher.match(asked('/2019/05/special'))?.rule).toBe(exact);
    expect(matcher.match(asked('/2019/05/other'))?.rule).toBe(pattern);
  });

  it('answers the more specific pattern first, then the older one', () => {
    const broad = rule('/blog/*');
    const narrow = rule('/blog/:slug');
    const literal = rule('/blog/archive/:year');
    const matcher = compileRedirectMatcher([broad, narrow, literal]);

    expect(matcher.match(asked('/blog/archive/2019'))?.rule).toBe(literal);
    expect(matcher.match(asked('/blog/post'))?.rule).toBe(narrow);
    expect(matcher.match(asked('/blog/a/b/c'))?.rule).toBe(broad);
  });

  it('answers the older of two patterns that are as specific as each other', () => {
    const first = rule('/:a/x');
    const second = rule('/:b/x');
    const matcher = compileRedirectMatcher([second, first]);

    expect(matcher.match(asked('/q/x'))?.rule).toBe(first);
  });
});

describe('a target', () => {
  it('is a path of this site or an address', () => {
    expect(parseRedirectTarget('/en/blog/post')).toEqual({
      ok: true,
      location: '/en/blog/post',
      isAbsolute: false,
    });
    expect(parseRedirectTarget('https://new-site.com/page')).toMatchObject({
      ok: true,
      isAbsolute: true,
    });
  });

  it('reads an address copied without its scheme as https', () => {
    expect(parseRedirectTarget('new-site.com/page')).toMatchObject({
      ok: true,
      location: 'https://new-site.com/page',
    });
  });

  it.each([
    ['', 'empty'],
    ['javascript:alert(1)', 'unsafe'],
    ['data:text/html,x', 'unsafe'],
    ['//evil.example/path', 'unsafe'],
    ['/path with space', 'unsafe'],
    // A backslash is a slash to a browser: `//evil.example`, behind a path.
    ['/\\evil.example', 'unsafe'],
    ['/a\\b', 'unsafe'],
    ['/a\r\nSet-Cookie: x=1', 'unsafe'],
    ['https://user:pass@host.test/', 'unsafe'],
    ['page', 'invalid'],
    ['about.html', 'invalid'],
  ])('refuses %j as %s', (input, problem) => {
    const parsed = parseRedirectTarget(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem).toBe(problem);
  });

  it('may use what its source takes, and nothing else', () => {
    expect(parseRedirectTarget('/en/blog/:slug', [':slug']).ok).toBe(true);
    expect(parseRedirectTarget('/en/:category/*', [':category', '*']).ok).toBe(
      true,
    );
    expect(parseRedirectTarget('/en/blog/:slug', [':id'])).toMatchObject({
      ok: false,
      problem: 'unknown-placeholder',
      detail: ':slug',
    });
    expect(parseRedirectTarget('/en/blog/:slug', [])).toMatchObject({
      ok: false,
      problem: 'unknown-placeholder',
    });
  });

  it('lists what it writes out', () => {
    expect(redirectTargetPlaceholders('/en/:a/b/:c?x=:d')).toEqual([
      ':a',
      ':c',
    ]);
    expect(redirectTargetPlaceholders('https://x.test/*')).toEqual(['*']);
    expect(redirectTargetPlaceholders('/en/plain')).toEqual([]);
  });

  it('is filled with what the source took, encoded', () => {
    expect(
      fillRedirectTarget('/en/blog/:slug', {
        captures: { slug: 'my-post' },
        splat: null,
      }),
    ).toBe('/en/blog/my-post');
    expect(
      fillRedirectTarget('https://new.test/archive/*', {
        captures: {},
        splat: 'news/2019',
      }),
    ).toBe('https://new.test/archive/news/2019');
    expect(
      fillRedirectTarget('/en/:slug', {
        captures: { slug: 'a b/c' },
        splat: null,
      }),
    ).toBe('/en/a%20b%2Fc');
  });

  it('keeps the request query it was not asked by', () => {
    expect(redirectLocation('/en/post', '?p=1&utm_source=mail', ['p'])).toBe(
      '/en/post?utm_source=mail',
    );
    expect(redirectLocation('/en/post', '?p=1', ['p'])).toBe('/en/post');
    expect(redirectLocation('/en/post', '?utm_source=mail', [])).toBe(
      '/en/post?utm_source=mail',
    );
  });

  it('keeps its own query or anchor and does not add the request one', () => {
    expect(redirectLocation('/en/post#intro', '?utm_source=mail', [])).toBe(
      '/en/post#intro',
    );
  });
});

describe('small things', () => {
  it('reads a canonical query back into pairs', () => {
    expect(redirectQueryPairs('a=1&b=x%20y')).toEqual([
      ['a', '1'],
      ['b', 'x y'],
    ]);
    expect(redirectQueryPairs('')).toEqual([]);
  });

  it('writes a source as a person would read it', () => {
    expect(describeRedirectSource({ path: '/', query: 'p=1' })).toBe('/?p=1');
    expect(describeRedirectSource({ path: '/old', query: '' })).toBe('/old');
  });

  it('knows the addresses that only bots ask for', () => {
    expect(isKnownProbe('/wp-login.php')).toBe(true);
    expect(isKnownProbe('/.env')).toBe(true);
    expect(isKnownProbe('/wp-admin/admin-ajax.php')).toBe(true);
    // An old media file is a thing worth a redirect.
    expect(isKnownProbe('/wp-content/uploads/2019/05/photo.jpg')).toBe(false);
    expect(isKnownProbe('/about')).toBe(false);
  });
});
