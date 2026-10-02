import { Injectable } from '@nestjs/common';
import type { Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';

/**
 * Which site this deployment edits. The counterpart to
 * `DeploymentTenantResolver`, and it exists for the same reason: the value
 * is a deployment-level fact, but it is only knowable once the first-run
 * wizard has run.
 *
 * Before this, apps/editor-app got it from `VITE_DEFAULT_SITE_ID` — baked
 * into its JavaScript bundle at image build time. That could not work
 * alongside a wizard that creates the site with a fresh id at runtime: the
 * two never agreed, and every editor screen queried a site that did not
 * exist. A build-time constant cannot name a row created after the build.
 *
 * Two sources, in the same order and for the same reasons as the tenant
 * resolver's:
 *
 * 1. `DEFAULT_SITE_ID`, when set — which is also what keeps the one
 *    topology docs/adr/0032 allows working: several sites in one database,
 *    each served by its own container, each pinning the one it serves.
 * 2. Otherwise the tenant's only site.
 *
 * Unlike the tenant resolver, this one does not cache. That resolver is on
 * the public request path, where a lookup per page render would be real
 * cost; this one answers `GET /sites/current`, which an editor asks once
 * when it boots. Not caching is not a compromise here — it removes the
 * need for a `refresh()` after the wizard, and with it the whole class of
 * bugs where a process keeps answering with a stale miss.
 */
@Injectable()
export class DeploymentSiteResolver {
  constructor(
    private readonly siteRepository: SiteRepositoryPort,
    private readonly envSiteId: string | undefined,
  ) {}

  /**
   * The site this deployment edits. Throws rather than returning null:
   * every caller is behind a session, and a session cannot exist before
   * the wizard has created both the tenant and its site — so "no site" here
   * is a real fault, not a not-set-up-yet state a visitor can reach.
   *
   * Every failure below is a plain `Error`, deliberately not
   * `SiteNotFoundError`. That one maps to a 404
   * (`domain-error-http-mapping.ts`), which would tell whoever asked that
   * they requested something wrong — but they requested nothing: this
   * endpoint takes no id. All three cases are the deployment being
   * misconfigured, so they belong in the server's log as a 500, with the
   * detail there rather than echoed back to the browser.
   */
  async require(tenantId: string): Promise<Site> {
    if (this.envSiteId) {
      const pinned = await this.siteRepository.findById(
        tenantId,
        this.envSiteId,
      );
      // A pinned id that resolves to nothing is a misconfiguration worth
      // saying out loud — silently falling back to "the only site" would
      // hand an operator who mistyped it someone else's site.
      if (!pinned) {
        throw new Error(
          `DEFAULT_SITE_ID is set to ${this.envSiteId}, which is not a site ` +
            'this deployment can see. Correct it, or unset it to use the ' +
            "tenant's only site.",
        );
      }
      return pinned;
    }

    const sites = await this.siteRepository.listByTenant(tenantId);
    if (sites.length > 1) {
      throw new Error(
        'More than one site found for this tenant. A Kometio deployment ' +
          'serves a single site (docs/adr/0032) — set DEFAULT_SITE_ID to ' +
          'say which one this deployment edits.',
      );
    }
    const site = sites[0];
    if (!site) {
      throw new Error(
        'This tenant has no site. A deployment set up through the first-run ' +
          'wizard always has one — a tenant without a site means the row was ' +
          'removed, or the database was seeded partially.',
      );
    }
    return site;
  }
}

/**
 * Declared by `DeploymentSiteModule`, which every module that needs the
 * site this deployment edits imports — the sites screen, and the modules
 * that send an email in the site's language (docs/adr/0100).
 */
export const DEPLOYMENT_SITE_RESOLVER = Symbol('DEPLOYMENT_SITE_RESOLVER');
