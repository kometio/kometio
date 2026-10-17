import { Logger } from '@nestjs/common';
import { InvalidThemeNameError, SiteNotFoundError } from '@kometio/domain-core';
import type {
  SiteThemeBlockStylesPort,
  ThemeCatalogPort,
} from '@kometio/ports';
import {
  DEFAULT_COOKIE_BANNER_SETTINGS,
  DEFAULT_VARIANT,
} from '@kometio/shared-types';
import {
  buildSite,
  InMemoryAuditLog,
  InMemoryFormSubmissionRepository,
  InMemoryMediaRepository,
  InMemoryMediaStorage,
  InMemorySiteRepository,
} from '@kometio/testing';
import { AuditRecorder } from '../audit/audit-recorder';
import { DeploymentSiteResolver } from './deployment-site.resolver';
import { SitesController } from './sites.controller';

describe('SitesController (unit)', () => {
  let siteRepository: InMemorySiteRepository;
  let siteThemeBlockStylesRepository: jest.Mocked<SiteThemeBlockStylesPort>;
  let themeCatalog: jest.Mocked<ThemeCatalogPort>;
  let auditLog: InMemoryAuditLog;
  let controller: SitesController;

  beforeEach(async () => {
    // One site, `site-1`; every "not found" case asks for `missing`. Spied
    // on after it is stored, so a test can tell whether the controller
    // saved: the stored site is the very object the controller changes, so
    // reading it back would look updated even if nothing was saved.
    siteRepository = new InMemorySiteRepository();
    await siteRepository.add(buildSite({ name: 'Il mio sito' }));
    jest.spyOn(siteRepository, 'listByTenant');
    jest.spyOn(siteRepository, 'save');
    siteThemeBlockStylesRepository = {
      listBySite: jest.fn().mockResolvedValue({}),
      upsert: jest.fn(),
    };
    themeCatalog = {
      listAvailableThemes: jest.fn().mockResolvedValue([
        { name: 'classic', uploaded: false },
        { name: 'docs-showcase', uploaded: false },
      ]),
    };
    // A real resolver over the same repository, not a mock of its
    // own: its whole behaviour is which repository call it makes and what
    // it does with the result, so mocking it would test nothing.
    auditLog = new InMemoryAuditLog();
    controller = new SitesController(
      {
        siteRepository,
        formSubmissionRepository: new InMemoryFormSubmissionRepository(),
        siteThemeBlockStylesRepository,
        themeCatalog,
        deploymentSiteResolver: new DeploymentSiteResolver(
          siteRepository,
          undefined,
        ),
        mediaRepository: new InMemoryMediaRepository(),
        mediaStorage: new InMemoryMediaStorage(),
      },
      new AuditRecorder(auditLog),
    );
  });

  it('findCurrent returns the site this deployment edits, without being given an id', async () => {
    const dto = await controller.findCurrent('tenant-1');

    expect(siteRepository.listByTenant).toHaveBeenCalledWith('tenant-1');
    expect(dto.id).toBe('site-1');
  });

  it('findById throws SiteNotFoundError (a 404) when no site matches', async () => {
    await expect(controller.findById('tenant-1', 'missing')).rejects.toThrow(
      SiteNotFoundError,
    );
  });

  it('findById returns the site props, with themeTokens composed from the block styles repository', async () => {
    siteThemeBlockStylesRepository.listBySite.mockResolvedValue({
      Button: { default: { base: { borderRadius: '9999px' } } },
    });

    const result = await controller.findById('tenant-1', 'site-1');

    expect(result.name).toBe('Il mio sito');
    expect(result.themeTokens).toEqual({
      blockStyles: {
        Button: { default: { base: { borderRadius: '9999px' } } },
      },
    });
  });

  // The mapping to a 404 now happens in the global HttpExceptionFilter
  // (see http-exception.filter.spec.ts), not here — the controller's own
  // contract is just to let the domain error propagate unwrapped.
  it('updateBusinessInfo propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateBusinessInfo('tenant-1', 'admin-1', 'missing', {
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateBusinessInfo saves the updated site', async () => {
    const result = await controller.updateBusinessInfo(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        businessAddress: {
          street: 'Via Roma 1',
          postalCode: '20121',
          city: 'Milano',
          country: 'IT',
        },
        businessPhone: '+39 02 1234567',
        businessEmail: null,
        businessType: 'Restaurant',
        openingHours: null,
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.businessAddress).toEqual({
      street: 'Via Roma 1',
      postalCode: '20121',
      city: 'Milano',
      country: 'IT',
    });
  });

  it('updateGeneralSettings propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateGeneralSettings('tenant-1', 'admin-1', 'missing', {
        name: 'x',
        domain: null,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateGeneralSettings saves the updated site', async () => {
    const result = await controller.updateGeneralSettings(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        name: 'Il mio ristorante',
        domain: 'ilmioristorante.it',
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.name).toBe('Il mio ristorante');
    expect(result.domain).toBe('ilmioristorante.it');
  });

  it('updateSeoSettings propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateSeoSettings('tenant-1', 'admin-1', 'missing', {
        searchEngineIndexingEnabled: true,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateSeoSettings saves the updated site', async () => {
    const result = await controller.updateSeoSettings(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        searchEngineIndexingEnabled: true,
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.searchEngineIndexingEnabled).toBe(true);
  });

  it('updateFormSubmissionRetention propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateFormSubmissionRetention(
        'tenant-1',
        'admin-1',
        'missing',
        {
          formSubmissionRetentionDays: 30,
        },
      ),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateFormSubmissionRetention saves the updated site', async () => {
    const result = await controller.updateFormSubmissionRetention(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        formSubmissionRetentionDays: 30,
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.formSubmissionRetentionDays).toBe(30);
  });

  it('listAvailableThemes returns the theme catalog', async () => {
    const result = await controller.listAvailableThemes();

    expect(result).toEqual([
      { name: 'classic', uploaded: false },
      { name: 'docs-showcase', uploaded: false },
    ]);
  });

  it('updateThemePackage propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateThemePackage('tenant-1', 'admin-1', 'missing', {
        themeName: 'classic',
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateThemePackage rejects a themeName not in the catalog', async () => {
    await expect(
      controller.updateThemePackage('tenant-1', 'admin-1', 'site-1', {
        themeName: 'not-bundled',
      }),
    ).rejects.toThrow(InvalidThemeNameError);
    expect(siteRepository.save).not.toHaveBeenCalled();
  });

  it('updateThemePackage saves the updated site', async () => {
    const result = await controller.updateThemePackage(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        themeName: 'docs-showcase',
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.themeName).toBe('docs-showcase');
  });

  it('updateThemeSettings propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateThemeSettings('tenant-1', 'admin-1', 'missing', {
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        customCss: null,
        contentWidth: null,
        headScript: null,
        bodyScript: null,
        faviconUrl: null,
        uploadedFont: null,
        overridesEnabled: true,
        motionEnabled: true,
        allowedTrackerDomains: [],
        trackerScripts: [],
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateThemeSettings saves the updated site', async () => {
    const result = await controller.updateThemeSettings(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        primaryColor: '#18181b',
        secondaryColor: null,
        fontFamily: 'inter',
        customCss: null,
        contentWidth: null,
        headScript: null,
        bodyScript: null,
        faviconUrl: null,
        uploadedFont: null,
        overridesEnabled: true,
        motionEnabled: true,
        allowedTrackerDomains: [],
        trackerScripts: [],
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.themePrimaryColor).toBe('#18181b');
    expect(result.themeFontFamily).toBe('inter');
  });

  it('updateCookieBannerSettings propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateCookieBannerSettings('tenant-1', 'admin-1', 'missing', {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });

  it('updateCookieBannerSettings saves the updated site', async () => {
    const result = await controller.updateCookieBannerSettings(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
        position: 'bottom-right',
      },
    );

    expect(siteRepository.save).toHaveBeenCalled();
    expect(result.cookieBannerSettings.enabled).toBe(true);
    expect(result.cookieBannerSettings.position).toBe('bottom-right');
  });

  it('updateThemeTokens propagates SiteNotFoundError, unwrapped', async () => {
    await expect(
      controller.updateThemeTokens('tenant-1', 'admin-1', 'missing', {
        blockType: 'Button',
        variant: DEFAULT_VARIANT,
        style: { base: { borderRadius: '6px' } },
      }),
    ).rejects.toThrow(SiteNotFoundError);
    expect(siteThemeBlockStylesRepository.upsert).not.toHaveBeenCalled();
  });

  it('updateThemeTokens upserts the override for only the block type given', async () => {
    siteThemeBlockStylesRepository.listBySite.mockResolvedValue({
      Button: {
        default: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
      },
    });

    const result = await controller.updateThemeTokens(
      'tenant-1',
      'admin-1',
      'site-1',
      {
        blockType: 'Button',
        variant: DEFAULT_VARIANT,
        style: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
      },
    );

    expect(siteThemeBlockStylesRepository.upsert).toHaveBeenCalledWith(
      'tenant-1',
      'site-1',
      'Button',
      DEFAULT_VARIANT,
      { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
    );
    expect(result.themeTokens).toEqual({
      blockStyles: {
        Button: {
          default: { base: { borderRadius: '9999px', paddingX: '1.5rem' } },
        },
      },
    });
  });

  describe('the activity log', () => {
    it('says which part of the settings changed and who changed it, and not the values', async () => {
      await controller.updateGeneralSettings('tenant-1', 'admin-1', 'site-1', {
        name: 'Il mio ristorante',
        domain: 'ilmioristorante.it',
      });

      expect(auditLog.events).toEqual([
        {
          tenantId: 'tenant-1',
          actorUserId: 'admin-1',
          action: 'site.settings_changed',
          targetId: 'site-1',
          detail: { section: 'general' },
        },
      ]);
      expect(JSON.stringify(auditLog.events)).not.toContain('ilmioristorante');
    });

    it('calls what changes how the site looks and runs a change of theme', async () => {
      await controller.updateThemePackage('tenant-1', 'admin-1', 'site-1', {
        themeName: 'classic',
      });

      expect(auditLog.events).toMatchObject([
        { action: 'site.theme_changed', detail: { section: 'theme-package' } },
      ]);
    });

    it('records nothing for a change that was refused', async () => {
      await expect(
        controller.updateGeneralSettings('tenant-1', 'admin-1', 'missing', {
          name: 'x',
          domain: null,
        }),
      ).rejects.toThrow(SiteNotFoundError);

      expect(auditLog.events).toEqual([]);
    });

    it('does not fail the change when the log cannot be written', async () => {
      auditLog.failEveryWriteWith(new Error('connection lost'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const result = await controller.updateGeneralSettings(
        'tenant-1',
        'admin-1',
        'site-1',
        { name: 'Ancora qui', domain: null },
      );

      expect(result.name).toBe('Ancora qui');
    });
  });
});
