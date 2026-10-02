import type { PageTranslationStatus } from '@kometio/domain-core';

export interface DashboardPageStats {
  publishedCount: number;
  draftCount: number;
}

export interface DashboardMediaStats {
  count: number;
  totalSizeBytes: number;
}

export interface DashboardRecentActivityItem {
  pageGroupId: string;
  pageTranslationId: string;
  locale: string;
  title: string;
  slug: string;
  status: PageTranslationStatus;
  /**
   * Online, and the draft has moved on since — the answer `hasUnpublishedChanges`
   * (@kometio/domain-core) gives for the page's own row in the pages list, so
   * the feed and the list cannot call the same page by two names.
   */
  hasUnpublishedChanges: boolean;
  updatedAt: Date;
}

/**
 * One form that recently received something. Deliberately carries no part
 * of the payload: the dashboard is the first screen after login and the
 * one most likely to be left open on a monitor, and a visitor's name and
 * email do not belong on it. The count and the link are enough to decide
 * whether to go and read them.
 */
export interface DashboardRecentSubmissionItem {
  formId: string;
  formName: string;
  receivedAt: Date;
}

export interface DashboardFormStats {
  /** Every submission this site has ever received, across all its forms. */
  totalCount: number;
  /** How many arrived in the last 7 days — the number that says "is anything happening". */
  recentCount: number;
  recent: DashboardRecentSubmissionItem[];
}

export interface DashboardStats {
  pages: DashboardPageStats;
  media: DashboardMediaStats;
  forms: DashboardFormStats;
  recentActivity: DashboardRecentActivityItem[];
}

/**
 * Its own Port, not extra methods bolted onto PageGroupRepositoryPort /
 * PageTranslationRepositoryPort / MediaRepositoryPort — same reasoning as
 * SearchPort's own doc comment: this is a read-only aggregation across
 * three tables (page_groups, page_translations, media) with no natural
 * home on any single entity's CRUD-oriented repository, and a future
 * non-Postgres deployment could swap this one adapter's aggregate queries
 * without touching any of those repositories' own contracts.
 */
export interface DashboardStatsPort {
  getStats(
    tenantId: string,
    siteId: string,
    recentActivityLimit: number,
  ): Promise<DashboardStats>;
}
