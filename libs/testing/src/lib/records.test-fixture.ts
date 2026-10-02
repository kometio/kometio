import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import {
  type CollectionRecord,
  type FormRecord,
  type MediaRecord,
  type ReusableSectionListItem,
  type ReusableSectionRecord,
  type SiteLayoutSectionRecord,
  type SiteLayoutSectionVersionRecord,
  type TaxonomyRecord,
  type TermRecord,
  type UserRecord,
  type PageGroupListItemRecord,
  type PageGroupListItemTranslation,
  type PageGroupRecord,
  type PageGroupVersionRecord,
  type PageTranslationRecord,
  type PageTranslationVersionRecord,
  type SiteRecord,
} from '@kometio/api-contracts';

/*
 * One builder per wire record a spec needs and does not care about in full
 * — what `apps/api` sends and `apps/editor-app` parses.
 *
 * The defaults describe the same site as the entity builders next door
 * (`site-1` in `tenant-1`, an Italian page `group-1` whose translation is
 * `home`), as the API would serialize it. A spec that mixes the two layers
 * finds them agreeing, and one that needs a value of its own passes it as
 * an override.
 *
 * Exported from `@kometio/testing/records`, not from the package root: these
 * depend on `@kometio/shared-types` only, so the editor's specs can use them
 * without loading the domain entities and ports the root brings along.
 */

/** Every timestamp a record carries by default: the entity builders' `createdAt`, as the wire spells it. */
const CREATED_AT = '2026-01-01T00:00:00.000Z';

export function buildSiteRecord(
  overrides: Partial<SiteRecord> = {},
): SiteRecord {
  return {
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
    formSubmissionRetentionDays: null,
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
    themeTrackerScripts: [],
    cookieBannerSettings: DEFAULT_COOKIE_BANNER_SETTINGS,
    themeTokens: { blockStyles: {} },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function buildPageGroupRecord(
  overrides: Partial<PageGroupRecord> = {},
): PageGroupRecord {
  return {
    id: 'group-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    parentId: null,
    order: 0,
    collectionId: null,
    content: [],
    createdBy: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** A translation as `PageTranslation.create` leaves it: a draft, never published, following the group's content. */
export function buildPageTranslationRecord(
  overrides: Partial<PageTranslationRecord> = {},
): PageTranslationRecord {
  return {
    id: 'translation-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    pageGroupId: 'group-1',
    locale: 'it',
    slug: 'home',
    seoMeta: { title: 'Home', description: '' },
    fieldValues: {},
    status: 'draft',
    publishedSnapshot: null,
    isDiverged: false,
    divergedContent: null,
    createdBy: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** One language of a pages-list row — the default translation, summarized. */
export function buildPageGroupListItemTranslation(
  overrides: Partial<PageGroupListItemTranslation> = {},
): PageGroupListItemTranslation {
  return {
    locale: 'it',
    slug: 'home',
    title: 'Home',
    status: 'draft',
    isDiverged: false,
    hasUnpublishedChanges: false,
    ...overrides,
  };
}

/** A pages-list row: the default group, with its one translation. */
export function buildPageGroupListItemRecord(
  overrides: Partial<PageGroupListItemRecord> = {},
): PageGroupListItemRecord {
  return {
    id: 'group-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    parentId: null,
    order: 0,
    collectionId: null,
    createdByName: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    lastEditedAt: CREATED_AT,
    lastEditedByName: null,
    childCount: 0,
    translations: [buildPageGroupListItemTranslation()],
    ...overrides,
  };
}

export function buildPageGroupVersionRecord(
  overrides: Partial<PageGroupVersionRecord> = {},
): PageGroupVersionRecord {
  return {
    id: 'version-1',
    tenantId: 'tenant-1',
    pageGroupId: 'group-1',
    content: [],
    createdBy: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** A version of the default translation's text, taken while it followed the shared structure. */
export function buildPageTranslationVersionRecord(
  overrides: Partial<PageTranslationVersionRecord> = {},
): PageTranslationVersionRecord {
  return {
    id: 'translation-version-1',
    tenantId: 'tenant-1',
    pageTranslationId: 'translation-1',
    fieldValues: {},
    seoMeta: { title: 'Home', description: '' },
    divergedContent: null,
    createdBy: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

export function buildCollectionRecord(
  overrides: Partial<CollectionRecord> = {},
): CollectionRecord {
  return {
    id: 'collection-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    name: 'News',
    icon: 'newspaper',
    order: 0,
    defaultTemplateId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** An uploaded photo, as the API hands it back after re-encoding it to WebP (ADR-0013). */
export function buildMediaRecord(
  overrides: Partial<MediaRecord> = {},
): MediaRecord {
  return {
    id: 'media-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    filename: 'foto.png',
    alt: '',
    storageKey: 'abc.webp',
    storageProvider: 'local',
    mimeType: 'image/webp',
    size: 1234,
    width: 800,
    height: 600,
    createdAt: CREATED_AT,
    url: 'http://localhost/uploads/abc.webp',
    ...overrides,
  };
}

export function buildFormRecord(
  overrides: Partial<FormRecord> = {},
): FormRecord {
  return {
    id: 'form-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    name: 'Contact form',
    fields: [],
    steps: [],
    notificationEmails: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    submissionCount: 0,
    ...overrides,
  };
}

/** The same person as `buildUser` in `@kometio/testing`, as the users list sends them. */
export function buildUserRecord(
  overrides: Partial<UserRecord> = {},
): UserRecord {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'lele@example.com',
    displayName: 'Lele',
    slug: null,
    avatarUrl: null,
    role: 'admin',
    isActive: true,
    invitePending: false,
    language: null,
    emailVerifiedAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** A header nobody has published yet — what `SiteLayoutSection.create` leaves. */
export function buildSiteLayoutSectionRecord(
  overrides: Partial<SiteLayoutSectionRecord> = {},
): SiteLayoutSectionRecord {
  return {
    id: 'section-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    locale: 'it',
    kind: 'header',
    status: 'draft',
    content: [],
    publishedContent: null,
    sticky: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

export function buildSiteLayoutSectionVersionRecord(
  overrides: Partial<SiteLayoutSectionVersionRecord> = {},
): SiteLayoutSectionVersionRecord {
  return {
    id: 'version-1',
    tenantId: 'tenant-1',
    siteLayoutSectionId: 'section-1',
    content: [],
    createdBy: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** A shared section nobody has published yet — what `ReusableSection.create` leaves. */
export function buildReusableSectionRecord(
  overrides: Partial<ReusableSectionRecord> = {},
): ReusableSectionRecord {
  return {
    id: 'reusable-section-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    name: 'Section',
    kind: 'shared',
    status: 'draft',
    content: [],
    publishedContent: null,
    exposedFields: {},
    createdBy: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** The same section as a row of the sections list, used nowhere yet. */
export function buildReusableSectionListItem(
  overrides: Partial<ReusableSectionListItem> = {},
): ReusableSectionListItem {
  return {
    ...buildReusableSectionRecord(),
    usedOnPages: 0,
    usedInTemplates: 0,
    ...overrides,
  };
}

export function buildTaxonomyRecord(
  overrides: Partial<TaxonomyRecord> = {},
): TaxonomyRecord {
  return {
    id: 'taxonomy-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    prefix: 'categoria',
    name: { it: 'Categoria' },
    hierarchical: true,
    order: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** A top-level term of `buildTaxonomyRecord`'s taxonomy, named and addressed in Italian. */
export function buildTermRecord(
  overrides: Partial<TermRecord> = {},
): TermRecord {
  return {
    id: 'term-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    taxonomyId: 'taxonomy-1',
    parentId: null,
    name: { it: 'Term' },
    description: {},
    seoMeta: {},
    noindex: false,
    landingPageGroupId: null,
    order: 0,
    slugs: { it: 'term' },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}
