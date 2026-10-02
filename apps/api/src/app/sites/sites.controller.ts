import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  countSubmissionsOlderThan,
  getSite,
  listAvailableThemes,
  listSiteThemeBlockStyles,
  updateSiteBusinessInfo,
  updateSiteCookieBannerSettings,
  updateSiteFormSubmissionRetention,
  updateSiteGeneralSettings,
  updateSiteLocaleSettings,
  updateSiteSeoSettings,
  updateSiteThemePackage,
  updateSiteThemeSettings,
  updateSiteThemeTokens,
} from '@kometio/application';
import { type Site } from '@kometio/domain-core';
import {
  availableThemesResponseSchema,
  formSubmissionCountSchema,
  siteRecordSchema,
  type FormSubmissionCount,
  type SiteRecord,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type CountFormSubmissionsQuery,
  countFormSubmissionsQuerySchema,
  type UpdateBusinessInfoBody,
  updateBusinessInfoBodySchema,
  type UpdateGeneralSettingsBody,
  updateGeneralSettingsBodySchema,
  type UpdateLocaleSettingsBody,
  updateLocaleSettingsBodySchema,
  type UpdateSeoSettingsBody,
  updateSeoSettingsBodySchema,
  type UpdateFormSubmissionRetentionBody,
  updateFormSubmissionRetentionBodySchema,
  type UpdateThemeSettingsBody,
  updateThemeSettingsBodySchema,
  type UpdateThemeTokensBody,
  updateThemeTokensBodySchema,
  type UpdateCookieBannerSettingsBody,
  updateCookieBannerSettingsBodySchema,
  type UpdateThemePackageBody,
  updateThemePackageBodySchema,
} from './sites.schemas';
import { UuidParam } from '../uuid-param.decorator';
import { Allowed } from '../auth/allowed.decorator';
import type { SitesDeps } from './sites.deps';
import { SITES_DEPS } from './sites.tokens';
import { TenantId } from '../auth/session-identity.decorator';

@Controller('sites')
@UseGuards(SessionAuthGuard)
export class SitesController {
  constructor(@Inject(SITES_DEPS) private readonly deps: SitesDeps) {}

  @Get('themes/available')
  async listAvailableThemes() {
    return availableThemesResponseSchema.parse(
      await listAvailableThemes(this.deps),
    );
  }

  /**
   * The site this deployment edits — how apps/editor-app learns its id at
   * all, now that it no longer carries one baked into its bundle.
   *
   * Declared above `@Get(':id')` on purpose: Nest matches routes in
   * declaration order, so the parameterised one would otherwise swallow
   * "current" and look for a site with that literal id. Same reason
   * `themes/available` sits where it does.
   */
  @Get('current')
  async findCurrent(@TenantId() tenantId: string) {
    return this.toDto(await this.deps.deploymentSiteResolver.require(tenantId));
  }

  @Get(':id')
  async findById(@TenantId() tenantId: string, @UuidParam('id') id: string) {
    return this.toDto(await getSite(this.deps, { tenantId, siteId: id }));
  }

  @Patch(':id/business-info')
  @Allowed('configureSite')
  async updateBusinessInfo(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateBusinessInfoBodySchema))
    body: UpdateBusinessInfoBody,
  ) {
    const site = await updateSiteBusinessInfo(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  @Patch(':id/general-settings')
  @Allowed('configureSite')
  async updateGeneralSettings(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateGeneralSettingsBodySchema))
    body: UpdateGeneralSettingsBody,
  ) {
    const site = await updateSiteGeneralSettings(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  @Patch(':id/seo-settings')
  @Allowed('configureSite')
  async updateSeoSettings(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateSeoSettingsBodySchema))
    body: UpdateSeoSettingsBody,
  ) {
    const site = await updateSiteSeoSettings(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  @Patch(':id/form-submission-retention')
  @Allowed('configureSite')
  async updateFormSubmissionRetention(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateFormSubmissionRetentionBodySchema))
    body: UpdateFormSubmissionRetentionBody,
  ) {
    const site = await updateSiteFormSubmissionRetention(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  /**
   * How many answers a retention of this many days would delete at its
   * next clean-up — asked before the retention is saved, so the question
   * can say a number. Read-only, and the setting's own permission: what a
   * retention would delete is for the person who may set it.
   */
  @Get(':id/form-submissions/count')
  @Allowed('configureSite')
  async countSubmissionsOlderThan(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Query(new ZodValidationPipe(countFormSubmissionsQuerySchema))
    query: CountFormSubmissionsQuery,
  ): Promise<FormSubmissionCount> {
    return formSubmissionCountSchema.parse({
      count: await countSubmissionsOlderThan(this.deps, {
        tenantId,
        siteId: id,
        olderThanDays: query.olderThanDays,
      }),
    });
  }

  @Patch(':id/locale-settings')
  @Allowed('configureSite')
  async updateLocaleSettings(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateLocaleSettingsBodySchema))
    body: UpdateLocaleSettingsBody,
  ) {
    const site = await updateSiteLocaleSettings(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  // customCss/headScript/bodyScript below are injected verbatim into every
  // visitor's page (PageLayout.astro, ADR-0021, deliberately unsanitized —
  // meant for trusted admins only). Without this guard any authenticated
  // role, including the lowest ('editor'), could inject arbitrary script
  // served to the whole public site (security review 2026-08-25, critical).
  @Patch(':id/theme-settings')
  @Allowed('configureSite')
  async updateThemeSettings(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateThemeSettingsBodySchema))
    body: UpdateThemeSettingsBody,
  ) {
    const site = await updateSiteThemeSettings(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  // Tier 2 selection (docs/adr/0021/0042) — admin-gated for the same reason
  // as theme-settings above: which theme a site's visitors see is at least
  // as consequential as its style overrides.
  @Patch(':id/theme-package')
  @Allowed('configureSite')
  async updateThemePackage(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateThemePackageBodySchema))
    body: UpdateThemePackageBody,
  ) {
    const site = await updateSiteThemePackage(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  @Patch(':id/cookie-banner-settings')
  @Allowed('configureSite')
  async updateCookieBannerSettings(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateCookieBannerSettingsBodySchema))
    body: UpdateCookieBannerSettingsBody,
  ) {
    const site = await updateSiteCookieBannerSettings(this.deps, {
      tenantId,
      siteId: id,
      ...body,
    });
    return this.toDto(site);
  }

  @Patch(':id/theme-tokens')
  @Allowed('configureSite')
  async updateThemeTokens(
    @TenantId() tenantId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateThemeTokensBodySchema))
    body: UpdateThemeTokensBody,
  ) {
    const site = await updateSiteThemeTokens(this.deps, {
      tenantId,
      siteId: id,
      blockType: body.blockType,
      variant: body.variant,
      style: body.style,
    });
    return this.toDto(site);
  }

  /**
   * Every handler returning the site does so through this one point —
   * `themeTokens` is no longer part of `Site`/`SiteProps` (it lives in
   * `site_theme_block_styles`, docs/adr/0022's schema follow-up) but the
   * HTTP response contract stays unchanged so no consumer has to be touched
   * (editor-app overwrites its whole site cache with ANY of these mutation
   * responses — a DTO without `themeTokens` would make it disappear from
   * the cache until the next GET).
   *
   * Security review 2026-08-24, second backend pass: this used to do
   * `{ ...site.toProps(), themeTokens }` — a name that looked like a
   * whitelist without being one, exposing every field of Site unfiltered.
   * There is no sensitive field on Site today, but without an explicit
   * whitelist a future one would be exposed here automatically.
   */
  private async toDto(site: Site): Promise<SiteRecord> {
    const blockStyles = await listSiteThemeBlockStyles(this.deps, {
      tenantId: site.tenantId,
      siteId: site.id,
    });
    const props = site.toProps();
    // Validated, not just cast: siteRecordSchema is the same schema
    // apps/editor-app's sites-api-client.ts parses the response against —
    // a shape mismatch fails loudly here instead of silently reaching the
    // client as a structurally-wrong object.
    return siteRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      name: props.name,
      domain: props.domain,
      themeName: props.themeName,
      defaultLocale: props.defaultLocale,
      enabledLocales: props.enabledLocales,
      untranslatedPageFallback: props.untranslatedPageFallback,
      businessAddress: props.businessAddress,
      businessPhone: props.businessPhone,
      businessEmail: props.businessEmail,
      businessType: props.businessType,
      openingHours: props.openingHours,
      searchEngineIndexingEnabled: props.searchEngineIndexingEnabled,
      formSubmissionRetentionDays: props.formSubmissionRetentionDays,
      themePrimaryColor: props.themePrimaryColor,
      themeSecondaryColor: props.themeSecondaryColor,
      themeFontFamily: props.themeFontFamily,
      themeCustomCss: props.themeCustomCss,
      themeContentWidth: props.themeContentWidth,
      themeHeadScript: props.themeHeadScript,
      themeBodyScript: props.themeBodyScript,
      themeFaviconUrl: props.themeFaviconUrl,
      themeOverridesEnabled: props.themeOverridesEnabled,
      themeAllowedTrackerDomains: props.themeAllowedTrackerDomains,
      themeTrackerScripts: props.themeTrackerScripts,
      cookieBannerSettings: props.cookieBannerSettings,
      // .toISOString(), not the raw Date: siteRecordSchema's createdAt is a
      // string (the shape the client actually parses off the wire) —
      // validating a live Date object against it would fail even though
      // JSON.stringify would have serialized it to the same string anyway.
      createdAt: props.createdAt.toISOString(),
      themeTokens: { blockStyles },
    });
  }
}
