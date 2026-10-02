import type {
  BusinessAddress,
  CookieBannerSettings,
  OpeningHoursDay,
  ThemeSettings,
  TrackerDomainEntry,
  TrackerScriptEntry,
  UntranslatedPageFallback,
} from '@kometio/shared-types';
import { LocaleNotEnabledError } from '../errors';

export interface SiteProps {
  id: string;
  tenantId: string;
  name: string;
  domain: string | null;
  /** Tier 2 of docs/adr/0021's theming model (docs/adr/0042) — which bundled filesystem theme this site renders. Distinct from the Tier 1 theme* fields below. */
  themeName: string;
  defaultLocale: string;
  enabledLocales: string[];
  untranslatedPageFallback: UntranslatedPageFallback;
  businessAddress: BusinessAddress | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessType: string | null;
  openingHours: OpeningHoursDay[] | null;
  searchEngineIndexingEnabled: boolean;
  themePrimaryColor: string | null;
  themeSecondaryColor: string | null;
  themeFontFamily: string | null;
  themeCustomCss: string | null;
  themeContentWidth: string | null;
  themeHeadScript: string | null;
  themeBodyScript: string | null;
  themeFaviconUrl: string | null;
  themeOverridesEnabled: boolean;
  themeAllowedTrackerDomains: TrackerDomainEntry[];
  /** GDPR/privacy: `null` keeps every form_submissions row forever (default, unchanged from before this field existed). A positive integer is how many days a submission survives past its createdAt before the scheduled cleanup deletes it. */
  formSubmissionRetentionDays: number | null;
  /** Categorized tracker snippets (docs/adr/0039) — see themeSettings getter. */
  themeTrackerScripts: TrackerScriptEntry[];
  /** Cookie consent banner config (docs/adr/0039) — separate from ThemeSettings above: inert config, not admin-trusted raw HTML, so it lives behind its own non-admin-gated endpoint. */
  cookieBannerSettings: CookieBannerSettings;
  createdAt: Date;
}

export interface UpdateBusinessInfoInput {
  businessAddress: BusinessAddress | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessType: string | null;
  openingHours: OpeningHoursDay[] | null;
}

export interface UpdateGeneralSettingsInput {
  name: string;
  domain: string | null;
}

export interface UpdateThemePackageInput {
  themeName: string;
}

export interface UpdateSeoSettingsInput {
  searchEngineIndexingEnabled: boolean;
}

export interface UpdateLocaleSettingsInput {
  defaultLocale: string;
  enabledLocales: string[];
  untranslatedPageFallback: UntranslatedPageFallback;
}

export type UpdateThemeSettingsInput = ThemeSettings;

export interface UpdateFormSubmissionRetentionInput {
  /** `null` = keep forever. A number must be a positive integer (validated at the schema layer, apps/api/src/app/sites/sites.schemas.ts). */
  formSubmissionRetentionDays: number | null;
}

export type UpdateCookieBannerSettingsInput = CookieBannerSettings;

export class Site {
  private constructor(private props: SiteProps) {}

  static fromProps(props: SiteProps): Site {
    return new Site({ ...props });
  }

  toProps(): SiteProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get domain(): string | null {
    return this.props.domain;
  }

  get themeName(): string {
    return this.props.themeName;
  }

  get defaultLocale(): string {
    return this.props.defaultLocale;
  }

  get enabledLocales(): string[] {
    return this.props.enabledLocales;
  }

  /** Refuses a language this site does not offer, exactly as spelled. */
  assertLocaleEnabled(locale: string): void {
    if (!this.props.enabledLocales.includes(locale)) {
      throw new LocaleNotEnabledError(locale);
    }
  }

  /** What a visitor sees for a page not translated into their locale (Fase 5b, docs/adr/0017). */
  get untranslatedPageFallback(): UntranslatedPageFallback {
    return this.props.untranslatedPageFallback;
  }

  get businessAddress(): BusinessAddress | null {
    return this.props.businessAddress;
  }

  get businessPhone(): string | null {
    return this.props.businessPhone;
  }

  get businessEmail(): string | null {
    return this.props.businessEmail;
  }

  get businessType(): string | null {
    return this.props.businessType;
  }

  get openingHours(): OpeningHoursDay[] | null {
    return this.props.openingHours;
  }

  /**
   * Defaults to `false` (opt-in) at the DB column level for every site,
   * new or already seeded — a site mid-build shouldn't be indexed until its
   * owner deliberately decides it's ready, not the other way around.
   */
  get searchEngineIndexingEnabled(): boolean {
    return this.props.searchEngineIndexingEnabled;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** `null` = keep every form_submissions row forever. See UpdateFormSubmissionRetentionInput. */
  get formSubmissionRetentionDays(): number | null {
    return this.props.formSubmissionRetentionDays;
  }

  /**
   * Tier 1 of docs/adr/0021's two-tier theming model — live, DB-backed,
   * layered on top of whichever filesystem theme (Tier 2) is active for
   * the deployment. Every field is nullable and independent: a site that
   * hasn't touched this panel gets every value as `null`, meaning
   * "inherit the active theme's own default", not a hardcoded fallback
   * baked in here — `null` must stay meaningful all the way to
   * rendering, not get coerced into a default value at this layer.
   */
  get themeSettings(): ThemeSettings {
    return {
      primaryColor: this.props.themePrimaryColor,
      secondaryColor: this.props.themeSecondaryColor,
      fontFamily: this.props.themeFontFamily,
      customCss: this.props.themeCustomCss,
      contentWidth: this.props.themeContentWidth,
      headScript: this.props.themeHeadScript,
      bodyScript: this.props.themeBodyScript,
      faviconUrl: this.props.themeFaviconUrl,
      overridesEnabled: this.props.themeOverridesEnabled,
      allowedTrackerDomains: this.props.themeAllowedTrackerDomains,
      trackerScripts: this.props.themeTrackerScripts,
    };
  }

  /** Cookie consent banner config (docs/adr/0039) — enabled defaults to `false`, see DEFAULT_COOKIE_BANNER_SETTINGS. */
  get cookieBannerSettings(): CookieBannerSettings {
    return this.props.cookieBannerSettings;
  }

  /**
   * Used to render schema.org LocalBusiness markup (docs/adr/0014) — a
   * site with none of these set falls back to plain WebSite/WebPage, not
   * a broken LocalBusiness block.
   */
  hasBusinessInfo(): boolean {
    return (
      this.props.businessAddress !== null ||
      this.props.businessPhone !== null ||
      this.props.businessEmail !== null ||
      this.props.businessType !== null ||
      this.props.openingHours !== null
    );
  }

  updateBusinessInfo(input: UpdateBusinessInfoInput): void {
    this.props.businessAddress = input.businessAddress;
    this.props.businessPhone = input.businessPhone;
    this.props.businessEmail = input.businessEmail;
    this.props.businessType = input.businessType;
    this.props.openingHours = input.openingHours;
  }

  updateGeneralSettings(input: UpdateGeneralSettingsInput): void {
    this.props.name = input.name;
    this.props.domain = input.domain;
  }

  updateThemePackage(input: UpdateThemePackageInput): void {
    this.props.themeName = input.themeName;
  }

  updateSeoSettings(input: UpdateSeoSettingsInput): void {
    this.props.searchEngineIndexingEnabled = input.searchEngineIndexingEnabled;
  }

  updateLocaleSettings(input: UpdateLocaleSettingsInput): void {
    this.props.defaultLocale = input.defaultLocale;
    this.props.enabledLocales = input.enabledLocales;
    this.props.untranslatedPageFallback = input.untranslatedPageFallback;
  }

  updateFormSubmissionRetention(
    input: UpdateFormSubmissionRetentionInput,
  ): void {
    this.props.formSubmissionRetentionDays = input.formSubmissionRetentionDays;
  }

  updateThemeSettings(input: UpdateThemeSettingsInput): void {
    this.props.themePrimaryColor = input.primaryColor;
    this.props.themeSecondaryColor = input.secondaryColor;
    this.props.themeFontFamily = input.fontFamily;
    this.props.themeCustomCss = input.customCss;
    this.props.themeContentWidth = input.contentWidth;
    this.props.themeHeadScript = input.headScript;
    this.props.themeBodyScript = input.bodyScript;
    this.props.themeFaviconUrl = input.faviconUrl;
    this.props.themeOverridesEnabled = input.overridesEnabled;
    this.props.themeAllowedTrackerDomains = input.allowedTrackerDomains;
    this.props.themeTrackerScripts = input.trackerScripts;
  }

  updateCookieBannerSettings(input: UpdateCookieBannerSettingsInput): void {
    this.props.cookieBannerSettings = input;
  }
}
