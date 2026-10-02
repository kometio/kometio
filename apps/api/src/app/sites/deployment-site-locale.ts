import { Logger } from '@nestjs/common';
import type { DeploymentLocalePort } from '@kometio/ports';
import type { DeploymentSiteResolver } from './deployment-site.resolver';

/**
 * The language of the site this deployment serves, for the emails that
 * follow it (docs/adr/0100), answered by the same resolver that says which
 * site that is.
 *
 * It never fails: a deployment with no site, or one that cannot tell which
 * of several it is, makes the resolver throw — and a password reset that
 * threw only for accounts that exist would tell whoever asked which ones do.
 * `null` sends the email in English, and the fault is in the log here as it
 * is, loudly, on every editor screen that asks for the site.
 */
export class DeploymentSiteLocale implements DeploymentLocalePort {
  private readonly logger = new Logger(DeploymentSiteLocale.name);

  constructor(private readonly resolver: DeploymentSiteResolver) {}

  async defaultLocale(tenantId: string): Promise<string | null> {
    try {
      return (await this.resolver.require(tenantId)).defaultLocale;
    } catch (error: unknown) {
      this.logger.warn(
        `No site language to write an email in; using English. ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
