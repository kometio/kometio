import {
  ImportJobHasNoPermalinksError,
  ImportJobNotAnalyzedError,
  ImportJobNotFoundError,
} from '@kometio/domain-core';
import type { ImportJobRepositoryPort } from '@kometio/ports';
import type { WordPressPermalink } from '@kometio/shared-types';
import {
  planWordPressRedirects,
  type PlannablePage,
} from '../wordpress-import/plan-wordpress-redirects';
import {
  applyRedirectRows,
  type ImportRedirectsDeps,
  type RedirectImportReport,
} from './import-redirects.use-case';
import { listPublishedPagePaths } from './list-published-page-paths';
import { requireSite } from './require-site';

export type RedirectsFromWordPressDeps = ImportRedirectsDeps & {
  importJobRepository: Pick<
    ImportJobRepositoryPort,
    'findById' | 'permalinksOf'
  >;
};

export interface RedirectsFromWordPressInput {
  tenantId: string;
  siteId: string;
  /** A file that has been read (`import_jobs`). */
  importJobId: string;
  /** Judge, and write nothing. */
  dryRun: boolean;
  createdBy: string | null;
  /** `false` where a rule may not leave the site (a public demo). Defaults to `true`. */
  allowExternalTargets?: boolean;
}

/** More than this is a list nobody reads, and an answer nobody needs to carry: the count says the rest. */
const LISTED_AT_MOST = 500;

export interface RedirectsFromWordPressResult {
  /** What the rules would be, or were: the import's own report, line by line. */
  report: RedirectImportReport;
  /** Of the pages and posts that were published. */
  pages: { matched: number; ambiguous: number; unmatched: number };
  /** The first of those that have no page to go to — `pages.unmatched` is how many in all. */
  unmatched: WordPressPermalink[];
  /** The first of those that more than one page could be. */
  ambiguous: WordPressPermalink[];
}

/**
 * The redirects of a WordPress move, from the addresses its export held and
 * the pages the site has now (docs/adr/0127).
 *
 * A dry run says what it would do and what has no page yet; making the page
 * and asking again is the whole way to finish a move, so a second run is the
 * same list with fewer left in it (an address that has a rule is not made
 * twice).
 */
export async function redirectsFromWordPress(
  deps: RedirectsFromWordPressDeps,
  input: RedirectsFromWordPressInput,
): Promise<RedirectsFromWordPressResult> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  const job = await deps.importJobRepository.findById(
    input.tenantId,
    input.importJobId,
  );
  // Another site's file is not found, rather than forbidden: it is not this
  // site's to know it exists.
  if (!job || job.siteId !== site.id) {
    throw new ImportJobNotFoundError(input.importJobId);
  }
  if (job.status !== 'analyzed') throw new ImportJobNotAnalyzedError(job.id);
  const permalinks = await deps.importJobRepository.permalinksOf(
    input.tenantId,
    job.id,
  );
  if (permalinks === null) throw new ImportJobHasNoPermalinksError(job.id);

  const pages: PlannablePage[] = await listPublishedPagePaths(
    deps,
    input.tenantId,
    site.id,
  );
  const plan = planWordPressRedirects(permalinks, pages, site.defaultLocale);

  const report = await applyRedirectRows(deps, {
    tenantId: input.tenantId,
    siteId: site.id,
    dryRun: input.dryRun,
    createdBy: input.createdBy,
    origin: 'wordpress',
    allowExternalTargets: input.allowExternalTargets,
    parsed: {
      rows: plan.rows.map((row, index) => ({
        line: index + 1,
        from: row.from,
        to: row.to,
        status: 301,
      })),
      problems: [],
      truncated: false,
    },
  });

  return {
    report,
    pages: {
      matched: plan.matched.length,
      ambiguous: plan.ambiguous.length,
      unmatched: plan.unmatched.length,
    },
    unmatched: plan.unmatched.slice(0, LISTED_AT_MOST),
    ambiguous: plan.ambiguous.slice(0, LISTED_AT_MOST),
  };
}
