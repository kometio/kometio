import type { DashboardStatsDto } from '../../lib/dashboard-api-client';

/** What the dashboard's feed shows: a page somebody edited, or the answers a form received in one day. */
export type ActivityEntry =
  | {
      kind: 'page';
      key: string;
      at: string;
      page: DashboardStatsDto['recentActivity'][number];
    }
  | {
      kind: 'submissions';
      key: string;
      /** When the newest of them came in. */
      at: string;
      formId: string;
      formName: string;
      count: number;
    };

/**
 * The answers of one form, one row per day.
 *
 * Twelve answers to the contact form in a morning were twelve rows, each
 * saying "new answer" under the same name, and pushed every page somebody
 * had edited off a feed of eight. "Contact · 12 new answers" is what the
 * twelve amount to, and the row still goes where they are.
 *
 * A day is the reader's own: what came in at 23:50 and at 00:10 is two
 * days to the person who saw them arrive.
 */
function groupSubmissions(
  recent: DashboardStatsDto['forms']['recent'],
): ActivityEntry[] {
  const groups = new Map<
    string,
    Extract<ActivityEntry, { kind: 'submissions' }>
  >();
  for (const { formId, formName, receivedAt } of recent) {
    const key = `submissions-${formId}-${new Date(receivedAt).toDateString()}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        kind: 'submissions',
        key,
        at: receivedAt,
        formId,
        formName,
        count: 1,
      });
      continue;
    }
    group.count += 1;
    if (new Date(receivedAt) > new Date(group.at)) group.at = receivedAt;
  }
  return [...groups.values()];
}

/**
 * Pages and form answers as one feed, the newest first.
 *
 * They arrive as two lists because they are two things on the server, but
 * "what happened on my site" is one question: a person who has just had a
 * message sent through the contact form wants to see it next to the page
 * they edited an hour ago, not in a card of its own further down.
 */
export function mergeActivity(
  stats: Pick<DashboardStatsDto, 'recentActivity' | 'forms'>,
  limit: number,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...stats.recentActivity.map((page): ActivityEntry => ({
      kind: 'page',
      key: `page-${page.pageTranslationId}`,
      at: page.updatedAt,
      page,
    })),
    ...groupSubmissions(stats.forms.recent),
  ];
  return entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
