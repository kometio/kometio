import type { PageStatus } from '@kometio/shared-types';

export interface PageStatusBadge {
  /** The word for the state, as the list and the activity feed both say it. */
  key:
    | 'pages.list.statusPublished'
    | 'pages.list.statusDraft'
    | 'pages.list.statusPendingShort';
  /** The badge's own variant: a state has a state colour, never the accent. */
  variant: 'secondary' | 'success' | 'warning';
}

/**
 * What a page's state is called and how it is drawn — one answer for every
 * place that shows it, so the same page cannot read "Published" in one list
 * and "Draft" in the next.
 *
 * A published page whose draft has moved on is neither of the two plain
 * states. It is the one that costs somebody something — what is online is
 * not what they last wrote — so it gets its own word and its own colour.
 * A draft has nothing "unpublished" about it: there is nothing online to
 * differ from.
 *
 * The SHORT wording: `statusPending` reads "Published, with unpublished
 * changes", which is right for a tooltip and, in a column, truncated to
 * "Published, with unpublis…".
 */
export function pageStatusBadge(
  status: PageStatus,
  hasUnpublishedChanges: boolean,
): PageStatusBadge {
  if (status !== 'published') {
    return { key: 'pages.list.statusDraft', variant: 'secondary' };
  }
  return hasUnpublishedChanges
    ? { key: 'pages.list.statusPendingShort', variant: 'warning' }
    : { key: 'pages.list.statusPublished', variant: 'success' };
}
