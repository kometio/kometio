import {
  Collection,
  PageGroup,
  PageTranslation,
  ReusableSection,
  Site,
  SiteLayoutSection,
  User,
  type CreateCollectionProps,
  type SiteProps,
} from '@kometio/domain-core';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';

/*
 * One builder per entity a spec needs and does not care about in full.
 *
 * Every default is a fixed, readable value — `site-1`, `tenant-1` — so a
 * unit spec reads the same every run. An integration spec that needs
 * values of its own (a `randomUUID()` id, the tenant it just inserted)
 * passes them as overrides, which is also how a spec says which fields the
 * test is actually about.
 */

/** A site with every setting at its neutral value. `Site` has no `create`, so without this a spec spells out every prop to say its default language is Italian. */
/** A collection of site-1, named after its id unless told otherwise. */
export function buildCollection(
  overrides: Partial<CreateCollectionProps> & { id: string },
): Collection {
  return Collection.create({
    tenantId: 'tenant-1',
    siteId: 'site-1',
    name: overrides.id,
    ...overrides,
  });
}

export function buildSite(overrides: Partial<SiteProps> = {}): Site {
  return Site.fromProps({
    id: 'site-1',
    tenantId: 'tenant-1',
    name: 'Test site',
    domain: 'example.com',
    themeName: 'classic',
    defaultLocale: 'it',
    enabledLocales: ['it'],
    untranslatedPageFallback: 'redirect-to-default',
    businessAddress: null,
    businessPhone: null,
    businessEmail: null,
    businessType: null,
    openingHours: null,
    searchEngineIndexingEnabled: false,
    themePrimaryColor: null,
    themeSecondaryColor: null,
    themeFontFamily: null,
    themeCustomCss: null,
    themeContentWidth: null,
    themeHeadScript: null,
    themeBodyScript: null,
    themeFaviconUrl: null,
    themeOverridesEnabled: true,
    themeAllowedTrackerDomains: [],
    formSubmissionRetentionDays: null,
    themeTrackerScripts: [],
    cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });
}

export function buildUser(
  overrides: Partial<Parameters<typeof User.create>[0]> = {},
): User {
  return User.create({
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'lele@example.com',
    displayName: 'Lele',
    passwordHash: 'hashed',
    role: 'admin',
    ...overrides,
  });
}

export function buildPageGroup(
  overrides: Partial<Parameters<typeof PageGroup.create>[0]> = {},
): PageGroup {
  return PageGroup.create({
    id: 'group-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    ...overrides,
  });
}

export function buildPageTranslation(
  overrides: Partial<Parameters<typeof PageTranslation.create>[0]> = {},
): PageTranslation {
  return PageTranslation.create({
    id: 'translation-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    pageGroupId: 'group-1',
    locale: 'it',
    slug: 'home',
    seoMeta: { title: 'Home', description: '' },
    ...overrides,
  });
}

export function buildSiteLayoutSection(
  overrides: Partial<Parameters<typeof SiteLayoutSection.create>[0]> = {},
): SiteLayoutSection {
  return SiteLayoutSection.create({
    id: 'section-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    locale: 'it',
    kind: 'header',
    ...overrides,
  });
}

export function buildReusableSection(
  overrides: Partial<Parameters<typeof ReusableSection.create>[0]> = {},
): ReusableSection {
  return ReusableSection.create({
    id: 'reusable-section-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    name: 'Section',
    kind: 'shared',
    ...overrides,
  });
}
