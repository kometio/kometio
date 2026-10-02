import { describe, expect, it } from 'vitest';
import {
  Site,
  SiteLayoutSectionNotFoundError,
  SiteNotFoundError,
} from '@kometio/domain-core';
import { getOrCreateSiteLayoutSection } from './get-or-create-site-layout-section.use-case';
import { saveSiteLayoutSectionDraft } from './save-site-layout-section-draft.use-case';
import { publishSiteLayoutSection } from './publish-site-layout-section.use-case';
import { listSiteLayoutSectionVersions } from './list-site-layout-section-versions.use-case';
import { rollbackSiteLayoutSectionToVersion } from './rollback-site-layout-section-to-version.use-case';
import { updateSiteLayoutSectionSticky } from './update-site-layout-section-sticky.use-case';
import {
  InMemorySiteLayoutSectionRepository,
  InMemorySiteLayoutSectionVersionRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';

describe('site layout section lifecycle: get-or-create -> draft -> publish -> rollback', () => {
  const tenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  function setup() {
    const siteRepository = new InMemorySiteRepository();
    const siteLayoutSectionRepository =
      new InMemorySiteLayoutSectionRepository();
    const siteLayoutSectionVersionRepository =
      new InMemorySiteLayoutSectionVersionRepository();
    return {
      siteRepository,
      siteLayoutSectionRepository,
      siteLayoutSectionVersionRepository,
    };
  }

  async function seedSite(
    siteRepository: InMemorySiteRepository,
    overrides: Partial<Parameters<typeof Site.fromProps>[0]> = {},
  ) {
    const site = buildSite({
      tenantId,
      name: 'Sito di prova',
      enabledLocales: ['it', 'en'],
      createdAt: new Date(),
      ...overrides,
    });
    await siteRepository.add(site);
    return site;
  }

  it('getOrCreate creates an empty draft the first time, then reuses it', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const first = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    expect(first.status).toBe('draft');
    expect(first.content).toEqual([]);

    const second = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    expect(second.id).toBe(first.id);
  });

  it('getOrCreate throws when the site does not exist', async () => {
    const deps = setup();

    await expect(
      getOrCreateSiteLayoutSection(deps, {
        tenantId,
        siteId: 'missing-site',
        locale: 'it',
        kind: 'header',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('getOrCreate copies the default locale content when enabling a new locale', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const defaultHeader = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    await saveSiteLayoutSectionDraft(deps, {
      tenantId,
      id: defaultHeader.id,
      content: [{ type: 'Header', props: { title: 'Ciao' } }],
      actorUserId: null,
    });

    const enHeader = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'en',
      kind: 'header',
    });

    expect(enHeader.content).toEqual([
      { type: 'Header', props: { title: 'Ciao' } },
    ]);
    expect(enHeader.id).not.toBe(defaultHeader.id);
  });

  it('getOrCreate starts empty for a new locale when the default has no section yet', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);

    const enHeader = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'en',
      kind: 'header',
    });

    expect(enHeader.content).toEqual([]);
  });

  it('runs the full draft -> publish -> rollback cycle without destructive overwrites', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const section = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });

    const afterFirstDraft = await saveSiteLayoutSectionDraft(deps, {
      tenantId,
      id: section.id,
      content: [{ type: 'Header', props: { v: 1 } }],
      actorUserId: 'user-1',
    });
    expect(afterFirstDraft.content).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const published = await publishSiteLayoutSection(deps, {
      tenantId,
      id: section.id,
    });
    expect(published.status).toBe('published');
    expect(published.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const afterSecondDraft = await saveSiteLayoutSectionDraft(deps, {
      tenantId,
      id: section.id,
      content: [{ type: 'Header', props: { v: 2 } }],
      actorUserId: 'user-1',
    });
    expect(afterSecondDraft.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);

    const versions = await listSiteLayoutSectionVersions(deps, {
      tenantId,
      id: section.id,
    });
    expect(versions).toHaveLength(2); // draft v1, draft v2
    const firstVersion = versions[0];

    const afterRollback = await rollbackSiteLayoutSectionToVersion(deps, {
      tenantId,
      id: section.id,
      versionId: firstVersion.id,
      actorUserId: 'user-1',
    });
    expect(afterRollback.content).toEqual(firstVersion.content);
    expect(afterRollback.publishedContent).toEqual([
      { type: 'Header', props: { v: 1 } },
    ]);
    expect(afterRollback.status).toBe('published');

    const versionsAfterRollback = await listSiteLayoutSectionVersions(deps, {
      tenantId,
      id: section.id,
    });
    expect(versionsAfterRollback).toHaveLength(3);
  });

  it('updateSticky flips the flag immediately without creating a version or touching content', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const section = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    expect(section.sticky).toBe(false);
    await saveSiteLayoutSectionDraft(deps, {
      tenantId,
      id: section.id,
      content: [{ type: 'Nav', props: {} }],
      actorUserId: null,
    });

    const updated = await updateSiteLayoutSectionSticky(deps, {
      tenantId,
      id: section.id,
      sticky: true,
    });

    expect(updated.sticky).toBe(true);
    expect(updated.content).toEqual([{ type: 'Nav', props: {} }]);
    expect(updated.status).toBe('draft');
    const versions = await listSiteLayoutSectionVersions(deps, {
      tenantId,
      id: section.id,
    });
    expect(versions).toHaveLength(1); // only the draft save above, not the sticky update
  });

  it('updateSticky throws for a section that does not exist', async () => {
    const deps = setup();

    await expect(
      updateSiteLayoutSectionSticky(deps, {
        tenantId,
        id: 'missing-section',
        sticky: true,
      }),
    ).rejects.toThrow(SiteLayoutSectionNotFoundError);
  });

  it('getOrCreate copies sticky from the default locale section, same as content', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const defaultHeader = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    await updateSiteLayoutSectionSticky(deps, {
      tenantId,
      id: defaultHeader.id,
      sticky: true,
    });

    const enHeader = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'en',
      kind: 'header',
    });

    expect(enHeader.sticky).toBe(true);
  });

  it('never leaks sections or versions across tenants', async () => {
    const deps = setup();
    await seedSite(deps.siteRepository);
    const section = await getOrCreateSiteLayoutSection(deps, {
      tenantId,
      siteId: 'site-1',
      locale: 'it',
      kind: 'header',
    });
    await saveSiteLayoutSectionDraft(deps, {
      tenantId,
      id: section.id,
      content: [{ type: 'Header', props: {} }],
      actorUserId: null,
    });

    const foundFromOtherTenant =
      await deps.siteLayoutSectionRepository.findById(
        otherTenantId,
        section.id,
      );
    expect(foundFromOtherTenant).toBeNull();

    const versionsFromOtherTenant = await listSiteLayoutSectionVersions(deps, {
      tenantId: otherTenantId,
      id: section.id,
    });
    expect(versionsFromOtherTenant).toHaveLength(0);
  });
});
