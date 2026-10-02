import { describe, expect, it } from 'vitest';
import type { IconEntry } from '@kometio/shared-types';
import { selectIcons } from './select-icons';

const icons: IconEntry[] = [
  { name: 'brand:github', svg: '<svg/>' },
  { name: 'brand:gitlab', svg: '<svg/>' },
  { name: 'brand:x', svg: '<svg/>' },
  { name: 'brand:youtube', svg: '<svg/>' },
];

describe('selectIcons', () => {
  it('returns the whole set when asked for nothing in particular', () => {
    expect(selectIcons(icons, {})).toHaveLength(4);
  });

  it('keeps only the names containing what was typed, ignoring case', () => {
    expect(selectIcons(icons, { search: 'GIT' }).map((i) => i.name)).toEqual([
      'brand:github',
      'brand:gitlab',
    ]);
  });

  /*
   * The point of the whole change: a search box never pulls a set whole.
   */
  it('never returns more than the limit', () => {
    expect(selectIcons(icons, { limit: 2 })).toHaveLength(2);
  });

  it('answers exact names for a preview, whatever the search says', () => {
    expect(
      selectIcons(icons, { names: ['brand:x'], search: 'git' }).map(
        (i) => i.name,
      ),
    ).toEqual(['brand:x']);
  });
});
