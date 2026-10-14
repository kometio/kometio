import type { TFunction } from 'i18next';
import { REDIRECT_LIMITS } from '@kometio/shared-types';
import { ApiError } from '../../lib/http-client';

/**
 * Why a rule cannot be kept, as the server gives it: a side and a code
 * (`redirect:source:reserved:api`), which the editor says in its own words.
 * `file` and `site` are the import's: a line that is not a row, and a site
 * that is full.
 */
export type RedirectProblemSide = 'file' | 'source' | 'target' | 'site';

export interface RedirectProblem {
  side: RedirectProblemSide;
  problem: string;
  detail?: string;
}

const SOURCE_PROBLEMS = [
  'empty',
  'too-long',
  'too-deep',
  'invalid',
  'reserved',
  'root-without-query',
  'bad-pattern',
  'bad-pattern-splat',
  'bad-pattern-twice',
  'pattern-with-query',
  'too-many-query-pairs',
  'taken',
] as const;

const TARGET_PROBLEMS = [
  'empty',
  'too-long',
  'invalid',
  'invalid-start',
  'unsafe',
  'unsafe-scheme',
  'unsafe-credentials',
  'unknown-placeholder',
  'same-as-source',
  'loop',
  'external',
] as const;

const FILE_PROBLEMS = ['missing-from', 'missing-to', 'bad-status'] as const;

const SITE_PROBLEMS = ['limit'] as const;

function isOneOf<const List extends readonly string[]>(
  list: List,
  value: string,
): value is List[number] {
  return list.some((item) => item === value);
}

/**
 * `redirect:<side>:<problem>[:<detail>]` as a problem, or `null` for any
 * other sentence. The detail is whatever follows the third colon: an address
 * in it may have colons of its own.
 */
export function parseRedirectProblemCode(
  message: string | null | undefined,
): RedirectProblem | null {
  if (!message?.startsWith('redirect:')) return null;
  const [, side, problem, ...rest] = message.split(':');
  if (
    problem === undefined ||
    (side !== 'file' &&
      side !== 'source' &&
      side !== 'target' &&
      side !== 'site')
  ) {
    return null;
  }
  const detail = rest.join(':');
  return { side, problem, ...(detail === '' ? {} : { detail }) };
}

/** What an answer of the API that refused a rule says was wrong, if it said. */
export function redirectProblemOf(error: unknown): RedirectProblem | null {
  return error instanceof ApiError
    ? parseRedirectProblemCode(error.displayMessage)
    : null;
}

/**
 * The server says some of its problems with a sentence of its own, in
 * English (`detail`); the editor tells those apart so that each gets its own
 * words in the editor's language, and the server's sentence is never shown.
 */
function readable(problem: RedirectProblem): {
  variant: string;
  detail: string;
} {
  const detail = problem.detail ?? '';
  if (problem.side === 'source' && problem.problem === 'bad-pattern') {
    if (detail === 'a * can only be the last part') {
      return { variant: 'bad-pattern-splat', detail: '' };
    }
    if (detail.endsWith(' is used twice')) {
      return {
        variant: 'bad-pattern-twice',
        detail: detail.slice(0, -' is used twice'.length),
      };
    }
  }
  if (problem.side === 'target') {
    if (problem.problem === 'unsafe' && detail === 'credentials') {
      return { variant: 'unsafe-credentials', detail: '' };
    }
    if (problem.problem === 'unsafe' && detail === 'only http and https') {
      return { variant: 'unsafe-scheme', detail: '' };
    }
    if (problem.problem === 'invalid' && detail.startsWith('start with')) {
      return { variant: 'invalid-start', detail: '' };
    }
  }
  return { variant: problem.problem, detail };
}

/** The words for a problem, in the editor's language. */
export function describeRedirectProblem(
  t: TFunction,
  problem: RedirectProblem,
): string {
  const { variant, detail } = readable(problem);
  const values = {
    detail,
    max: REDIRECT_LIMITS.segments,
    pairs: REDIRECT_LIMITS.queryPairs,
    limit: REDIRECT_LIMITS.rulesPerSite,
  };
  switch (problem.side) {
    case 'source':
      return isOneOf(SOURCE_PROBLEMS, variant)
        ? t(`redirects.problems.source.${variant}`, values)
        : t('redirects.problems.unknown');
    case 'target':
      return isOneOf(TARGET_PROBLEMS, variant)
        ? t(`redirects.problems.target.${variant}`, values)
        : t('redirects.problems.unknown');
    case 'file':
      return isOneOf(FILE_PROBLEMS, variant)
        ? t(`redirects.problems.file.${variant}`, values)
        : t('redirects.problems.unknown');
    case 'site':
      return isOneOf(SITE_PROBLEMS, variant)
        ? t(`redirects.problems.site.${variant}`, values)
        : t('redirects.problems.unknown');
  }
}
