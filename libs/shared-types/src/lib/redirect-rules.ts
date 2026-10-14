/**
 * The rules of redirects (docs/adr/0127): what an old address is, what it may
 * be sent to, and which rule answers a request.
 *
 * Pure, and in `shared-types` because three places must agree on every line of
 * it: the API, which refuses a rule that cannot work and answers "where does
 * this go" for the editor's test; the application, which resolves a request;
 * and the editor, which says what a typed address will be read as. Two
 * readings of one address is how a redirect that was tested does not fire.
 */

/** Permanent, temporary, gone. 307/308 differ from these only for a POST, which a visitor's old address never is. */
export const REDIRECT_STATUSES = [301, 302, 410] as const;
export type RedirectStatus = (typeof REDIRECT_STATUSES)[number];

/** One address, or a pattern with a part that varies (`/:year/:month/:slug`). */
export const REDIRECT_KINDS = ['exact', 'pattern'] as const;
export type RedirectKind = (typeof REDIRECT_KINDS)[number];

/** A page of this site (which follows it when it is renamed), or an address. */
export const REDIRECT_TARGET_KINDS = ['page', 'url'] as const;
export type RedirectTargetKind = (typeof REDIRECT_TARGET_KINDS)[number];

/** How a rule came to be: typed, from a list, from a WordPress export — what a person filters by to check what an import did. */
export const REDIRECT_ORIGINS = ['manual', 'list', 'wordpress'] as const;
export type RedirectOrigin = (typeof REDIRECT_ORIGINS)[number];

export const REDIRECT_LIMITS = {
  /** An address longer than this is not a link anybody typed. */
  addressLength: 2048,
  /** Deeper than this is not a site's page; and a rule is read segment by segment. */
  segments: 12,
  /** `?a=1&b=2&c=3…`: a rule that needs more is asking for a different tool. */
  queryPairs: 5,
  /** What a site may hold: the whole set is read into memory to answer a request. */
  rulesPerSite: 10_000,
} as const;

/**
 * The first segments that the site itself answers: a rule on one would never
 * be asked, because a route that answers is not a 404 (and a 404 is the only
 * time rules are consulted). Refused at write, with the reason, rather than
 * saved and silent.
 */
const RESERVED_FIRST_SEGMENTS: ReadonlySet<string> = new Set([
  'api',
  '_astro',
  '_image',
  'preview',
  'robots.txt',
  'sitemap.xml',
]);

/**
 * A host at the front of an address that has no scheme: `www.old-site.com`
 * or `old-site.com/about`. A bare `about.html` is a file, not a host, so a
 * name with a dot is a host only when it has a `www.` or a path after it.
 */
const HOST_WITHOUT_SCHEME =
  /^(www\.[^/?#\s]+|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(?=[/?]))/i;

const PLACEHOLDER = /^:[a-z][a-z0-9_]{0,31}$/;
const SPLAT = '*';
/** WordPress and old PHP sites answer `/index.php/2019/05/post` and `/index.php?p=1`: the file is not part of the address. */
const INDEX_FILES: ReadonlySet<string> = new Set([
  'index.php',
  'index.html',
  'index.htm',
]);

export interface RedirectSource {
  /** `/2019/05/old-post`, lower case, no trailing slash, `/` only with a query. A pattern has `:name` and `*` segments. */
  path: string;
  /** The `key=value` pairs that must be present, sorted and joined with `&`; `''` for none. */
  query: string;
}

export type RedirectSourceProblem =
  | 'empty'
  | 'too-long'
  | 'too-deep'
  | 'invalid'
  /** The site itself answers this: a rule here would never be asked. */
  | 'reserved'
  /** `/` alone is the site's front door, which already goes to the default language. */
  | 'root-without-query'
  | 'bad-pattern'
  | 'pattern-with-query'
  | 'too-many-query-pairs';

export type ParsedRedirectSource =
  | {
      ok: true;
      source: RedirectSource;
      kind: 'exact' | 'pattern';
      /** `:slug`, `:year`: the names a target may use. `*` is `'*'`. */
      placeholders: string[];
    }
  | { ok: false; problem: RedirectSourceProblem; detail?: string };

/** What a request asks for, read the way a rule is read. */
export interface RequestedAddress {
  path: string;
  params: ReadonlyMap<string, string>;
}

function decodeSegment(segment: string): string {
  try {
    const decoded = decodeURIComponent(segment);
    // An encoded slash is part of one segment, not a second one.
    return decoded.includes('/') ? segment : decoded;
  } catch {
    return segment;
  }
}

/**
 * The one reading of a path, for a rule and for a request: percent-decoded
 * per segment, lower case, no empty segments, no trailing slash, and without
 * an `index.php`/`index.html` at either end. No segment at all is the root.
 */
function pathSegments(path: string): string[] {
  const segments = path
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => decodeSegment(segment).toLowerCase());
  if (segments[0] !== undefined && INDEX_FILES.has(segments[0])) {
    segments.shift();
  }
  const last = segments[segments.length - 1];
  if (last !== undefined && INDEX_FILES.has(last)) segments.pop();
  return segments;
}

const toPath = (segments: readonly string[]): string =>
  segments.length === 0 ? '/' : `/${segments.join('/')}`;

function queryPairsOf(search: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [key, value] of new URLSearchParams(search)) {
    if (key !== '') pairs.push([key, value]);
  }
  return pairs;
}

/** Not `localeCompare`: the order is part of what a rule is, and must not depend on the machine's language. */
const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

function canonicalQuery(pairs: readonly [string, string][]): string {
  return [...pairs]
    .sort(([a, av], [b, bv]) =>
      a === b ? compareText(av, bv) : compareText(a, b),
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

/** The pairs of a canonical query, back from the string. */
export function redirectQueryPairs(query: string): [string, string][] {
  if (query === '') return [];
  return query.split('&').map((pair): [string, string] => {
    const at = pair.indexOf('=');
    return at === -1
      ? [decodeURIComponent(pair), '']
      : [
          decodeURIComponent(pair.slice(0, at)),
          decodeURIComponent(pair.slice(at + 1)),
        ];
  });
}

/**
 * What a person typed or pasted as "the old address": the whole link from
 * the old site, only its path, or `?p=123` — into what a rule keeps of it.
 *
 * Lenient on the way in (a host with no scheme, a fragment, an `index.php`, a
 * trailing slash, capitals are all things a pasted link has) and strict on
 * what it stores, so that one address has one spelling.
 */
export function parseRedirectSource(input: string): ParsedRedirectSource {
  let raw = input.trim();
  if (raw === '') return { ok: false, problem: 'empty' };
  if (raw.length > REDIRECT_LIMITS.addressLength) {
    return { ok: false, problem: 'too-long' };
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      raw = `${url.pathname}${url.search}`;
    } catch {
      return { ok: false, problem: 'invalid' };
    }
  } else if (HOST_WITHOUT_SCHEME.test(raw)) {
    // `old-site.com/about`: a link copied without its scheme.
    raw = raw.replace(/^[^/?#]+/, '');
  }

  const hash = raw.indexOf('#');
  if (hash !== -1) raw = raw.slice(0, hash);
  if (raw === '' || raw.startsWith('?')) raw = `/${raw}`;
  if (!raw.startsWith('/')) raw = `/${raw}`;

  const questionMark = raw.indexOf('?');
  const pathPart = questionMark === -1 ? raw : raw.slice(0, questionMark);
  const searchPart = questionMark === -1 ? '' : raw.slice(questionMark + 1);

  const segments = pathSegments(pathPart);
  if (segments.length > REDIRECT_LIMITS.segments) {
    return { ok: false, problem: 'too-deep' };
  }

  const placeholders: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (segment === SPLAT) {
      if (index !== segments.length - 1) {
        return {
          ok: false,
          problem: 'bad-pattern',
          detail: 'a * can only be the last part',
        };
      }
      placeholders.push(SPLAT);
    } else if (segment.startsWith(':')) {
      if (!PLACEHOLDER.test(segment)) {
        return { ok: false, problem: 'bad-pattern', detail: segment };
      }
      if (placeholders.includes(segment)) {
        return {
          ok: false,
          problem: 'bad-pattern',
          detail: `${segment} is used twice`,
        };
      }
      placeholders.push(segment);
    } else if (segment.includes('*') || segment.includes(':')) {
      // A whole segment is a placeholder or it is text: `/post-:id` is not a
      // thing, and saved as text it would match nothing and say nothing.
      return { ok: false, problem: 'bad-pattern', detail: segment };
    }
  }

  const pairs = queryPairsOf(searchPart);
  if (pairs.length > REDIRECT_LIMITS.queryPairs) {
    return { ok: false, problem: 'too-many-query-pairs' };
  }
  const kind = placeholders.length > 0 ? 'pattern' : 'exact';
  if (kind === 'pattern' && pairs.length > 0) {
    return { ok: false, problem: 'pattern-with-query' };
  }

  const path = toPath(segments);
  if (path === '/' && pairs.length === 0) {
    return { ok: false, problem: 'root-without-query' };
  }
  const first = segments[0];
  if (first !== undefined && RESERVED_FIRST_SEGMENTS.has(first)) {
    return { ok: false, problem: 'reserved', detail: first };
  }

  return {
    ok: true,
    source: { path, query: canonicalQuery(pairs) },
    kind,
    placeholders,
  };
}

/** A request's pathname and search, read as a rule's source is. */
export function readRequestedAddress(
  pathname: string,
  search: string,
): RequestedAddress {
  return {
    path: toPath(pathSegments(pathname)),
    params: new Map(queryPairsOf(search)),
  };
}

export interface MatchableRedirect {
  id: string;
  source: RedirectSource;
  kind: 'exact' | 'pattern';
  /** For the tie between two patterns that are equally specific: the older one wins. */
  createdAt: Date;
}

export interface RedirectMatch<R extends MatchableRedirect> {
  rule: R;
  /** `:slug` → `my-post`, by name without the colon. */
  captures: Readonly<Record<string, string>>;
  /** What `*` took, as the remaining path, or `null` when the rule has none. */
  splat: string | null;
  /** The query keys the rule consumed: a redirect that was asked by `?p=123` leaves `?p=` behind. */
  matchedQueryKeys: readonly string[];
}

interface CompiledPattern<R extends MatchableRedirect> {
  rule: R;
  segments: string[];
  literals: number;
  hasSplat: boolean;
}

export interface RedirectMatcher<R extends MatchableRedirect> {
  match(address: RequestedAddress): RedirectMatch<R> | null;
}

/**
 * Which rule answers an address. Exact rules first, and among them the one
 * that asks for the most query pairs (`?p=1&x=2` before `?p=1`); then
 * patterns, the most specific first (more literal segments, a `*` last, the
 * older one). An address that matches no rule is `null`.
 *
 * Built once per set of rules and asked many times: exact rules are a
 * lookup, and there are few patterns.
 */
export function compileRedirectMatcher<R extends MatchableRedirect>(
  rules: readonly R[],
): RedirectMatcher<R> {
  const exact = new Map<string, { rule: R; pairs: [string, string][] }[]>();
  const patterns: CompiledPattern<R>[] = [];

  for (const rule of rules) {
    if (rule.kind === 'exact') {
      const entries = exact.get(rule.source.path) ?? [];
      entries.push({ rule, pairs: redirectQueryPairs(rule.source.query) });
      exact.set(rule.source.path, entries);
    } else {
      const segments = rule.source.path.split('/').filter(Boolean);
      patterns.push({
        rule,
        segments,
        literals: segments.filter(
          (segment) => segment !== SPLAT && !segment.startsWith(':'),
        ).length,
        hasSplat: segments[segments.length - 1] === SPLAT,
      });
    }
  }
  for (const entries of exact.values()) {
    entries.sort((a, b) => b.pairs.length - a.pairs.length);
  }
  patterns.sort(
    (a, b) =>
      b.literals - a.literals ||
      Number(a.hasSplat) - Number(b.hasSplat) ||
      b.segments.length - a.segments.length ||
      a.rule.createdAt.getTime() - b.rule.createdAt.getTime() ||
      compareText(a.rule.id, b.rule.id),
  );

  return {
    match(address) {
      for (const entry of exact.get(address.path) ?? []) {
        if (
          entry.pairs.every(([key, value]) => address.params.get(key) === value)
        ) {
          return {
            rule: entry.rule,
            captures: {},
            splat: null,
            matchedQueryKeys: entry.pairs.map(([key]) => key),
          };
        }
      }
      if (patterns.length === 0) return null;
      const requested = address.path.split('/').filter(Boolean);
      for (const pattern of patterns) {
        const taken = matchPattern(pattern, requested);
        if (taken) {
          return {
            rule: pattern.rule,
            captures: taken.captures,
            splat: taken.splat,
            matchedQueryKeys: [],
          };
        }
      }
      return null;
    },
  };
}

function matchPattern<R extends MatchableRedirect>(
  pattern: CompiledPattern<R>,
  requested: readonly string[],
): { captures: Record<string, string>; splat: string | null } | null {
  const { segments } = pattern;
  const fixed = pattern.hasSplat ? segments.length - 1 : segments.length;
  if (
    pattern.hasSplat ? requested.length <= fixed : requested.length !== fixed
  ) {
    return null;
  }
  const captures: Record<string, string> = {};
  for (let index = 0; index < fixed; index += 1) {
    const expected = segments[index];
    const actual = requested[index];
    if (expected === undefined || actual === undefined) return null;
    if (expected.startsWith(':')) {
      captures[expected.slice(1)] = actual;
    } else if (expected !== actual) {
      return null;
    }
  }
  return {
    captures,
    splat: pattern.hasSplat ? requested.slice(fixed).join('/') : null,
  };
}

export type ParsedRedirectTarget =
  | { ok: true; location: string; isAbsolute: boolean }
  | {
      ok: false;
      problem:
        'empty' | 'too-long' | 'invalid' | 'unsafe' | 'unknown-placeholder';
      detail?: string;
    };

/**
 * Where a rule sends: a path of this site (`/en/blog/post`) or another
 * address (`https://…`). `allowed` is the placeholders the source defines; a
 * target that uses another is a rule that would send a visitor to `:slug`
 * written out.
 *
 * Lenient where a person would be: `example.com/page` is read as
 * `https://example.com/page`. Strict where a visitor would pay: no
 * `javascript:`, no `//host` (which is a host), no credentials in an address.
 */
export function parseRedirectTarget(
  input: string,
  allowed: readonly string[] = [],
): ParsedRedirectTarget {
  let value = input.trim();
  if (value === '') return { ok: false, problem: 'empty' };
  if (value.length > REDIRECT_LIMITS.addressLength) {
    return { ok: false, problem: 'too-long' };
  }
  // A space or a control character in a Location header is how a response is
  // split; and a backslash is a slash to a browser, so `/\evil.example` is
  // `//evil.example` — another host, behind an address that looks like ours.
  if (
    [...value].some(
      (character) =>
        character <= ' ' || character === '\u007f' || character === '\\',
    )
  ) {
    return { ok: false, problem: 'unsafe' };
  }

  let isAbsolute = false;
  if (value.startsWith('//')) return { ok: false, problem: 'unsafe' };
  if (!value.startsWith('/')) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      if (!/^https?:\/\//i.test(value)) {
        return { ok: false, problem: 'unsafe', detail: 'only http and https' };
      }
    } else if (HOST_WITHOUT_SCHEME.test(value)) {
      value = `https://${value}`;
    } else {
      return {
        ok: false,
        problem: 'invalid',
        detail: 'start with / for a page of this site, or with https://',
      };
    }
    isAbsolute = true;
  }

  if (isAbsolute) {
    try {
      const url = new URL(
        value.replace(/\/:[a-z][a-z0-9_]*(?=[/?#]|$)|\/\*(?=[/?#]|$)/gi, '/x'),
      );
      if (url.username !== '' || url.password !== '') {
        return { ok: false, problem: 'unsafe', detail: 'credentials' };
      }
    } catch {
      return { ok: false, problem: 'invalid' };
    }
  }

  for (const name of redirectTargetPlaceholders(value)) {
    if (!allowed.includes(name)) {
      return { ok: false, problem: 'unknown-placeholder', detail: name };
    }
  }
  return { ok: true, location: value, isAbsolute };
}

/** The `:name`s and `*` a target writes out, as the source names them (`:slug`, `*`). */
export function redirectTargetPlaceholders(target: string): string[] {
  const { path } = splitTarget(target);
  return path
    .split('/')
    .filter((segment) => segment === SPLAT || PLACEHOLDER.test(segment));
}

function splitTarget(target: string): {
  origin: string;
  path: string;
  tail: string;
} {
  const origin = /^https?:\/\/[^/?#]*/i.exec(target)?.[0] ?? '';
  const rest = target.slice(origin.length);
  const tailAt = rest.search(/[?#]/);
  return {
    origin,
    path: tailAt === -1 ? rest : rest.slice(0, tailAt),
    tail: tailAt === -1 ? '' : rest.slice(tailAt),
  };
}

const encodeSegment = (segment: string): string => encodeURIComponent(segment);

/**
 * The address a match sends to: the target with its placeholders replaced by
 * what the source took. A target with none is itself.
 */
export function fillRedirectTarget(
  template: string,
  match: Pick<RedirectMatch<MatchableRedirect>, 'captures' | 'splat'>,
): string {
  const { origin, path, tail } = splitTarget(template);
  const filled = path
    .split('/')
    .map((segment) => {
      if (segment === SPLAT) {
        return (match.splat ?? '').split('/').map(encodeSegment).join('/');
      }
      if (PLACEHOLDER.test(segment)) {
        return encodeSegment(match.captures[segment.slice(1)] ?? '');
      }
      return segment;
    })
    .join('/');
  return `${origin}${filled}${tail}`;
}

/**
 * The address to send the visitor to: the rule's target filled in, and the
 * query string of the request carried over (a campaign's `?utm_source=` must
 * survive a redirect) minus what the rule consumed in matching. A target that
 * has its own query keeps it, and the request's pairs are not added to it.
 */
export function redirectLocation(
  filledTarget: string,
  requestSearch: string,
  consumedKeys: readonly string[],
): string {
  if (filledTarget.includes('?') || filledTarget.includes('#')) {
    return filledTarget;
  }
  const kept = queryPairsOf(requestSearch).filter(
    ([key]) => !consumedKeys.includes(key),
  );
  if (kept.length === 0) return filledTarget;
  const search = kept
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
  return `${filledTarget}?${search}`;
}

/**
 * Addresses that bots ask every site for, and that no migration ever
 * linked: kept out of the list of what visitors could not find, so that the
 * list holds what a person can act on. Not an exhaustive list of anything
 * and not a security measure — only noise control.
 */
const PROBE = [
  /^\/wp-(login\.php|admin|config\.php|includes|json)(\/|$)/,
  /^\/xmlrpc\.php$/,
  /^\/\.(env|git|aws|ds_store|htaccess|svn)(\/|$)/,
  /^\/(phpmyadmin|pma|cgi-bin|administrator|vendor|server-status)(\/|$)/,
  /^\/\.well-known\//,
  /^\/wlwmanifest\.xml$/,
];

export function isKnownProbe(path: string): boolean {
  return PROBE.some((pattern) => pattern.test(path));
}

/** One line of what a source reads as, for a list or a log: `/old?p=1`. */
export function describeRedirectSource(source: RedirectSource): string {
  return source.query === '' ? source.path : `${source.path}?${source.query}`;
}
