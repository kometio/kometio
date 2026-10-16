import type { TestingModuleBuilder } from '@nestjs/testing';
import type { SiteRepositoryPort } from '@kometio/ports';
import { SITE_REPOSITORY } from '../app/adapters/port.tokens';
import {
  DEPLOYMENT_SITE_RESOLVER,
  DeploymentSiteResolver,
} from '../app/sites/deployment-site.resolver';

/**
 * The site a spec says its deployment serves.
 *
 * A route that is the deployment's own, with no site in the request, asks the
 * resolver which site that is: `DEFAULT_SITE_ID`, or else the tenant's only
 * site. An integration spec makes its sites after the app has started, and the
 * tenant has the sites of every other spec's besides, so the resolver would
 * refuse to pick. This pins it to the one the spec made, once it has: set
 * `siteId`, then ask.
 */
export class ServedSite {
  siteId = '';

  /** For `overrideProviders`. */
  pinIn(builder: TestingModuleBuilder): TestingModuleBuilder {
    return builder.overrideProvider(DEPLOYMENT_SITE_RESOLVER).useFactory({
      factory: (siteRepository: SiteRepositoryPort) => ({
        require: (tenantId: string) =>
          new DeploymentSiteResolver(siteRepository, this.siteId).require(
            tenantId,
          ),
      }),
      inject: [SITE_REPOSITORY],
    });
  }
}
