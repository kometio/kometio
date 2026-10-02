import type {
  PageTranslation,
  PageTranslationVersion,
} from '@kometio/domain-core';

/**
 * Owns the per-locale text: the overlay of translatable fields, the slug,
 * the SEO metadata and the publication status. It takes the place of the
 * "per-locale" half of the old `Page` — see `PageGroupRepositoryPort` for
 * the "shared structure" half — and keeps the same discipline every
 * repository port here follows: `tenantId` is always an explicit
 * parameter, never read from ambient state.
 */
export interface PageTranslationRepositoryPort {
  /*
   * Writes are named for what changed, and each writes only its own
   * columns — content, publication, SEO, address — so two changes landing
   * together do not undo each other (M1 of the 2026-09-29 audit). Changing
   * an existing translation never re-creates it: one gone is
   * `PageTranslationNotFoundError`. Its place in the tree is written with
   * its page (`PageGroupRepositoryPort.move`).
   */

  /**
   * A new language of a page. `parentGroupId` is the page's CURRENT
   * `PageGroup.parentId`, denormalized onto the row (see schema.ts) for the
   * sibling-scoped slug uniqueness constraint; from then on only
   * `PageGroupRepositoryPort.move` changes it.
   */
  add(
    translation: PageTranslation,
    parentGroupId: string | null,
  ): Promise<void>;
  /**
   * The text — field values, the diverged tree, whether there is one — and
   * a version of it, in one atomic transaction: a save, a diverge, a
   * relink, a restored version. The version comes from
   * `PageTranslation.toVersion`.
   */
  saveContent(
    translation: PageTranslation,
    version: PageTranslationVersion,
  ): Promise<void>;
  /** The published snapshot, the status and when. */
  publish(translation: PageTranslation): Promise<void>;
  saveSeoMeta(translation: PageTranslation): Promise<void>;
  /** A new slug, with the former ones kept for their redirects. Throws `PageSlugAlreadyExistsError` for an address taken meanwhile. */
  rename(translation: PageTranslation): Promise<void>;
  findById(
    tenantId: string,
    pageTranslationId: string,
  ): Promise<PageTranslation | null>;
  findByGroupAndLocale(
    tenantId: string,
    pageGroupId: string,
    locale: string,
  ): Promise<PageTranslation | null>;
  /** Every language of the same group — it replaces PageRepositoryPort.listByGroup. */
  listByGroup(
    tenantId: string,
    pageGroupId: string,
  ): Promise<PageTranslation[]>;
  /**
   * Replaces PageRepositoryPort.findByParentAndSlug for public resolution —
   * it walks the SHARED hierarchy (PageGroup.parentId) one segment at a
   * time, resolving each level's translated slug in the requested `locale`
   * (a page_groups + page_translations join on the adapter side).
   * `parentGroupId: null` = the root level, the same semantics as
   * `findByParentAndSlug`'s `parentId: null`.
   */
  findByParentGroupAndLocaleSlug(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null>;
  /**
   * Every PUBLISHED translation of one site (docs/adr/0059).
   *
   * It exists for one job: when a reusable section is published, the pages
   * that use it have to be re-indexed for search, and finding them means
   * asking each published snapshot whether it references that section.
   * That question is answered by `collectSectionReferences` — the same
   * function the renderer uses — so "which pages use this section" has one
   * answer, not one for rendering and a subtly different one for search.
   *
   * Deliberately not a `where snapshot references :id` query pushed into
   * the adapter: as SQL that is a `::text like` scan over jsonb, correct
   * only because a uuid is unlikely to appear anywhere else in the
   * document, and it would give a second definition of the same question.
   * The cost is bounded — a site's published pages, on a manual publish,
   * not per request.
   */
  listPublishedBySite(
    tenantId: string,
    siteId: string,
  ): Promise<PageTranslation[]>;
  /**
   * The translation that used to answer at `slug`, for the 301 a rename
   * owes to every link somebody already saved (see
   * `PageTranslation.updateSlug`). Asked only when the current-slug
   * lookup found nothing.
   */
  findByFormerSlug(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null>;
  /**
   * The translation that used to hang under `parentGroupId` with `slug`,
   * for the 301 a MOVE owes to every link somebody already saved (see
   * `PageTranslation.recordMovedFrom`). Asked after both current-slug and
   * former-slug lookups have found nothing: a page that left this parent
   * is not among its children under any name.
   */
  findByFormerParent(
    tenantId: string,
    siteId: string,
    locale: string,
    parentGroupId: string | null,
    slug: string,
  ): Promise<PageTranslation | null>;
  delete(tenantId: string, pageTranslationId: string): Promise<void>;
}
