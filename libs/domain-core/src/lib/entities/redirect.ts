import {
  parseRedirectSource,
  parseRedirectTarget,
  REDIRECT_LIMITS,
  type RedirectKind,
  type RedirectOrigin,
  type RedirectSource,
  type RedirectStatus,
} from '@kometio/shared-types';
import { InvalidRedirectError } from '../errors';

/**
 * Where a rule sends: a page of this site, held by its id and the language
 * to send to (so that renaming the page does not break the rule), or an
 * address. `pageGroupId` is `null` once the page is deleted: the rule is
 * still there, and says it needs somewhere to go.
 */
export type RedirectTarget =
  | { kind: 'page'; pageGroupId: string | null; locale: string }
  | { kind: 'url'; url: string };

export interface RedirectProps {
  id: string;
  tenantId: string;
  siteId: string;
  source: RedirectSource;
  kind: RedirectKind;
  /** `null` for a rule that says the address is gone (410). */
  target: RedirectTarget | null;
  status: RedirectStatus;
  origin: RedirectOrigin;
  hits: number;
  lastHitAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRedirectProps {
  id: string;
  tenantId: string;
  siteId: string;
  /** What was typed or pasted; read by `parseRedirectSource`. */
  from: string;
  /** For `410`, none. */
  to: RedirectTarget | null;
  status: RedirectStatus;
  origin: RedirectOrigin;
  createdBy: string | null;
  now?: Date;
}

/**
 * An old address and what to do when it is asked for (docs/adr/0127).
 *
 * A pure entity. Everything that makes a rule one that works is checked
 * here, so that none can be stored that would silently not: a source that
 * the site itself answers, a target that uses a part the source does not
 * take, a page target on a pattern, a "gone" with somewhere to go.
 */
export class Redirect {
  private constructor(private props: RedirectProps) {}

  static create(input: CreateRedirectProps): Redirect {
    const parsed = parseRedirectSource(input.from);
    if (!parsed.ok) {
      throw new InvalidRedirectError('source', parsed.problem, parsed.detail);
    }
    const now = input.now ?? new Date();
    const redirect = new Redirect({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      source: parsed.source,
      kind: parsed.kind,
      target: null,
      status: input.status,
      origin: input.origin,
      hits: 0,
      lastHitAt: null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    redirect.send(input.to, input.status, parsed.placeholders);
    return redirect;
  }

  static fromProps(props: RedirectProps): Redirect {
    return new Redirect({ ...props });
  }

  toProps(): RedirectProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get siteId(): string {
    return this.props.siteId;
  }

  get source(): RedirectSource {
    return this.props.source;
  }

  get kind(): RedirectKind {
    return this.props.kind;
  }

  get target(): RedirectTarget | null {
    return this.props.target;
  }

  get status(): RedirectStatus {
    return this.props.status;
  }

  get origin(): RedirectOrigin {
    return this.props.origin;
  }

  get hits(): number {
    return this.props.hits;
  }

  get lastHitAt(): Date | null {
    return this.props.lastHitAt;
  }

  get createdBy(): string | null {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** A rule that sends to a page that is no longer there, and so answers nothing until it is given another. */
  get needsATarget(): boolean {
    return (
      this.props.target?.kind === 'page' &&
      this.props.target.pageGroupId === null
    );
  }

  /** The names its source takes, which a target may use. */
  get placeholders(): string[] {
    const parsed = parseRedirectSource(
      this.props.source.query === ''
        ? this.props.source.path
        : `${this.props.source.path}?${this.props.source.query}`,
    );
    return parsed.ok ? parsed.placeholders : [];
  }

  /** Where it sends and how, changed together because each decides what the other may be. */
  redirectTo(
    target: RedirectTarget | null,
    status: RedirectStatus,
    now: Date = new Date(),
  ): void {
    this.send(target, status, this.placeholders);
    this.props.updatedAt = now;
  }

  /** The address changes (an edit of the old address itself). */
  changeSource(from: string, now: Date = new Date()): void {
    const parsed = parseRedirectSource(from);
    if (!parsed.ok) {
      throw new InvalidRedirectError('source', parsed.problem, parsed.detail);
    }
    // The target is read again against what the new source takes.
    const previous = this.props.source;
    const previousKind = this.props.kind;
    this.props.source = parsed.source;
    this.props.kind = parsed.kind;
    try {
      this.send(this.props.target, this.props.status, parsed.placeholders);
    } catch (error) {
      this.props.source = previous;
      this.props.kind = previousKind;
      throw error;
    }
    this.props.updatedAt = now;
  }

  private send(
    target: RedirectTarget | null,
    status: RedirectStatus,
    placeholders: readonly string[],
  ): void {
    if (status === 410) {
      this.props.target = null;
      this.props.status = status;
      return;
    }
    if (target === null) {
      throw new InvalidRedirectError('target', 'empty');
    }
    if (target.kind === 'page') {
      if (this.props.kind === 'pattern') {
        // A pattern's target is a template, which is an address.
        throw new InvalidRedirectError('target', 'page-for-a-pattern');
      }
      if (target.locale.trim() === '') {
        throw new InvalidRedirectError('target', 'empty');
      }
    } else {
      const parsed = parseRedirectTarget(target.url, placeholders);
      if (!parsed.ok) {
        throw new InvalidRedirectError('target', parsed.problem, parsed.detail);
      }
      // Only a path of this site can be the address it is asked at: the same
      // path on another host is a move, and the whole point.
      if (
        this.props.kind === 'exact' &&
        !parsed.isAbsolute &&
        isTheSameAddress(this.props.source, parsed.location)
      ) {
        throw new InvalidRedirectError('target', 'same-as-source');
      }
      this.props.target = { kind: 'url', url: parsed.location };
      this.props.status = status;
      return;
    }
    this.props.target = target;
    this.props.status = status;
  }

  /** Visits counted by whoever flushes them. */
  registerHits(count: number, at: Date): void {
    this.props.hits += count;
    this.props.lastHitAt = at;
  }
}

/** A rule that sends an address to itself is a loop of one: refused where it is written. */
function isTheSameAddress(source: RedirectSource, location: string): boolean {
  if (source.query !== '') return false;
  const parsed = parseRedirectSource(location.split(/[?#]/)[0] ?? '');
  return (
    parsed.ok &&
    parsed.source.path === source.path &&
    parsed.source.query === ''
  );
}

/** What a site may hold, for a caller that has to say so. */
export const MAX_REDIRECTS_PER_SITE = REDIRECT_LIMITS.rulesPerSite;
