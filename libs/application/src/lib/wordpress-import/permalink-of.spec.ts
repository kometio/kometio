import { describe, expect, it } from 'vitest';
import type { WordPressExportItem } from '@kometio/ports';
import { permalinkOf } from './permalink-of';

function item(
  overrides: Partial<WordPressExportItem> = {},
): WordPressExportItem {
  return {
    postId: 42,
    postType: 'post',
    status: 'publish',
    title: 'Hello world',
    slug: 'hello-world',
    parentId: 0,
    menuOrder: 0,
    link: 'https://old.example/2019/05/hello-world/',
    content: '',
    excerpt: '',
    metaKeys: [],
    metaValues: {},
    terms: [],
    attachmentUrl: '',
    ...overrides,
  };
}

describe('permalinkOf', () => {
  it('keeps where a published post lived', () => {
    expect(permalinkOf(item())).toEqual({
      id: 42,
      type: 'post',
      slug: 'hello-world',
      title: 'Hello world',
      link: 'https://old.example/2019/05/hello-world/',
      parentId: null,
    });
  });

  it('keeps the parent of a page, and says a top-level one has none', () => {
    expect(permalinkOf(item({ postType: 'page', parentId: 7 }))?.parentId).toBe(
      7,
    );
    expect(
      permalinkOf(item({ postType: 'page', parentId: 0 }))?.parentId,
    ).toBeNull();
  });

  it.each([
    ['a draft', { status: 'draft' }],
    ['a private page', { status: 'private' }],
    ['one in the bin', { status: 'trash' }],
    ['an attachment', { postType: 'attachment' }],
    ['a menu entry', { postType: 'nav_menu_item' }],
    ['a product of a plugin', { postType: 'product' }],
    ['one with no number', { postId: null }],
    ['one that was never given an address', { link: '' }],
    ['one with no slug', { slug: '' }],
  ] as const)(
    'keeps nothing of %s: nobody asks for its address',
    (_label, override) => {
      expect(permalinkOf(item(override))).toBeNull();
    },
  );

  it('keeps a title to a length a list can show', () => {
    const long = 'x'.repeat(500);

    expect(permalinkOf(item({ title: long }))?.title).toHaveLength(120);
  });

  it('names an untitled one by its slug', () => {
    expect(permalinkOf(item({ title: '' }))?.title).toBe('hello-world');
  });
});
