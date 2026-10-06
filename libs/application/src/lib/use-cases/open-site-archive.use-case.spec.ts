import {
  DeploymentAlreadySetUpError,
  SiteArchiveUnavailableError,
} from '@kometio/domain-core';
import type { SiteImportPort } from '@kometio/ports';
import { openSiteArchive } from './open-site-archive.use-case';

async function* archive() {
  yield Buffer.from('the archive');
}

function fakeImport(): SiteImportPort & { import: ReturnType<typeof vi.fn> } {
  return {
    import: vi.fn().mockResolvedValue(undefined),
    lastImportFailure: vi.fn().mockResolvedValue(null),
  };
}

describe('openSiteArchive', () => {
  it('hands the archive over, as it is, to a deployment that has no site', async () => {
    const siteImport = fakeImport();
    const content = archive();

    await openSiteArchive(
      {
        deploymentBootstrapPort: { hasBeenSetUp: async () => false },
        siteImport,
      },
      content,
    );

    expect(siteImport.import).toHaveBeenCalledWith(content);
  });

  it('refuses a deployment that has a site, before any of the archive is read', async () => {
    const siteImport = fakeImport();

    await expect(
      openSiteArchive(
        {
          deploymentBootstrapPort: { hasBeenSetUp: async () => true },
          siteImport,
        },
        archive(),
      ),
    ).rejects.toBeInstanceOf(DeploymentAlreadySetUpError);
    expect(siteImport.import).not.toHaveBeenCalled();
  });

  it('says there is nothing to open it with where there is no launcher', async () => {
    await expect(
      openSiteArchive(
        {
          deploymentBootstrapPort: { hasBeenSetUp: async () => false },
          siteImport: null,
        },
        archive(),
      ),
    ).rejects.toBeInstanceOf(SiteArchiveUnavailableError);
  });

  it('lets what the archive is refused for through, as it is', async () => {
    const siteImport = fakeImport();
    const refusal = new Error('this is not a Kometio site archive');
    siteImport.import.mockRejectedValue(refusal);

    await expect(
      openSiteArchive(
        {
          deploymentBootstrapPort: { hasBeenSetUp: async () => false },
          siteImport,
        },
        archive(),
      ),
    ).rejects.toBe(refusal);
  });
});
