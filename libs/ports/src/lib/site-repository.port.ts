import type { Site } from '@kometio/domain-core';

/**
 * Every method requires tenantId explicitly: no query can "forget" its
 * per-tenant scoping at the Port's signature level, even though the
 * concrete adapter also relies on RLS as a second barrier.
 */
export interface SiteRepositoryPort {
  findByDomain(tenantId: string, domain: string): Promise<Site | null>;
  findById(tenantId: string, id: string): Promise<Site | null>;
  /**
   * Every site this tenant owns. In practice that is exactly one — a
   * deployment serves a single site (docs/adr/0032) — and the caller that
   * needs this (`DeploymentSiteResolver`) asks precisely so it can tell
   * "the one" from "more than one" rather than assume either.
   */
  listByTenant(tenantId: string): Promise<Site[]>;
  /** An existing site, written back — never created again (sites are created by the first-run setup). */
  save(site: Site): Promise<void>;
}
