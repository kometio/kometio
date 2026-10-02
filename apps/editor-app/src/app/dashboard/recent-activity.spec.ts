import { describe, expect, it } from 'vitest';
import { mergeActivity } from './recent-activity';

function page(id: string, updatedAt: string) {
  return {
    pageGroupId: `group-${id}`,
    pageTranslationId: id,
    locale: 'it',
    title: `Pagina ${id}`,
    slug: id,
    status: 'published' as const,
    hasUnpublishedChanges: false,
    updatedAt,
  };
}

function submission(formId: string, receivedAt: string) {
  return { formId, formName: `Modulo ${formId}`, receivedAt };
}

describe('mergeActivity', () => {
  it('puts pages and submissions in one feed, the newest first', () => {
    const feed = mergeActivity(
      {
        recentActivity: [
          page('a', '2026-09-28T10:00:00Z'),
          page('b', '2026-09-30T08:00:00Z'),
        ],
        forms: {
          totalCount: 1,
          recentCount: 1,
          recent: [submission('f1', '2026-09-29T09:00:00Z')],
        },
      },
      8,
    );

    expect(feed.map((entry) => [entry.kind, entry.at])).toEqual([
      ['page', '2026-09-30T08:00:00Z'],
      ['submissions', '2026-09-29T09:00:00Z'],
      ['page', '2026-09-28T10:00:00Z'],
    ]);
  });

  it('keeps only the newest ones when there are more than the limit', () => {
    const feed = mergeActivity(
      {
        recentActivity: [page('a', '2026-09-01T00:00:00Z')],
        forms: {
          totalCount: 3,
          recentCount: 3,
          recent: [
            submission('f1', '2026-09-03T00:00:00Z'),
            submission('f2', '2026-09-04T00:00:00Z'),
            submission('f3', '2026-09-05T00:00:00Z'),
          ],
        },
      },
      2,
    );

    expect(feed.map((entry) => entry.at)).toEqual([
      '2026-09-05T00:00:00Z',
      '2026-09-04T00:00:00Z',
    ]);
  });

  /*
   * Twelve answers to the contact form in a morning were twelve rows and
   * pushed every page off a feed of eight. They are one row: the form, and
   * how many came in that day.
   */
  it('makes the answers one form received in a day one row, with how many', () => {
    const feed = mergeActivity(
      {
        recentActivity: [],
        forms: {
          totalCount: 3,
          recentCount: 3,
          recent: [
            submission('f1', '2026-09-04T15:00:00'),
            submission('f1', '2026-09-04T09:00:00'),
            submission('f1', '2026-09-04T11:30:00'),
          ],
        },
      },
      8,
    );

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: 'submissions',
      formId: 'f1',
      formName: 'Modulo f1',
      count: 3,
      // When the newest came in.
      at: '2026-09-04T15:00:00',
    });
  });

  it('keeps two forms apart, and two days of one form apart', () => {
    const feed = mergeActivity(
      {
        recentActivity: [],
        forms: {
          totalCount: 4,
          recentCount: 4,
          recent: [
            submission('f1', '2026-09-04T10:00:00'),
            submission('f2', '2026-09-04T10:00:00'),
            submission('f1', '2026-09-03T10:00:00'),
            submission('f1', '2026-09-03T18:00:00'),
          ],
        },
      },
      8,
    );

    expect(
      feed
        .map((entry) => (entry.kind === 'submissions' ? entry.count : 0))
        .sort(),
    ).toEqual([1, 1, 2]);
    expect(new Set(feed.map((entry) => entry.key)).size).toBe(3);
  });

  it('is empty when nothing has happened', () => {
    expect(
      mergeActivity(
        {
          recentActivity: [],
          forms: { totalCount: 0, recentCount: 0, recent: [] },
        },
        8,
      ),
    ).toEqual([]);
  });
});
