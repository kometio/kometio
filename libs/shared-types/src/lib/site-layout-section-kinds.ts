/**
 * A site's header or footer (docs/adr/0018): which of the two a section is,
 * and where it is in its own draft/publish cycle. The one list each of the
 * domain, the wire and the database enums read.
 */
export const SITE_LAYOUT_SECTION_KINDS = ['header', 'footer'] as const;

export type SiteLayoutSectionKind = (typeof SITE_LAYOUT_SECTION_KINDS)[number];

/** Its own list, not a page's, even while the two hold the same words. */
export const SITE_LAYOUT_SECTION_STATUSES = ['draft', 'published'] as const;

export type SiteLayoutSectionStatus =
  (typeof SITE_LAYOUT_SECTION_STATUSES)[number];
