import type {
  MissingPathRepositoryPort,
  RedirectRepositoryPort,
  RedirectTrafficPort,
} from '@kometio/ports';

/** How often what was counted is written; a visitor never waits for it. */
const DEFAULT_FLUSH_MS = 10_000;

/**
 * Distinct addresses held between two flushes. A scanner that tries a hundred
 * thousand paths in ten seconds would otherwise be a hundred thousand map
 * entries; the ones past this are not counted, which is the point of a cap.
 */
const MAX_DISTINCT_MISSES = 5000;

export interface RedirectTrafficBufferOptions {
  flushEveryMs?: number;
  now?: () => Date;
  /** Told when a write failed; the counts are kept for the next flush. */
  onError?: (error: unknown) => void;
}

/**
 * Counts what answering requests learns — a rule used, an address not
 * found — and writes it in batches.
 *
 * One row written per request would make a crawler's 404s a write load on
 * the database it never asked for. Counts are added (`hits = hits + n`), so
 * two processes flushing at once agree; a count lost when the process is
 * killed is a visit not counted, not a defect.
 */
export class RedirectTrafficBuffer implements RedirectTrafficPort {
  private hits = new Map<
    string,
    { tenantId: string; redirectId: string; hits: number }
  >();
  private misses = new Map<
    string,
    { tenantId: string; siteId: string; path: string; hits: number }
  >();
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;
  private readonly now: () => Date;
  private readonly flushEveryMs: number;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly redirects: Pick<RedirectRepositoryPort, 'addHits'>,
    private readonly missing: Pick<MissingPathRepositoryPort, 'record'>,
    options: RedirectTrafficBufferOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.flushEveryMs = options.flushEveryMs ?? DEFAULT_FLUSH_MS;
    this.onError = options.onError ?? (() => undefined);
  }

  recordHit(input: { tenantId: string; redirectId: string }): void {
    const known = this.hits.get(input.redirectId);
    if (known) known.hits += 1;
    else this.hits.set(input.redirectId, { ...input, hits: 1 });
    this.schedule();
  }

  recordMiss(input: { tenantId: string; siteId: string; path: string }): void {
    const key = `${input.siteId}\0${input.path}`;
    const known = this.misses.get(key);
    if (known) {
      known.hits += 1;
    } else if (this.misses.size < MAX_DISTINCT_MISSES) {
      this.misses.set(key, { ...input, hits: 1 });
    }
    this.schedule();
  }

  /** Written now; whatever fails to be written is counted again at the next flush. */
  flush(): Promise<void> {
    // One at a time: a flush that is still writing is what this one waits for.
    this.flushing = (this.flushing ?? Promise.resolve()).then(() =>
      this.write(),
    );
    return this.flushing;
  }

  /** For shutdown: stop the timer and write what is left. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushEveryMs);
    // A timer must not keep a process alive that has nothing else to do.
    this.timer.unref?.();
  }

  private async write(): Promise<void> {
    const hits = [...this.hits.values()];
    const misses = [...this.misses.values()];
    this.hits = new Map();
    this.misses = new Map();
    if (hits.length === 0 && misses.length === 0) return;

    const at = this.now();
    if (hits.length > 0) {
      try {
        await this.redirects.addHits(
          hits.map((entry) => ({
            tenantId: entry.tenantId,
            redirectId: entry.redirectId,
            hits: entry.hits,
            at,
          })),
        );
      } catch (error) {
        this.onError(error);
        for (const entry of hits) this.keepHit(entry);
      }
    }
    if (misses.length > 0) {
      try {
        await this.missing.record(
          misses.map((entry) => ({
            tenantId: entry.tenantId,
            siteId: entry.siteId,
            path: entry.path,
            hits: entry.hits,
            at,
          })),
        );
      } catch (error) {
        this.onError(error);
        for (const entry of misses) this.keepMiss(entry);
      }
    }
  }

  private keepHit(entry: {
    tenantId: string;
    redirectId: string;
    hits: number;
  }): void {
    const known = this.hits.get(entry.redirectId);
    if (known) known.hits += entry.hits;
    else this.hits.set(entry.redirectId, entry);
  }

  private keepMiss(entry: {
    tenantId: string;
    siteId: string;
    path: string;
    hits: number;
  }): void {
    const key = `${entry.siteId}\0${entry.path}`;
    const known = this.misses.get(key);
    if (known) known.hits += entry.hits;
    else if (this.misses.size < MAX_DISTINCT_MISSES)
      this.misses.set(key, entry);
  }
}
