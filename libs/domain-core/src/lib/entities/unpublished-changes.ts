import type { PageTranslationStatus } from './page-translation';

/** Everything the question below needs, and nothing else — the caller may be a repository projection that never builds the entities. */
export interface PublishedContentState {
  status: PageTranslationStatus;
  /** An unlinked translation no longer receives the group's structural changes, so the group's clock stops counting against it. */
  isDiverged: boolean;
  contentUpdatedAt: Date;
  publishedAt: Date | null;
  /** The PageGroup's own `contentUpdatedAt` — the shared structure this language renders while it stays linked. */
  groupContentUpdatedAt: Date;
}

/**
 * Whether what is online is behind what the editor sees.
 *
 * The single definition of it, so the list and anything asking later
 * cannot answer differently. Timestamps rather than a comparison of the
 * content itself: the draft a reader would get is a merge of the group's
 * structure with this language's overlay, computed in code, so an exact
 * answer would mean reading every page's full content on what is
 * supposed to be a cheap list query.
 *
 * That trade is why `contentUpdatedAt` exists separately from
 * `updatedAt` on both sides — renaming a page, editing its SEO or moving
 * it in the tree all take effect live, and must not raise a "publish me"
 * flag nobody can clear.
 */
export function hasUnpublishedChanges(state: PublishedContentState): boolean {
  if (state.status !== 'published' || !state.publishedAt) return false;
  const published = state.publishedAt.getTime();
  if (state.contentUpdatedAt.getTime() > published) return true;
  return !state.isDiverged && state.groupContentUpdatedAt.getTime() > published;
}
