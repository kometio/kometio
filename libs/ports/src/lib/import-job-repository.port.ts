import type { ImportJob } from '@kometio/domain-core';
import type { WordPressPermalink } from '@kometio/shared-types';

export interface ImportJobRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(job: ImportJob): Promise<void>;
  /** An existing one, written back — never created again: one deleted meanwhile is its "not found". */
  save(job: ImportJob): Promise<void>;
  findById(tenantId: string, id: string): Promise<ImportJob | null>;
  /** The job and what was kept with it. One that is not there is `ImportJobNotFoundError`. */
  delete(tenantId: string, id: string): Promise<void>;
  /** Newest first — the only order this table is ever read in. */
  listBySite(tenantId: string, siteId: string): Promise<ImportJob[]>;
  /**
   * Keeps where the file's pages and posts used to live, for the redirects
   * of the move (docs/adr/0127). Apart from the job, and never in a listing:
   * it is as long as the site. Replaces what was there.
   */
  savePermalinks(
    tenantId: string,
    jobId: string,
    permalinks: readonly WordPressPermalink[],
  ): Promise<void>;
  /** What `savePermalinks` kept; `null` for a job analysed before they were kept, or one that is not there. */
  permalinksOf(
    tenantId: string,
    jobId: string,
  ): Promise<WordPressPermalink[] | null>;
  /**
   * Every job still marked as running, across every site of this tenant.
   *
   * For the sweep at start-up: the work happens in the API process, so a
   * job that was running when it stopped has nobody doing it any more
   * and would otherwise be watched forever.
   */
  listRunning(tenantId: string): Promise<ImportJob[]>;
}
