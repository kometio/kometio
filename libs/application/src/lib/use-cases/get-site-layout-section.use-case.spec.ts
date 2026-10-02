import { SiteLayoutSectionNotFoundError } from '@kometio/domain-core';
import {
  buildSiteLayoutSection,
  InMemorySiteLayoutSectionRepository,
} from '@kometio/testing';
import { describe, expect, it } from 'vitest';
import { getSiteLayoutSection } from './get-site-layout-section.use-case';

describe('getSiteLayoutSection', () => {
  it("finds the tenant's own header or footer by id", async () => {
    const siteLayoutSectionRepository =
      new InMemorySiteLayoutSectionRepository();
    await siteLayoutSectionRepository.add(buildSiteLayoutSection());

    const section = await getSiteLayoutSection(
      { siteLayoutSectionRepository },
      { tenantId: 'tenant-1', sectionId: 'section-1' },
    );

    expect(section.id).toBe('section-1');
  });

  it('says not found for another tenant’s section as for none', async () => {
    const siteLayoutSectionRepository =
      new InMemorySiteLayoutSectionRepository();
    await siteLayoutSectionRepository.add(buildSiteLayoutSection());

    await expect(
      getSiteLayoutSection(
        { siteLayoutSectionRepository },
        { tenantId: 'tenant-2', sectionId: 'section-1' },
      ),
    ).rejects.toBeInstanceOf(SiteLayoutSectionNotFoundError);
  });
});
