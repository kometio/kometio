import {
  DeploymentAlreadySetUpError,
  SiteArchiveUnavailableError,
} from '@kometio/domain-core';
import type { DeploymentBootstrapPort, SiteImportPort } from '@kometio/ports';

export interface OpenSiteArchiveDeps {
  deploymentBootstrapPort: Pick<DeploymentBootstrapPort, 'hasBeenSetUp'>;
  /** `null` where nothing can open an archive: a database that is not the image's own. */
  siteImport: SiteImportPort | null;
}

/**
 * Hands a site archive to be opened instead of making a new site on the
 * first-run screen (docs/adr/0106). Only into a deployment that has no site: one
 * that has one is not a place to open another, and says so before a byte of the
 * archive is read. It resolves when the archive has been accepted, which is
 * before it is opened.
 */
export async function openSiteArchive(
  deps: OpenSiteArchiveDeps,
  content: AsyncIterable<Uint8Array>,
): Promise<void> {
  if (await deps.deploymentBootstrapPort.hasBeenSetUp()) {
    throw new DeploymentAlreadySetUpError();
  }
  if (deps.siteImport === null) throw new SiteArchiveUnavailableError();
  await deps.siteImport.import(content);
}
