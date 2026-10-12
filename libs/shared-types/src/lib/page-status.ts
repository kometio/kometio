import { z } from 'zod';

/**
 * Where one translation of a page is in its draft/publish cycle — the one
 * list the domain, the wire and the `page_translation_status` enum read.
 */
export const PAGE_TRANSLATION_STATUSES = ['draft', 'published'] as const;

export const pageStatusSchema = z.enum(PAGE_TRANSLATION_STATUSES);

export type PageStatus = (typeof PAGE_TRANSLATION_STATUSES)[number];

/**
 * The three states a page is filtered by in a list: nothing of it is
 * online, it is online exactly as written, or it is online and the draft
 * has moved on. `PageStatus` has only the first two because "the draft has
 * moved on" is not a stored state — it is derived from timestamps
 * (`hasUnpublishedChanges` in @kometio/domain-core), which is why a list
 * filter has a word for it and the enum does not.
 */
export const PAGE_LIST_STATES = ['draft', 'published', 'pending'] as const;

export const pageListStateSchema = z.enum(PAGE_LIST_STATES);

export type PageListState = (typeof PAGE_LIST_STATES)[number];

/**
 * Which of the three a translation is in. A page that is not published has
 * nothing online to differ from, so "unpublished changes" is of a published
 * one only; the flag itself is the server's (`hasUnpublishedChanges` in
 * `@kometio/domain-core`), never re-derived on the client.
 */
export function pageListStateOf(page: {
  status: PageStatus;
  hasUnpublishedChanges: boolean;
}): PageListState {
  if (page.status !== 'published') return 'draft';
  return page.hasUnpublishedChanges ? 'pending' : 'published';
}
