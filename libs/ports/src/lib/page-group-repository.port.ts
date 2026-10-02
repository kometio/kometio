import type {
  PageGroup,
  PageGroupVersion,
  PageTranslation,
  PageTranslationStatus,
} from '@kometio/domain-core';
import type { PageContent, PageListState } from '@kometio/shared-types';
import type { Pagination, PaginatedResult } from './pagination';

/**
 * A list projection — the same reason as PageSummary (security review
 * 2026-08-24): never ship `content` (the whole block tree) for a list row.
 * No `createdByName` or language-availability badge here: that richer
 * projection is phase 4's job (rebuilding the pages list), which will
 * extend this port when it arrives — keeping it minimal now avoids
 * designing a shape in advance that might change.
 */
export interface PageGroupSummary {
  id: string;
  tenantId: string;
  siteId: string;
  parentId: string | null;
  order: number;
  /** Which section of the editor lists it (docs/adr/0015) — also what scopes "the previous article" to the right set of pages. */
  collectionId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One PageTranslation, projected down to exactly what a list row's locale badge (and title) needs — see PageGroupListItem. */
export interface PageGroupListItemTranslation {
  locale: string;
  slug: string;
  /** seoMeta.title — the row's own display title comes from whichever translation matches the site's default locale (see PageGroupsListView's groupDisplayTitle). */
  title: string;
  status: PageTranslationStatus;
  isDiverged: boolean;
  /** Published, but the draft has moved on since — see hasUnpublishedChanges in @kometio/domain-core, which is where the rule lives. */
  hasUnpublishedChanges: boolean;
}

/**
 * Fase 4's richer list projection (see PageGroupSummary's own doc comment,
 * which named this exact extension point) — one row per PageGroup, with
 * `createdByName` resolved server-side (same reasoning as PageSummary,
 * security review 2026-08-24: never make the client resolve a raw user
 * id) and every locale's translation summarized for the row's
 * availability badges (published/draft/diverged/missing).
 */
export interface PageGroupListItem {
  id: string;
  tenantId: string;
  siteId: string;
  parentId: string | null;
  order: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  collectionId: string | null;
  /**
   * The last change to this page in ANY language, and who made it.
   *
   * Not the group row's own `updatedAt`: the shared structure is only
   * half of a page, and someone rewriting the Italian text would
   * otherwise leave a list that still reads "last changed three weeks
   * ago".
   */
  lastEditedAt: Date;
  lastEditedByName: string | null;
  /**
   * How many pages hang directly under this one, whatever the list is
   * filtered to: deleting the page moves them to the top level, and the
   * question before it has to be able to say so even when they are not on
   * screen.
   */
  childCount: number;
  translations: PageGroupListItemTranslation[];
}

/** All optional — an absent filter means "don't filter on this dimension." */
export interface PageGroupListFilters {
  /** Case-insensitive substring match against any of the group's translations' seoMeta.title. */
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  createdBy?: string;
  /** Groups that have a translation (any status) in this locale. */
  locale?: string;
  /**
   * Which section of the editor is asking.
   *
   * `undefined` means "do not filter on this" and is what the sitemap or
   * a nav tree wants; `null` means the Pages screen, which shows the
   * pages that belong to no section; an id means that section's own
   * screen. The three are genuinely different questions, which is why
   * `null` is a value here and not an omission.
   */
  collectionId?: string | null;
  /**
   * Leaves out this page and everything under it, at any depth.
   *
   * Answered here and not by the caller because the caller cannot: a
   * filtered or paginated list holds a handful of pages, and a
   * descendant three levels down arrives in it without any of its
   * ancestors, so there is no tree to walk client-side. The database has
   * the whole tree.
   *
   * What it is for: a page cannot move inside its own child (ADR-0074),
   * and the API refuses a ring anyway — this keeps the choice from being
   * offered, which is a different thing from catching it afterwards.
   */
  excludeSubtreeOf?: string;
  /**
   * Only the pages in this state, as the row itself shows it.
   *
   * A page has a state per language and the row shows one: the site's
   * default language if the page has it, and otherwise the first language
   * by code. The filter judges the same one, so a page never appears under
   * "Draft" with a "Published" badge on it — and that is why the default
   * language comes with it: the repository cannot know which language the
   * row will show.
   */
  status?: PageGroupStatusFilter;
}

export interface PageGroupStatusFilter {
  state: PageListState;
  /** The site's default language: the one the row is read from when the page has it. */
  defaultLocale: string;
}

/**
 * How a list of pages comes back.
 *
 * `tree` is the site's own order — the position among siblings an author
 * dragged them into. `newest` is a feed: most recently published first,
 * with what has never been published at the top, because in an editor an
 * unpublished draft is the row that wants attention.
 *
 * An argument of its own rather than something inferred from the
 * filters: "a section is a feed" is a product rule, and a repository
 * that guesses the order from which filter happens to be set is a
 * repository nobody can call deliberately.
 */
export type PageGroupListSort = 'tree' | 'newest';

/**
 * Owns the SHARED structure and the position in the hierarchy — it takes
 * the place of the old Page's "structure" half (see
 * PageTranslationRepositoryPort for the "per-locale text" half). The same
 * explicit tenantId scoping discipline as PageRepositoryPort.
 */
export interface PageGroupRepositoryPort {
  /*
   * Writes are named for what changed, and each writes only its own
   * columns (M1 of the 2026-09-29 audit): a page used to be written whole
   * from whatever was read a moment before, so a publish, a reorder or a
   * move could undo a save that landed in between, and a page deleted
   * while a save was on its way came back. Changing an existing page never
   * re-creates it: a page gone is `PageGroupNotFoundError`.
   */

  /** A new page and its first structure version, in ONE transaction: never a structure without its version row. */
  addWithVersion(group: PageGroup, version: PageGroupVersion): Promise<void>;
  /**
   * A page that did not exist yet: the group, its first structure version
   * and its first language, in ONE transaction (docs/adr/0072).
   *
   * Written apart, a language refused for its address left the group
   * behind — a page with no language, listed with no title, that the
   * editor could not even open. Throws `PageSlugAlreadyExistsError` when
   * the address was taken in the meantime, having written nothing.
   */
  addWithTranslation(
    group: PageGroup,
    version: PageGroupVersion,
    translation: PageTranslation,
  ): Promise<void>;
  /** The block tree and its new version, in ONE transaction. */
  saveContent(group: PageGroup, version: PageGroupVersion): Promise<void>;
  /**
   * A page that changed its place in the tree: its parent and position,
   * and every one of its languages' copy of the parent and the address
   * each leaves behind, in ONE transaction (docs/adr/0074).
   *
   * Both halves or neither: a group moved without its languages would hang
   * in two places at once. Throws `PageSlugAlreadyExistsError` when the
   * destination already has a page at that address in some language,
   * having written nothing.
   */
  move(group: PageGroup, translations: PageTranslation[]): Promise<void>;
  moveToCollection(group: PageGroup): Promise<void>;
  /** The position of every sibling under one parent, in ONE statement. */
  reorderSiblings(input: {
    tenantId: string;
    siteId: string;
    parentId: string | null;
    orderedIds: readonly string[];
    by: string | null;
    at: Date;
  }): Promise<void>;
  findById(tenantId: string, pageGroupId: string): Promise<PageGroup | null>;
  /** How many pages hang directly under this one. */
  countChildren(tenantId: string, pageGroupId: string): Promise<number>;
  listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<PageGroupSummary>>;
  /** Fase 4's pages-list view — filtered + the richer PageGroupListItem projection, distinct from listBySite (still used unfiltered by the sitemap/nav-tree use-cases). */
  listBySiteFiltered(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
    filters: PageGroupListFilters,
    sort?: PageGroupListSort,
  ): Promise<PaginatedResult<PageGroupListItem>>;
  /**
   * Every page group's canonical content on one site (docs/adr/0059).
   *
   * It answers one question: how many pages is this reusable section
   * placed on. `listBySite` returns summaries with no content, and asking
   * it then reading each group back one by one would be a query per page
   * for a number shown next to a name.
   *
   * The GROUP's content and not the published snapshots: what an author
   * wants to know before renaming or deleting a section is where it is
   * placed, which includes a page whose draft has it and has not been
   * published yet.
   */
  listContentBySite(
    tenantId: string,
    siteId: string,
  ): Promise<{ id: string; content: PageContent }[]>;
  /** Siblings in the SHARED hierarchy — it replaces PageRepositoryPort.listSiblings, now with no need for a `locale` parameter (a position in the tree is no longer per-locale). */
  listSiblings(
    tenantId: string,
    siteId: string,
    parentId: string | null,
  ): Promise<PageGroupSummary[]>;
  /** Deletes the group AND every one of its PageTranslations (ON DELETE CASCADE, see schema.ts) — a group with no translations has no reason to exist. */
  delete(tenantId: string, pageGroupId: string): Promise<void>;
}
