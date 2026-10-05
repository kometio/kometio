import type { PageContent } from '@kometio/shared-types';

export interface BootstrapDeploymentInput {
  siteName: string;
  /** The starter home page created alongside the site — see BootstrapHomePage. */
  homePage: BootstrapHomePage;
  /** BCP-47, and the site's only enabled locale to start with. */
  defaultLocale: string;
  /**
   * The hostname the site is served on, as `sites.domain` holds it, or null
   * when it is to be set later. The public site finds a site by the request's
   * Host header, so a site without one is not found at any address.
   */
  domain: string | null;
  adminEmail: string;
  /** Already hashed by AuthPort — a plaintext password never reaches this port. */
  adminPasswordHash: string;
}

export interface BootstrapDeploymentResult {
  tenantId: string;
  siteId: string;
  userId: string;
}

/**
 * The site's first page, created published so that a deployment which has
 * just finished the wizard serves something instead of 404ing on its own
 * homepage. Its content is decided by the use case, not here and not by
 * the adapter: what a starter page should say is a product question, while
 * this port's job is only that the rows land in one transaction.
 */
export interface BootstrapHomePage {
  /** Locale of the single translation created — the site's default. */
  locale: string;
  slug: string;
  title: string;
  content: PageContent;
}

/**
 * The one write that happens before this deployment has a tenant at all —
 * the first-run wizard's own. It exists as its own port rather than as
 * three calls to the site/user repositories for two reasons.
 *
 * It has to be one transaction. A deployment left with a tenant but no
 * admin is unreachable: nobody can log in, and the wizard will not run
 * again because a tenant now exists. That is a bricked install, and it is
 * the exact failure a partial write produces.
 *
 * And every other repository takes a `tenantId` it can be scoped to
 * (see the port comments there) — this one cannot, because it is what
 * creates it. Keeping that single exception in a port of its own is what
 * lets the rule stay absolute everywhere else.
 */
export interface DeploymentBootstrapPort {
  /**
   * Whether this deployment has already been set up. The wizard's gate:
   * both the status the editor reads and the check the write itself
   * repeats, since anything else is a race between two people opening the
   * wizard at once.
   */
  hasBeenSetUp(): Promise<boolean>;

  /** Creates tenant, site and admin user together, or none of them. */
  bootstrap(
    input: BootstrapDeploymentInput,
  ): Promise<BootstrapDeploymentResult>;
}
