import { randomUUID } from 'node:crypto';
import {
  InvalidRedirectError,
  Redirect,
  RedirectSourceTakenError,
  type RedirectTarget,
} from '@kometio/domain-core';
import {
  compileRedirectMatcher,
  describeRedirectSource,
  parseRedirectCsv,
  REDIRECT_LIMITS,
  redirectQueryPairs,
  type RedirectCsvRow,
  type RedirectOrigin,
} from '@kometio/shared-types';
import { localePathFromAncestors } from '@kometio/theme-runtime';
import { followRedirects } from '../redirects/follow-redirects';
import { assertTargetStaysOnSite } from '../redirects/redirect-target-input';
import type { RedirectDeps } from '../redirects/redirect-deps';
import { pageTargetInfo } from '../redirects/published-page-path';
import { listPublishedPagePaths } from './list-published-page-paths';
import { requireSite } from './require-site';

export type ImportRedirectsDeps = Pick<
  RedirectDeps,
  | 'redirectRepository'
  | 'missingPathRepository'
  | 'siteRepository'
  | 'pageGroupRepository'
  | 'pageTranslationRepository'
  | 'ruleSets'
>;

export interface ImportRedirectsInput {
  tenantId: string;
  siteId: string;
  csv: string;
  /** Read and judge every row, and write nothing. */
  dryRun: boolean;
  createdBy: string | null;
  origin?: RedirectOrigin;
  /** `false` where a rule may not leave the site (a public demo). Defaults to `true`. */
  allowExternalTargets?: boolean;
}

export type RedirectImportOutcome =
  'created' | 'updated' | 'unchanged' | 'error';

export interface RedirectImportRow {
  line: number;
  from: string;
  to: string;
  outcome: RedirectImportOutcome;
  /** For an `error`: which side, and a code the editor puts in words. */
  side?: 'file' | 'source' | 'target' | 'site';
  problem?: string;
  detail?: string;
}

export interface RedirectImportReport {
  rows: RedirectImportRow[];
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** More rows were in the file than are read at once. */
  truncated: boolean;
  /** Whether anything was written: `false` for a dry run. */
  applied: boolean;
}

const keyOf = (path: string, query: string): string => `${path}?${query}`;

/**
 * A list of redirects, from a spreadsheet or an SEO tool, in one go.
 *
 * What it promises: the same file imported twice is the same site (an
 * address that has a rule is updated, not refused or doubled); every row is
 * judged on its own and a bad one is named by its line, not the file
 * refused; and a dry run says exactly what the real one will do.
 *
 * A target that is a path of this site is stored as the page it names,
 * where it names one, as `createRedirect` does.
 */
export async function importRedirects(
  deps: ImportRedirectsDeps,
  input: ImportRedirectsInput,
): Promise<RedirectImportReport> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  const parsed = parseRedirectCsv(input.csv);

  const [existing, published] = await Promise.all([
    deps.redirectRepository.listBySite(input.tenantId, site.id),
    listPublishedPagePaths(deps, input.tenantId, site.id),
  ]);

  const pageByAddress = new Map<string, RedirectTarget>();
  const pathByPage = new Map<string, string>();
  for (const page of published) {
    const path = localePathFromAncestors(
      page.locale,
      page.ancestorSlugs,
      page.slug,
    );
    pageByAddress.set(path.toLowerCase(), {
      kind: 'page',
      pageGroupId: page.groupId,
      locale: page.locale,
    });
    pathByPage.set(`${page.groupId}:${page.locale}`, path);
  }

  const working = new Map<string, Redirect>(
    existing.map((rule) => [keyOf(rule.source.path, rule.source.query), rule]),
  );
  const created = new Set<string>();
  const updated = new Set<string>();
  const results = new Map<number, RedirectImportRow>();
  /** Which rule a line of the file ended up as, for the ones that did. */
  const ruleOfLine = new Map<number, Redirect>();

  for (const problem of parsed.problems) {
    results.set(problem.line, {
      line: problem.line,
      from: '',
      to: '',
      outcome: 'error',
      side: 'file',
      problem: problem.problem,
      detail: problem.value,
    });
  }

  const targetOf = (row: RedirectCsvRow): RedirectTarget | null => {
    if (row.status === 410) return null;
    const plain = row.to.trim();
    const page =
      plain.startsWith('/') && !/[?#:*]/.test(plain)
        ? pageByAddress.get(
            `/${plain.split('/').filter(Boolean).join('/')}`.toLowerCase(),
          )
        : undefined;
    return page ?? { kind: 'url', url: row.to };
  };

  for (const row of parsed.rows) {
    const base = { line: row.line, from: row.from, to: row.to };
    try {
      const target = targetOf(row);
      const candidate = Redirect.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        siteId: site.id,
        from: row.from,
        to: target,
        status: row.status,
        origin: input.origin ?? 'list',
        createdBy: input.createdBy,
      });
      assertTargetStaysOnSite(
        candidate.target,
        input.allowExternalTargets ?? true,
      );
      const key = keyOf(candidate.source.path, candidate.source.query);
      const known = working.get(key);

      if (known) {
        ruleOfLine.set(row.line, known);
        if (sameAnswer(known, candidate)) {
          results.set(row.line, { ...base, outcome: 'unchanged' });
        } else {
          known.redirectTo(candidate.target, candidate.status);
          if (!created.has(known.id)) updated.add(known.id);
          results.set(row.line, {
            ...base,
            outcome: created.has(known.id) ? 'created' : 'updated',
          });
        }
        continue;
      }
      if (working.size >= REDIRECT_LIMITS.rulesPerSite) {
        results.set(row.line, {
          ...base,
          outcome: 'error',
          side: 'site',
          problem: 'limit',
          detail: String(REDIRECT_LIMITS.rulesPerSite),
        });
        continue;
      }
      working.set(key, candidate);
      created.add(candidate.id);
      ruleOfLine.set(row.line, candidate);
      results.set(row.line, { ...base, outcome: 'created' });
    } catch (error) {
      if (!(error instanceof InvalidRedirectError)) throw error;
      results.set(row.line, {
        ...base,
        outcome: 'error',
        side: error.side,
        problem: error.problem,
        detail: error.detail,
      });
    }
  }

  // Circles, judged once on the set as it will be: a rule is only a loop
  // together with others, and the others may come later in the file.
  const matcher = compileRedirectMatcher([...working.values()]);
  const touched = [...working.values()].filter(
    (rule) => created.has(rule.id) || updated.has(rule.id),
  );
  const looping = new Set<string>();
  for (const rule of touched) {
    if (rule.status === 410) continue;
    const chain = await followRedirects(
      {
        matcher,
        pagePath: async (pageGroupId, locale) =>
          pathByPage.get(`${pageGroupId}:${locale}`) ??
          (await pageTargetInfo(deps, input.tenantId, pageGroupId, locale))
            ?.path ??
          null,
        // The pages of the site, as listed above: no query for each hop.
        answersAsPage: async (path) =>
          pageByAddress.has(path.toLowerCase()) ||
          (/^\/[^/]+\/?$/.test(path.toLowerCase()) &&
            site.enabledLocales.includes(
              path.replace(/\//g, '').toLowerCase(),
            )),
      },
      {
        path: rule.source.path
          .split('/')
          .map((segment) =>
            segment === '*' || segment.startsWith(':') ? 'sample' : segment,
          )
          .join('/'),
        params: new Map(redirectQueryPairs(rule.source.query)),
      },
    );
    if (chain.kind === 'loop' && chain.rules.length > 1) {
      for (const id of chain.rules) looping.add(id);
    }
  }
  for (const [line, rule] of ruleOfLine) {
    const row = results.get(line);
    if (!row || row.outcome === 'error' || !looping.has(rule.id)) continue;
    results.set(line, {
      ...row,
      outcome: 'error',
      side: 'target',
      problem: 'loop',
    });
    working.delete(keyOf(rule.source.path, rule.source.query));
    created.delete(rule.id);
    updated.delete(rule.id);
  }

  let applied = false;
  if (!input.dryRun) {
    for (const rule of working.values()) {
      if (!created.has(rule.id) && !updated.has(rule.id)) continue;
      try {
        if (created.has(rule.id)) {
          await deps.redirectRepository.add(rule);
          if (rule.kind === 'exact') {
            await deps.missingPathRepository.clear(
              input.tenantId,
              site.id,
              describeRedirectSource(rule.source),
            );
          }
        } else {
          await deps.redirectRepository.save(rule);
        }
      } catch (error) {
        // Another request took the address between the read and the write.
        if (!(error instanceof RedirectSourceTakenError)) throw error;
      }
    }
    deps.ruleSets.invalidate(site.id);
    applied = true;
  }

  const rows = [...results.values()].sort((a, b) => a.line - b.line);
  return {
    rows,
    created: rows.filter((row) => row.outcome === 'created').length,
    updated: rows.filter((row) => row.outcome === 'updated').length,
    unchanged: rows.filter((row) => row.outcome === 'unchanged').length,
    failed: rows.filter((row) => row.outcome === 'error').length,
    truncated: parsed.truncated,
    applied,
  };
}

function sameAnswer(a: Redirect, b: Redirect): boolean {
  if (a.status !== b.status) return false;
  const left = a.target;
  const right = b.target;
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  return left.kind === 'page' && right.kind === 'page'
    ? left.pageGroupId === right.pageGroupId && left.locale === right.locale
    : left.kind === 'url' && right.kind === 'url' && left.url === right.url;
}
