/** A language of a page that holds the file, with what the page is called there. */
export interface MediaUsedOnPage {
  pageGroupId: string;
  locale: string;
  slug: string;
  /** `null` while the language has no title of its own — the address stands in. */
  title: string | null;
}

export interface MediaUsedInSection {
  sectionId: string;
  name: string;
  kind: 'shared' | 'template';
}

export interface MediaUsedInLayout {
  kind: 'header' | 'footer';
  locale: string;
}

/** Everywhere a file is found, as the database has it — grouped by the caller. */
export interface MediaUsageRows {
  pages: MediaUsedOnPage[];
  sections: MediaUsedInSection[];
  layout: MediaUsedInLayout[];
}

/**
 * Where a library file is in use.
 *
 * A read across pages, shared sections and the header and footer, none of
 * which is the media aggregate's business — so a port of its own, like
 * DashboardStatsPort, rather than a method on MediaRepositoryPort that
 * would make the media repository know every table that holds blocks.
 *
 * What is looked at is what each holds now — draft and live — and not the
 * versions kept for restoring: a file used only by an old version is not
 * one that deleting would leave a hole in.
 */
export interface MediaUsagePort {
  findUsages(
    tenantId: string,
    siteId: string,
    mediaId: string,
  ): Promise<MediaUsageRows>;
}
