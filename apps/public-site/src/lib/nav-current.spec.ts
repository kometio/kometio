import { describe, expect, it } from 'vitest';
import { navCurrent } from './nav-current';

const at = (path: string) => new URL(`https://example.test${path}`);

describe('navCurrent', () => {
  it('says "page" for the entry that is the page being read', () => {
    expect(navCurrent('/it/progetti', at('/it/progetti'))).toBe('page');
  });

  it('does not mind a trailing slash, a query or a fragment on either side', () => {
    expect(navCurrent('/it/progetti/', at('/it/progetti'))).toBe('page');
    expect(navCurrent('/it/progetti', at('/it/progetti/'))).toBe('page');
    expect(navCurrent('/it/progetti?page=2#x', at('/it/progetti'))).toBe(
      'page',
    );
  });

  it('says "location" for the entry whose section the page is in', () => {
    expect(navCurrent('/it/progetti', at('/it/progetti/una-libreria'))).toBe(
      'location',
    );
  });

  it('does not take the root of a language for a section of everything', () => {
    expect(navCurrent('/it', at('/it/progetti/una-libreria'))).toBeNull();
    expect(navCurrent('/it/', at('/it/chi-sono'))).toBeNull();
  });

  it('is the page on the language root itself', () => {
    expect(navCurrent('/it/', at('/it'))).toBe('page');
  });

  it('does not take a sibling whose name starts the same for its section', () => {
    expect(navCurrent('/it/prog', at('/it/progetti'))).toBeNull();
  });

  it('is nothing for another site, a mail address, or an entry that points nowhere', () => {
    expect(
      navCurrent('https://altro.test/it/progetti', at('/it/progetti')),
    ).toBe(null);
    expect(
      navCurrent('mailto:ciao@example.test', at('/it/progetti')),
    ).toBeNull();
    expect(navCurrent(null, at('/it/progetti'))).toBeNull();
    expect(navCurrent(undefined, at('/it'))).toBeNull();
  });

  it('is the page for the same address written out in full', () => {
    expect(
      navCurrent('https://example.test/it/progetti', at('/it/progetti')),
    ).toBe('page');
  });
});
