import { describe, expect, it } from 'vitest';
import {
  SiteLayoutSection,
  SiteLayoutSectionNotFoundError,
  SiteLayoutSectionVersionNotFoundError,
} from '@kometio/domain-core';
import { saveSiteLayoutSectionDraft } from './save-site-layout-section-draft.use-case';
import { publishSiteLayoutSection } from './publish-site-layout-section.use-case';
import { rollbackSiteLayoutSectionToVersion } from './rollback-site-layout-section-to-version.use-case';
import {
  InMemorySiteLayoutSectionRepository,
  InMemorySiteLayoutSectionVersionRepository,
} from '@kometio/testing';

const tenantId = 'tenant-1';

function setupSiteLayoutSection() {
  const siteLayoutSectionRepository = new InMemorySiteLayoutSectionRepository();
  const siteLayoutSectionVersionRepository =
    new InMemorySiteLayoutSectionVersionRepository();
  return { siteLayoutSectionRepository, siteLayoutSectionVersionRepository };
}

describe('use-case error paths', () => {
  it('saveSiteLayoutSectionDraft throws SiteLayoutSectionNotFoundError for a nonexistent section', async () => {
    const deps = setupSiteLayoutSection();

    await expect(
      saveSiteLayoutSectionDraft(deps, {
        tenantId,
        id: 'does-not-exist',
        content: [],
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('publishSiteLayoutSection throws SiteLayoutSectionNotFoundError for a nonexistent section', async () => {
    const deps = setupSiteLayoutSection();

    await expect(
      publishSiteLayoutSection(deps, { tenantId, id: 'does-not-exist' }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('rollbackSiteLayoutSectionToVersion throws SiteLayoutSectionNotFoundError for a nonexistent section', async () => {
    const deps = setupSiteLayoutSection();

    await expect(
      rollbackSiteLayoutSectionToVersion(deps, {
        tenantId,
        id: 'does-not-exist',
        versionId: 'irrelevant',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('rollbackSiteLayoutSectionToVersion throws SiteLayoutSectionVersionNotFoundError for a nonexistent version', async () => {
    const deps = setupSiteLayoutSection();
    const section = SiteLayoutSection.create({
      id: 'section-1',
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    await deps.siteLayoutSectionRepository.add(section);

    await expect(
      rollbackSiteLayoutSectionToVersion(deps, {
        tenantId,
        id: section.id,
        versionId: 'does-not-exist',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(SiteLayoutSectionVersionNotFoundError);
  });
});
