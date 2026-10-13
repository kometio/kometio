import {
  RedirectNotFoundError,
  RedirectSourceTakenError,
  type Redirect,
} from '@kometio/domain-core';
import {
  type MissingPath,
  type MissingPathRepositoryPort,
  type PaginatedResult,
  type Pagination,
  type RedirectListFilter,
  type RedirectRepositoryPort,
  type RedirectTrafficPort,
} from '@kometio/ports';
import {
  describeRedirectSource,
  type RedirectSource,
} from '@kometio/shared-types';

const sourceKey = (siteId: string, source: RedirectSource): string =>
  `${siteId}\0${source.path}\0${source.query}`;

/** What the database's unique constraint does, in memory: one rule per address of a site. */
export class InMemoryRedirectRepository implements RedirectRepositoryPort {
  private readonly redirects = new Map<string, Redirect>();
  /** How many times the whole set was read: what a cache is checked by. */
  listBySiteCalls = 0;

  /** The address of each rule, as the unique constraint reads it. */
  private readonly owners = new Map<string, string>();

  private taken(redirect: Redirect): boolean {
    const owner = this.owners.get(sourceKey(redirect.siteId, redirect.source));
    return owner !== undefined && owner !== redirect.id;
  }

  private store(redirect: Redirect): void {
    const previous = this.redirects.get(redirect.id);
    if (previous) {
      this.owners.delete(sourceKey(previous.siteId, previous.source));
    }
    this.redirects.set(redirect.id, redirect);
    this.owners.set(sourceKey(redirect.siteId, redirect.source), redirect.id);
  }

  async add(redirect: Redirect): Promise<void> {
    if (this.redirects.has(redirect.id)) {
      throw new Error(`Redirect ${redirect.id} already exists`);
    }
    if (this.taken(redirect)) {
      throw new RedirectSourceTakenError(
        describeRedirectSource(redirect.source),
      );
    }
    this.store(redirect);
  }

  async save(redirect: Redirect): Promise<void> {
    const current = this.redirects.get(redirect.id);
    if (!current || current.tenantId !== redirect.tenantId) {
      throw new RedirectNotFoundError(redirect.id);
    }
    if (this.taken(redirect)) {
      throw new RedirectSourceTakenError(
        describeRedirectSource(redirect.source),
      );
    }
    this.store(redirect);
  }

  async findById(
    tenantId: string,
    redirectId: string,
  ): Promise<Redirect | null> {
    const found = this.redirects.get(redirectId);
    return found && found.tenantId === tenantId ? found : null;
  }

  async findBySource(
    tenantId: string,
    siteId: string,
    source: RedirectSource,
  ): Promise<Redirect | null> {
    const key = sourceKey(siteId, source);
    return (
      [...this.redirects.values()].find(
        (rule) =>
          rule.tenantId === tenantId &&
          sourceKey(rule.siteId, rule.source) === key,
      ) ?? null
    );
  }

  async listBySite(tenantId: string, siteId: string): Promise<Redirect[]> {
    this.listBySiteCalls += 1;
    return [...this.redirects.values()].filter(
      (rule) => rule.tenantId === tenantId && rule.siteId === siteId,
    );
  }

  async listPage(
    tenantId: string,
    siteId: string,
    filter: RedirectListFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Redirect>> {
    const search = filter.search?.trim().toLowerCase();
    const matching = (await this.listBySite(tenantId, siteId))
      .filter((rule) => {
        if (filter.origin && rule.origin !== filter.origin) return false;
        if (filter.needsATarget && !rule.needsATarget) return false;
        if (!search) return true;
        const target = rule.target?.kind === 'url' ? rule.target.url : '';
        return `${describeRedirectSource(rule.source)} ${target}`
          .toLowerCase()
          .includes(search);
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize),
      total: matching.length,
    };
  }

  async countBySite(tenantId: string, siteId: string): Promise<number> {
    return (await this.listBySite(tenantId, siteId)).length;
  }

  async delete(tenantId: string, redirectId: string): Promise<void> {
    const found = this.redirects.get(redirectId);
    if (found && found.tenantId === tenantId) {
      this.redirects.delete(redirectId);
      this.owners.delete(sourceKey(found.siteId, found.source));
    }
  }

  async addHits(
    entries: readonly {
      tenantId: string;
      redirectId: string;
      hits: number;
      at: Date;
    }[],
  ): Promise<void> {
    for (const entry of entries) {
      const found = this.redirects.get(entry.redirectId);
      if (found && found.tenantId === entry.tenantId) {
        found.registerHits(entry.hits, entry.at);
      }
    }
  }
}

export class InMemoryMissingPathRepository implements MissingPathRepositoryPort {
  private readonly paths = new Map<string, MissingPath>();
  private sequence = 0;

  private key(siteId: string, path: string): string {
    return `${siteId}\0${path}`;
  }

  async record(
    entries: readonly {
      tenantId: string;
      siteId: string;
      path: string;
      hits: number;
      at: Date;
    }[],
  ): Promise<void> {
    for (const entry of entries) {
      const key = this.key(entry.siteId, entry.path);
      const known = this.paths.get(key);
      if (known) {
        known.hits += entry.hits;
        if (entry.at > known.lastSeenAt) known.lastSeenAt = entry.at;
      } else {
        this.sequence += 1;
        this.paths.set(key, {
          id: `missing-${this.sequence}`,
          tenantId: entry.tenantId,
          siteId: entry.siteId,
          path: entry.path,
          hits: entry.hits,
          firstSeenAt: entry.at,
          lastSeenAt: entry.at,
          dismissed: false,
        });
      }
    }
  }

  async list(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<MissingPath>> {
    const matching = [...this.paths.values()]
      .filter(
        (row) =>
          row.tenantId === tenantId && row.siteId === siteId && !row.dismissed,
      )
      .sort((a, b) => b.hits - a.hits);
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      items: matching.slice(start, start + pagination.pageSize),
      total: matching.length,
    };
  }

  async dismiss(tenantId: string, missingPathId: string): Promise<void> {
    for (const row of this.paths.values()) {
      if (row.tenantId === tenantId && row.id === missingPathId) {
        row.dismissed = true;
      }
    }
  }

  async clear(tenantId: string, siteId: string, path: string): Promise<void> {
    const key = this.key(siteId, path);
    if (this.paths.get(key)?.tenantId === tenantId) this.paths.delete(key);
  }

  /** The addresses held, hidden ones too — what a spec asks to see that the list does not say. */
  all(): MissingPath[] {
    return [...this.paths.values()];
  }
}

export class FakeRedirectTraffic implements RedirectTrafficPort {
  readonly hits: { tenantId: string; redirectId: string }[] = [];
  readonly misses: { tenantId: string; siteId: string; path: string }[] = [];

  recordHit(input: { tenantId: string; redirectId: string }): void {
    this.hits.push(input);
  }

  recordMiss(input: { tenantId: string; siteId: string; path: string }): void {
    this.misses.push(input);
  }
}
