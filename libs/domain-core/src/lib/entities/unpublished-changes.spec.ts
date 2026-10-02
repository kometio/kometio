import { describe, expect, it } from 'vitest';
import { hasUnpublishedChanges } from './unpublished-changes';

const JANUARY = new Date('2026-01-01T00:00:00Z');
const MARCH = new Date('2026-03-01T00:00:00Z');

const published = {
  status: 'published' as const,
  isDiverged: false,
  contentUpdatedAt: JANUARY,
  publishedAt: JANUARY,
  groupContentUpdatedAt: JANUARY,
};

describe('hasUnpublishedChanges', () => {
  it('says no for a page that has never been published', () => {
    expect(
      hasUnpublishedChanges({
        ...published,
        status: 'draft',
        publishedAt: null,
        contentUpdatedAt: MARCH,
      }),
    ).toBe(false);
  });

  it('says no right after a publish, when the two clocks read the same', () => {
    expect(hasUnpublishedChanges(published)).toBe(false);
  });

  it('says yes when this language was edited after it went live', () => {
    expect(
      hasUnpublishedChanges({ ...published, contentUpdatedAt: MARCH }),
    ).toBe(true);
  });

  it('says yes when the SHARED structure changed after this language went live', () => {
    expect(
      hasUnpublishedChanges({ ...published, groupContentUpdatedAt: MARCH }),
    ).toBe(true);
  });

  it('ignores the shared structure once a language is unlinked — it no longer receives it', () => {
    expect(
      hasUnpublishedChanges({
        ...published,
        isDiverged: true,
        groupContentUpdatedAt: MARCH,
      }),
    ).toBe(false);
  });

  /*
   * The reason `contentUpdatedAt` exists next to `updatedAt`: renaming a
   * page, editing its SEO or moving it in the tree all take effect live.
   * Counting them would raise a "publish me" flag nobody could clear.
   */
  it('stays quiet for changes that are already live, which never move the content clock', () => {
    expect(hasUnpublishedChanges({ ...published })).toBe(false);
  });
});
