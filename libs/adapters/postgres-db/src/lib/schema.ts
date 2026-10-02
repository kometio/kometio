import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  DEFAULT_VARIANT,
  IMPORT_JOB_STATUSES,
  PAGE_GENERATOR_PROVIDERS,
  PAGE_TRANSLATION_STATUSES,
  REUSABLE_SECTION_KINDS,
  REUSABLE_SECTION_STATUSES,
  SITE_LAYOUT_SECTION_KINDS,
  SITE_LAYOUT_SECTION_STATUSES,
  STORAGE_PROVIDERS,
  UNTRANSLATED_PAGE_FALLBACKS,
  USER_ROLES,
  VERIFICATION_TOKEN_PURPOSES,
} from '@kometio/shared-types';
import type {
  ResponsiveBlockStyle,
  BusinessAddress,
  WordPressAnalysis,
  CookieBannerSettings,
  ExposedFields,
  FieldValueOverlay,
  FormerParentLocation,
  FormField,
  FormStep,
  LocalizedSeoMeta,
  LocalizedText,
  OpeningHoursDay,
  PageContent,
  SeoMeta,
  TrackerDomainEntry,
  TrackerScriptEntry,
} from '@kometio/shared-types';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';

// One native Postgres enum type per domain string-union, reading its values
// from the same tuple the domain type and the wire schema are built from
// (@kometio/shared-types), so the three cannot drift apart. Kept separate
// even where two enums share the same value set (the three draft/published
// ones) because their domain types are deliberately distinct: publishing a
// header has nothing to do with publishing a page.
export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const untranslatedPageFallbackEnum = pgEnum(
  'untranslated_page_fallback',
  UNTRANSLATED_PAGE_FALLBACKS,
);
export const pageTranslationStatusEnum = pgEnum(
  'page_translation_status',
  PAGE_TRANSLATION_STATUSES,
);
export const pageGeneratorProviderEnum = pgEnum(
  'page_generator_provider',
  PAGE_GENERATOR_PROVIDERS,
);
export const siteLayoutSectionKindEnum = pgEnum(
  'site_layout_section_kind',
  SITE_LAYOUT_SECTION_KINDS,
);
export const siteLayoutSectionStatusEnum = pgEnum(
  'site_layout_section_status',
  SITE_LAYOUT_SECTION_STATUSES,
);
// A reusable section is either a live reference or a copy taken once
// (docs/adr/0059) — the kind decides what INSERTING one does, so it is a
// property of the section itself and not of the insert action.
export const reusableSectionKindEnum = pgEnum(
  'reusable_section_kind',
  REUSABLE_SECTION_KINDS,
);
export const reusableSectionStatusEnum = pgEnum(
  'reusable_section_status',
  REUSABLE_SECTION_STATUSES,
);
export const storageProviderEnum = pgEnum(
  'storage_provider',
  STORAGE_PROVIDERS,
);

/**
 * Where an import has got to (docs/adr/0082).
 *
 * `analyzing` and `analyzed` exist before anything is written: reading a
 * 314 MB export takes seconds, which is too long to hold a request open,
 * and the whole point of the analysis is that somebody reads it and
 * decides. `failed` is also what a job found `analyzing` at start-up
 * becomes — the process that was doing the work is gone.
 */
export const importJobStatusEnum = pgEnum(
  'import_job_status',
  IMPORT_JOB_STATUSES,
);
export const verificationTokenPurposeEnum = pgEnum(
  'verification_token_purpose',
  VERIFICATION_TOKEN_PURPOSES,
);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    // Nullable, not backfilled: existing users (incl. the dev seed admin)
    // predate this column. UI falls back to `email` when null, same
    // pattern as `seoMeta.title || slug` elsewhere in this codebase.
    displayName: text('display_name'),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull(),
    // False for a freshly-invited user who hasn't accepted yet, or an
    // admin-deactivated one — see the domain entity's own doc comment.
    isActive: boolean('is_active').notNull().default(true),
    // True from the moment somebody is invited until they accept: what
    // tells a person waiting to join from one an admin switched off, which
    // `is_active` alone cannot (both are false).
    invitePending: boolean('invite_pending').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The person's author page (docs/adr/0071). Nullable: a person with no
    // display name has no address, since one made from an email would
    // publish part of it. Unique per tenant among the ones that exist —
    // Postgres lets any number of NULLs through a unique constraint.
    slug: text('slug'),
    formerSlugs: text('former_slugs').array().notNull().default([]),
    bio: jsonb('bio').$type<Record<string, string>>().notNull().default({}),
    avatarStorageKey: text('avatar_storage_key'),
    avatarWidth: integer('avatar_width'),
    avatarHeight: integer('avatar_height'),
    // The language the editor and every email speak to this person in; null
    // until they choose, and the site's default stands in. Text, not an enum:
    // a third language should not need a migration.
    language: text('language'),
  },
  (table) => [
    unique().on(table.tenantId, table.email),
    // An email is one address whatever case it was typed in: `Ana@x.it` and
    // `ana@x.it` must not be two accounts, and the lookup at sign-in compares
    // them that way. The constraint above stays: the seed names it as its
    // ON CONFLICT target.
    uniqueIndex('users_tenant_id_email_lower_unique').on(
      table.tenantId,
      sql`lower(${table.email})`,
    ),
    unique('users_tenant_id_slug_unique').on(table.tenantId, table.slug),
    index('users_former_slugs_idx').using('gin', table.formerSlugs),
  ],
);

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain'),
    defaultLocale: text('default_locale').notNull(),
    enabledLocales: text('enabled_locales').array().notNull().default([]),
    // What a visitor sees for a page not translated into their locale
    // (Fase 5b, docs/adr/0017) — 'redirect-to-default' is the friendlier
    // default for a fresh site over silently 404ing.
    untranslatedPageFallback: untranslatedPageFallbackEnum(
      'untranslated_page_fallback',
    )
      .notNull()
      .default('redirect-to-default'),
    // schema.org LocalBusiness fields (docs/adr/0014) — all nullable, a site
    // with none of them set renders plain WebSite/WebPage instead.
    // jsonb since docs/adr/0081 — the parts of an address, not a line of
    // prose. Nullable still means "no address at all".
    businessAddress: jsonb('business_address').$type<BusinessAddress>(),
    businessPhone: text('business_phone'),
    businessEmail: text('business_email'),
    businessType: text('business_type'),
    openingHours: jsonb('opening_hours').$type<OpeningHoursDay[]>(),
    // Defaults to false (opt-in): a site mid-build shouldn't be indexed until
    // its owner deliberately decides it's ready — see Site.searchEngineIndexingEnabled.
    searchEngineIndexingEnabled: boolean('search_engine_indexing_enabled')
      .notNull()
      .default(false),
    // Tier 2 of docs/adr/0021's theming model (docs/adr/0042) — which
    // bundled filesystem theme this site renders, resolved per-request.
    // Distinct from the Tier 1 theme* columns below (those layer style
    // overrides ON TOP of whichever theme this field names). Defaults to
    // 'classic' so an existing site gets the same behavior it always had
    // the moment this column appears — not a nullable "inherit" field
    // like Tier 1, since Tier 2 has no equivalent lower layer to fall
    // back to.
    themeName: text('theme_name').notNull().default('classic'),
    // Tier 1 of docs/adr/0021's theming model — all nullable, `null` means
    // "inherit the active filesystem theme's own default" (Tier 2), not a
    // value coerced here at the DB layer. See Site.themeSettings.
    themePrimaryColor: text('theme_primary_color'),
    themeSecondaryColor: text('theme_secondary_color'),
    themeFontFamily: text('theme_font_family'),
    themeCustomCss: text('theme_custom_css'),
    // ADR-0049 — the readable content column's width. Nullable like every
    // other Tier 1 column: `null` is "whatever the active theme says",
    // never a number coerced here.
    themeContentWidth: text('theme_content_width'),
    themeHeadScript: text('theme_head_script'),
    themeBodyScript: text('theme_body_script'),
    themeFaviconUrl: text('theme_favicon_url'),
    // Site-level gate under the theme's own theme.json ceiling
    // (docs/adr/0021) — defaults true so an existing/fresh site with no
    // Tier 1 fields set behaves identically to before this column existed.
    themeOverridesEnabled: boolean('theme_overrides_enabled')
      .notNull()
      .default(true),
    // ADR-0031 — admin-managed CSP domain whitelist for trackers beyond the
    // hardcoded GTM/GA4/Meta Pixel allowlist. Independent of
    // themeOverridesEnabled above: a tracker script shouldn't stop running
    // just because someone toggled off color/font overrides.
    themeAllowedTrackerDomains: jsonb('theme_allowed_tracker_domains')
      .notNull()
      .default([])
      .$type<TrackerDomainEntry[]>(),
    // GDPR/privacy: `null` (default) keeps every submission forever, same
    // behavior as before this column existed. A positive integer is the
    // number of days a form_submissions row survives past its createdAt
    // before the scheduled cleanup (FormSubmissionsRetentionCleanupService)
    // deletes it — see deleteExpiredFormSubmissions.
    formSubmissionRetentionDays: integer('form_submission_retention_days'),
    // Cookie consent (docs/adr/0039): categorized tracker snippets, gated
    // by consent category at render time — the structured alternative to
    // the always-on themeHeadScript/themeBodyScript above. Lives under the
    // same admin-gated PATCH /sites/:id/theme-settings endpoint since it's
    // still admin-trusted raw HTML, unlike cookieBannerSettings below.
    themeTrackerScripts: jsonb('theme_tracker_scripts')
      .notNull()
      .default([])
      .$type<TrackerScriptEntry[]>(),
    // Cookie consent banner config (docs/adr/0039) — inert config (position/
    // copy/toggles), not raw HTML, so it lives behind its own endpoint with
    // no role gate. Defaults to disabled: an existing site never gains a
    // banner it didn't ask for just because this column exists.
    cookieBannerSettings: jsonb('cookie_banner_settings')
      .notNull()
      .default(DEFAULT_COOKIE_BANNER_SETTINGS)
      .$type<CookieBannerSettings>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // findByDomain() is the hot path of every public request (page
    // rendering, sitemap, search, site chrome) — without this index it does
    // a sequential scan. The UNIQUE constraint it brings along is the more
    // important part: without it, two sites of the same tenant could share
    // a domain (nothing prevents it at the application level), and
    // findByDomain (which uses .limit(1) with no ORDER BY) would serve one
    // of the two indeterminately. `domain` stays nullable — Postgres treats
    // multiple NULLs as always distinct under UNIQUE, so several sites of
    // the same tenant with no domain configured yet coexist without
    // conflict.
    unique().on(table.tenantId, table.domain),
  ],
);

/**
 * Replaces `sites.theme_tokens` (which was a single JSONB map spread across
 * the site's row) — one row per (site, block type) instead of an entry
 * nested in a blob. Not for correctness (the previous
 * `UPDATE ... jsonb_set` was already atomic per type) but for two real
 * reasons: a write here no longer rewrites the whole wide `sites` row under
 * MVCC (name, domain, SEO settings, and so on — all unrelated to styling),
 * and `WHERE block_type = 'Button'` becomes an ordinary index lookup rather
 * than a JSONB path traversal. `style` stays jsonb (not typed columns per
 * property): adding or removing a stylable property remains a data change
 * rather than a migration — the same reason `blockStyles` was already a
 * generic map.
 */
export const siteThemeBlockStyles = pgTable(
  'site_theme_block_styles',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    blockType: text('block_type').notNull(),
    /**
     * Which of the type's looks this style paints (ADR-0047) — part of
     * the key, so an agency can recolour the ghost buttons without
     * touching the primary ones.
     *
     * `'default'` (never NULL) for the type's own look. A nullable column
     * would have read more naturally and been wrong: NULLs do not compare
     * equal, so `(site, type, NULL)` is not a duplicate of itself and the
     * primary key would let the same type collect unlimited default rows.
     * `blockVariantNameSchema` reserves the word so a declared variant can
     * never collide with it.
     */
    variant: text('variant').notNull().default(DEFAULT_VARIANT),
    // Per breakpoint since ADR-0047. Rows written before it hold the flat
    // shape and are read as `{ base: … }` — see
    // `normalizeResponsiveBlockStyle`, and the one-off migration that
    // rewrites them.
    style: jsonb('style').notNull().$type<ResponsiveBlockStyle>(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.blockType, table.variant] }),
    index('site_theme_block_styles_tenant_site_idx').on(
      table.tenantId,
      table.siteId,
    ),
  ],
);

/**
 * How a site generates pages from a prompt: which provider, which model,
 * and its API key — SEALED (SecretCipherPort), never stored in the clear.
 * A table of its own rather than columns on `sites`: the site's row is
 * read in many places, the public site's among them, and a secret has no
 * business travelling with it even sealed. Only the page generator reads
 * this one.
 */
export const siteAiSettings = pgTable(
  'site_ai_settings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    provider: pageGeneratorProviderEnum('provider').notNull(),
    model: text('model').notNull(),
    /** Where an OpenAI-compatible server lives; null for Anthropic. */
    baseUrl: text('base_url'),
    /** The API key, sealed; null when none is set (a local server may need none). */
    apiKeySealed: text('api_key_sealed'),
    /** Its last four characters, so the editor can say which key is set without holding it. */
    apiKeyHint: text('api_key_hint'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('site_ai_settings_tenant_idx').on(table.tenantId)],
);

// Field-level i18n (a shared structure plus per-locale overrides) —
// pageGroups/pageTranslations replaced the old `pages` table (removed in
// the plan's phase 5). A PageGroup owns the structure SHARED across every
// language; a PageTranslation owns the per-locale text.
/**
 * A named section of the editor that holds pages of one kind — News,
 * Events, Case studies — each with a menu entry of its own.
 *
 * Under the surface an article IS a page: same table, same draft and
 * publish per language, same version history, same addresses. What a
 * collection changes is who lists it and how: a flat list newest first,
 * in its own screen, instead of a row in the site's tree. Mixing three
 * hundred news items into the page tree makes both unreadable, and that
 * is the whole reason this table exists.
 *
 * Pages themselves are NOT a row here. They are the absence of one
 * (`page_groups.collection_id is null`) — inventing a "Pages" collection
 * for every existing site would immediately raise the question of
 * whether it can be deleted, and the answer would have to be no.
 *
 * Nothing here configures behaviour yet, only identity: every collection
 * is a flat list ordered by publication date. The day one needs a
 * different order, this is the table it belongs to.
 */
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    // Plain text, not the locale-keyed JSONB a taxonomy's name uses: this
    // is the label of a screen in the editor, read by the handful of
    // people who administer the site, not by its visitors.
    name: text('name').notNull(),
    // A lucide icon name, so the entry it adds to the sidebar looks like
    // the ones the product ships with rather than a section bolted on.
    icon: text('icon').notNull().default('newspaper'),
    order: integer('order').notNull().default(0),
    // The template a new page here starts from (docs/adr/0072). `set null`
    // on delete: removing a template takes away a suggestion, it must not
    // take the collection with it or refuse to go.
    defaultTemplateId: uuid('default_template_id').references(
      (): AnyPgColumn => reusableSections.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('collections_tenant_site_idx').on(table.tenantId, table.siteId),
  ],
);

export const pageGroups = pgTable(
  'page_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    // A hierarchy SHARED across every language — unlike the old
    // pages.parentId (which was per-locale), it makes no sense for two
    // languages of the same page to live at different points in the site's
    // tree.
    //
    // RESTRICT, not SET NULL: a page with subpages cannot be deleted. SET
    // NULL moved the subpages to the top level while their translations
    // (parentGroupId below) still pointed at the deleted page, so they
    // answered 404 everywhere and could no longer be saved.
    parentId: uuid('parent_id').references((): AnyPgColumn => pageGroups.id, {
      onDelete: 'restrict',
    }),
    // The canonical block tree — for a field marked `translatable`
    // (FieldDescriptor in @kometio/block-registry), the value here is the
    // site's default language's, the fallback used until a pageTranslation
    // has an override of its own (see mergeTranslatedContent in
    // @kometio/shared-types).
    content: jsonb('content').notNull().default([]).$type<PageContent>(),
    // Sibling-scoped, and shared for the same reason as parentId — with the
    // same DB-level non-uniqueness as the old pages.order (a temporary
    // duplicate halfway through a reorder is harmless, see
    // reorderSiblingPages).
    order: integer('order').notNull().default(0),
    // Which section of the editor lists this page — null for a page,
    // which is the default and the majority. `set null` rather than a
    // cascade: deleting the News section must turn its articles back
    // into ordinary pages, never delete what it was holding.
    collectionId: uuid('collection_id').references(
      (): AnyPgColumn => collections.id,
      {
        onDelete: 'set null',
      },
    ),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // The last person to change anything here. `set null` rather than a
    // cascade for the same reason as created_by: losing a user must not
    // take the page's history with them.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When the shared structure last changed, as opposed to updated_at,
    // which also moves for a reorder or a reparenting — see PageGroup's
    // own doc comment and hasUnpublishedChanges in @kometio/domain-core.
    contentUpdatedAt: timestamp('content_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('page_groups_tenant_site_idx').on(table.tenantId, table.siteId),
  ],
);

export const pageTranslations = pgTable(
  'page_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Denormalized from pageGroups.siteId, written only at creation (a page
    // never changes site) — needed for the slug uniqueness constraint and
    // for public resolution without a join, see
    // PageTranslationRepositoryPort.findByParentGroupAndLocaleSlug.
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    pageGroupId: uuid('page_group_id')
      .notNull()
      .references(() => pageGroups.id, { onDelete: 'cascade' }),
    // Denormalized from pageGroups.parentId, RESYNCED on every reparenting
    // of the group (in the same transaction — see the use case that moves a
    // PageGroup) across ALL of its translations. A sibling-scoped slug
    // uniqueness constraint cannot reference another table's column through
    // a join in Postgres — this denormalization is the price of keeping the
    // same strong DB-level guarantee that existed on pages.parentId, rather
    // than relying on an application check alone.
    //
    // A real reference too, so the copy can never name a page that is not
    // there — it did, after a parent was deleted.
    parentGroupId: uuid('parent_group_id').references(
      (): AnyPgColumn => pageGroups.id,
      { onDelete: 'restrict' },
    ),
    locale: text('locale').notNull(),
    slug: text('slug').notNull(),
    /**
     * Every address this translation has answered to before its current
     * one, oldest first.
     *
     * A slug used to be decided once, at creation, and never again: a
     * typo in the title a page was born from was its URL for good, and
     * the only way out was deleting the page and losing its version
     * history with it. Renaming without this column would be worse than
     * not renaming at all — on a real site it silently kills every
     * inbound link and the page's own ranking, and nothing says so.
     *
     * A column and not a table: a short list that only grows when
     * somebody renames, read on exactly one query path (a lookup that
     * found nothing), with no attributes of its own. A join table would
     * be machinery around an array.
     */
    formerSlugs: text('former_slugs')
      .array()
      .notNull()
      .default(sql`'{}'`),
    /*
     * Where this language used to hang from, and under which slug — the
     * move counterpart of `formerSlugs` (docs/adr/0074). jsonb rather than
     * two parallel arrays: the pair is the unit public resolution asks
     * about, and splitting it would let the halves drift apart.
     */
    formerParents: jsonb('former_parents')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<FormerParentLocation[]>(),
    seoMeta: jsonb('seo_meta').notNull().default({}).$type<SeoMeta>(),
    // Overrides for `translatable` fields ONLY, keyed by block — a field
    // that is absent inherits the shared value from pageGroups.content.
    // Ignored while isDiverged is true.
    fieldValues: jsonb('field_values')
      .notNull()
      .default({})
      .$type<FieldValueOverlay>(),
    status: pageTranslationStatusEnum('status').notNull(),
    // The frozen merge (structure plus this language's fieldValues, or
    // divergedContent when unlinked) as of the last publish() — the same
    // shape and the same consumer (public resolution) as yesterday's
    // pages.publishedContent.
    publishedSnapshot: jsonb('published_snapshot').$type<PageContent>(),
    // "Unlinks" it: when true, this translation no longer receives the
    // structural changes propagated from pageGroups.content — it has a
    // structure and text of its own in divergedContent.
    isDiverged: boolean('is_diverged').notNull().default(false),
    divergedContent: jsonb('diverged_content').$type<PageContent>(),
    // Plain extracted text (SearchPort's indexPage, see
    // @kometio/postgres-search-repository) — never read/written by
    // PageTranslationRepositoryPort itself, kept here only so it lives on
    // the same row a translation's other content does. `search_vector`
    // (tsvector, generated from this column) isn't modeled here at all:
    // Drizzle has no first-class generated-column DSL for it — see the
    // migration that added this column (Fase 5, replaces pages.searchText).
    searchText: text('search_text'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    // See page_groups.updated_by.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When THIS language's content last changed — not its address or its
    // SEO, which are read live and need no publish. Paired with
    // published_at, it is what tells a published page it has changes
    // waiting: see hasUnpublishedChanges in @kometio/domain-core.
    contentUpdatedAt: timestamp('content_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.tenantId, table.pageGroupId, table.locale),
    // Sibling-scoped (the same scheme as pages above) but keyed on
    // parentGroupId rather than a per-locale parentId — see the comment on
    // the column. The same Postgres NULL <> NULL gap, closed the same way
    // by the partial index below.
    unique().on(
      table.tenantId,
      table.siteId,
      table.locale,
      table.parentGroupId,
      table.slug,
    ),
    uniqueIndex('page_translations_root_slug_unique')
      .on(table.tenantId, table.siteId, table.locale, table.slug)
      .where(sql`${table.parentGroupId} is null`),
    index('page_translations_tenant_group_idx').on(
      table.tenantId,
      table.pageGroupId,
    ),
    // Read only when a lookup by slug found nothing, which on a healthy
    // site is a 404 — but a crawler following an old link is exactly the
    // visitor this column exists for, and making them wait on a
    // sequential scan of every translation is the wrong answer to give
    // them. GIN because the query asks "does this array contain that
    // slug", which is what GIN answers.
    // Not CONCURRENTLY: the migration runner wraps each file in a
    // transaction, which Postgres forbids for a concurrent build, and no
    // other index in this schema asks for one either.
    index('page_translations_former_slugs_idx').using('gin', table.formerSlugs),
  ],
);

export const pageGroupVersions = pgTable(
  'page_group_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    pageGroupId: uuid('page_group_id')
      .notNull()
      .references(() => pageGroups.id, { onDelete: 'cascade' }),
    content: jsonb('content').notNull().$type<PageContent>(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('page_group_versions_group_created_idx').on(
      table.pageGroupId,
      table.createdAt,
    ),
  ],
);

export const pageTranslationVersions = pgTable(
  'page_translation_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    pageTranslationId: uuid('page_translation_id')
      .notNull()
      .references(() => pageTranslations.id, { onDelete: 'cascade' }),
    fieldValues: jsonb('field_values').notNull().$type<FieldValueOverlay>(),
    seoMeta: jsonb('seo_meta').notNull().$type<SeoMeta>(),
    // The language's own tree when the version was taken while it was
    // unlinked, `null` otherwise (docs/adr/0075). Nullable rather than a
    // separate table: a version is one snapshot of one language, whichever
    // shape its content had at that moment.
    divergedContent: jsonb('diverged_content').$type<PageContent>(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('page_translation_versions_translation_created_idx').on(
      table.pageTranslationId,
      table.createdAt,
    ),
  ],
);

// One header and one footer per (site, locale) at most (docs/adr/0018) —
// applied automatically around every page of that locale, never placed
// by hand on individual pages like Hero/Text/Image.
export const siteLayoutSections = pgTable(
  'site_layout_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    kind: siteLayoutSectionKindEnum('kind').notNull(),
    status: siteLayoutSectionStatusEnum('status').notNull(),
    content: jsonb('content').notNull().default([]).$type<PageContent>(),
    publishedContent: jsonb('published_content').$type<PageContent>(),
    // Meaningful for kind='header' only (stays pinned to the top of the
    // viewport on scroll) — no DB-level constraint tying it to kind, same
    // reasoning as the domain entity's own comment on SiteLayoutSection.sticky.
    sticky: boolean('sticky').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.siteId, table.locale, table.kind),
    index('site_layout_sections_tenant_site_idx').on(
      table.tenantId,
      table.siteId,
    ),
  ],
);

export const siteLayoutSectionVersions = pgTable(
  'site_layout_section_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteLayoutSectionId: uuid('site_layout_section_id')
      .notNull()
      .references(() => siteLayoutSections.id, { onDelete: 'cascade' }),
    content: jsonb('content').notNull().$type<PageContent>(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // every save creates a row here, never a destructive overwrite
  },
  (table) => [
    // Composite for the same reason as page_versions_page_created_idx
    // above: listing is always
    // `WHERE site_layout_section_id = ? ORDER BY created_at ASC`.
    index('site_layout_section_versions_section_created_idx').on(
      table.siteLayoutSectionId,
      table.createdAt,
    ),
  ],
);

// A strip of blocks an agency builds once and places on many pages
// (docs/adr/0059). It has its OWN draft/publish cycle, and that is the
// whole mechanism: a page's published snapshot stores only the reference,
// so publishing the section changes every page using it without any of
// them being republished.
export const reusableSections = pgTable(
  'reusable_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: reusableSectionKindEnum('kind').notNull(),
    status: reusableSectionStatusEnum('status').notNull(),
    content: jsonb('content').notNull().default([]).$type<PageContent>(),
    publishedContent: jsonb('published_content').$type<PageContent>(),
    // Which fields of which inner blocks an instance may change. Lives on
    // the section and not on the instance on purpose: the agency that
    // built it decides what the client may touch, and the client cannot
    // grant themselves more.
    exposedFields: jsonb('exposed_fields')
      .notNull()
      .default({})
      .$type<ExposedFields>(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Names are how a person picks one out of the insert menu, so two
    // sections called "I nostri servizi" on one site is a bug the database
    // can refuse rather than a support call later.
    unique().on(table.tenantId, table.siteId, table.name),
    index('reusable_sections_tenant_site_idx').on(table.tenantId, table.siteId),
  ],
);

export const reusableSectionVersions = pgTable(
  'reusable_section_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    reusableSectionId: uuid('reusable_section_id')
      .notNull()
      .references(() => reusableSections.id, { onDelete: 'cascade' }),
    content: jsonb('content').notNull().$type<PageContent>(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The same composite as the other version tables: listing is always
    // `WHERE reusable_section_id = ? ORDER BY created_at`.
    index('reusable_section_versions_section_created_idx').on(
      table.reusableSectionId,
      table.createdAt,
    ),
  ],
);

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    // What the file shows, for somebody who cannot see it: offered as the
    // starting alternative text when the file is put on a page, where the
    // block keeps its own. Empty until somebody writes one.
    alt: text('alt').notNull().default(''),
    storageKey: text('storage_key').notNull(),
    storageProvider: storageProviderEnum('storage_provider').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('media_tenant_site_idx').on(table.tenantId, table.siteId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // SHA-256 of the session token — the plaintext token is never persisted,
    // only ever held by the client cookie and checked in-flight. See
    // docs/adr/0010-session-based-auth-foundations.md.
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // one table, not two: both purposes share the exact same shape and
    // single-use/expiring lifecycle. See
    // docs/adr/0011-email-verification-password-reset.md.
    purpose: verificationTokenPurposeEnum('purpose').notNull(),
    // SHA-256 of the token — same reasoning as `sessions.token_hash`.
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * What the token was issued FOR, when the account alone does not say:
     * the address an email change is to move to. Bound to the token, not
     * kept on the user, so a link sent to one address can only ever
     * confirm that address — asking again for another must not turn the
     * first link into a way to take the second without owning it.
     */
    payload: text('payload'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('verification_tokens_user_idx').on(table.userId)],
);

/**
 * One attempt at bringing a site in from somewhere else (docs/adr/0082).
 *
 * The file itself is not here. It lands on disk, is read once, and the
 * row keeps what was learnt from it — a report is kilobytes where the
 * export is hundreds of megabytes, and keeping the file would mean
 * keeping every export anybody ever tried.
 */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    /** `'wordpress'` today. A second source implements the same port and writes its own name here. */
    source: text('source').notNull(),
    /** What the person uploaded, to tell two attempts apart in a list. */
    fileName: text('file_name').notNull(),
    fileBytes: integer('file_bytes').notNull(),
    status: importJobStatusEnum('status').notNull().default('analyzing'),
    /** Written when `status` is `analyzed` — the shape is `WordPressAnalysis`. */
    report: jsonb('report').$type<WordPressAnalysis>(),
    /** Written when `status` is `failed`, and meant to be read by whoever uploaded the file. */
    failureReason: text('failure_reason'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // "What has been tried on this site", newest first, which is the only
    // way this table is ever read.
    index('import_jobs_tenant_site_created_idx').on(
      table.tenantId,
      table.siteId,
      table.createdAt,
    ),
  ],
);

export const forms = pgTable(
  'forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Sole source of truth for both public rendering and submission
    // validation (docs/adr/0015) — no separate schema anywhere else.
    fields: jsonb('fields').notNull().default([]).$type<FormField[]>(),
    // Empty by default — a plain single-step form, same shape every form
    // had before this column existed (docs/adr/0015's multi-step follow-up).
    steps: jsonb('steps').notNull().default([]).$type<FormStep[]>(),
    // Who is emailed each submission — empty means nobody. A list since
    // docs/adr/0086; the single address it replaced became its first entry.
    notificationEmails: text('notification_emails')
      .array()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('forms_tenant_site_idx').on(table.tenantId, table.siteId)],
);

export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    // Which page the visitor filled the form on, in which language — the
    // translation and not the group, because "which page converts" is a
    // question about an address, and an address is per-language.
    //
    // `set null` keeps the submission when its page goes: the answers
    // someone typed outlive the page that collected them, and the origin
    // is the part that can afford to be lost. Written by the public
    // site's submit proxy from a hidden input, and checked against the
    // form's own site before it is stored (submitForm's
    // resolveOriginPage) — the endpoint is unauthenticated, and a foreign
    // key alone would accept any row that exists, whoever owns it.
    pageId: uuid('page_id').references(() => pageTranslations.id, {
      onDelete: 'set null',
    }),
    // preserves history even if the form is later deleted (docs/adr/0015)
    formId: uuid('form_id').references(() => forms.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('form_submissions_tenant_site_idx').on(table.tenantId, table.siteId),
  ],
);

/**
 * One dimension a site classifies things along (ADR-0064) — "Category",
 * "Family", "Tag". Agnostic about what carries the terms: pages do today
 * through `pageGroupTerms`, products will do it later through a table of
 * their own, on these same taxonomies and terms.
 */
export const taxonomies = pgTable(
  'taxonomies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    // Nullable, and that is the feature: `null` mounts this dimension's
    // terms at the site root (`/it/espresso`) instead of behind a prefix
    // (`/it/categoria/espresso`). Several dimensions may be mounted at
    // the root at once — the unique below leaves NULLs distinct on
    // purpose — and what keeps two of them from claiming the same
    // address is the term-slug constraint, which is keyed on the prefix
    // rather than on the taxonomy.
    slug: text('slug'),
    name: jsonb('name').notNull().default({}).$type<LocalizedText>(),
    // Whether terms may nest. A flat dimension ("Tag") says false and the
    // editor then offers no parent at all.
    hierarchical: boolean('hierarchical').notNull().default(true),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Two dimensions cannot share a prefix, or their terms would answer
    // at the same addresses. NULLs stay distinct here: "no prefix" is not
    // a prefix two taxonomies are fighting over.
    unique().on(table.tenantId, table.siteId, table.slug),
    index('taxonomies_tenant_site_idx').on(table.tenantId, table.siteId),
  ],
);

/**
 * One value inside a dimension — "Espresso machines" inside "Category".
 *
 * Name, description and SEO are locale-keyed JSONB rather than a
 * translation table: a term has no draft, no published snapshot, no
 * structure and no history, so a second table would carry machinery that
 * never turns. The slugs are the exception, and they live in
 * `termSlugs` below for a database reason — see there.
 */
export const terms = pgTable(
  'terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    taxonomyId: uuid('taxonomy_id')
      .notNull()
      .references(() => taxonomies.id, { onDelete: 'cascade' }),
    // `set null` and not `cascade`: deleting "Machines" must not silently
    // take "Espresso machines" with it, along with every page filed under
    // it. The child is promoted to the top of its dimension instead, and
    // stays reachable.
    parentId: uuid('parent_id').references((): AnyPgColumn => terms.id, {
      onDelete: 'set null',
    }),
    name: jsonb('name').notNull().default({}).$type<LocalizedText>(),
    // The introduction the default term layout prints above the list —
    // a different thing from the meta description inside `seoMeta`.
    description: jsonb('description')
      .notNull()
      .default({})
      .$type<LocalizedText>(),
    seoMeta: jsonb('seo_meta').notNull().default({}).$type<LocalizedSeoMeta>(),
    // Kept out of search engines by whoever publishes, one term at a
    // time — see Term.noindex. Not derived from how many pages carry the
    // term: a rule on a count hides a page that was growing.
    noindex: boolean('noindex').notNull().default(false),
    // A page built by hand, rendered ON this term's own URL rather than
    // redirected to (ADR-0064). `set null` is what makes that promise
    // hold: delete the page and the address keeps working, falling back
    // to the default layout.
    landingPageGroupId: uuid('landing_page_group_id').references(
      () => pageGroups.id,
      { onDelete: 'set null' },
    ),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('terms_tenant_site_idx').on(table.tenantId, table.siteId),
    // Every listing is "this dimension's children of that parent, in
    // order" — the editor's tree and the public breadcrumb both.
    index('terms_taxonomy_parent_order_idx').on(
      table.taxonomyId,
      table.parentId,
      table.order,
    ),
    // One page cannot be the landing of two terms: both would render the
    // same content at two addresses, which is the duplicate ADR-0064
    // renders in place to avoid.
    uniqueIndex('terms_landing_page_group_unique')
      .on(table.landingPageGroupId)
      .where(sql`${table.landingPageGroupId} is not null`),
  ],
);

/**
 * A term's address, one row per language.
 *
 * Split out of `terms` for a database reason and not a modelling one: a
 * slug is what a URL is built from, and Postgres cannot enforce "unique
 * per locale" over a JSON map whose keys are whatever languages the site
 * happens to have. Names can afford to collide; addresses cannot
 * (ADR-0064).
 */
export const termSlugs = pgTable(
  'term_slugs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    slug: text('slug').notNull(),
    // Denormalized from `taxonomies.slug`, rewritten for every one of a
    // dimension's terms when that prefix changes — the same price
    // `pageTranslations.parentGroupId` pays, and for the same reason: a
    // unique constraint cannot reach through a join in Postgres, and the
    // guarantee it buys is that no two terms answer at one address.
    routePrefix: text('route_prefix'),
  },
  (table) => [
    unique().on(table.tenantId, table.termId, table.locale),
    // The address itself, and the constraint this table exists for.
    //
    // Keyed on the PREFIX rather than on the taxonomy, so that two
    // dimensions both mounted at the root cannot each claim `/it/caffe`.
    // `nulls not distinct` is what makes the rootly-mounted case work at
    // all: Postgres treats NULLs as different by default, so a plain
    // unique would have let every root-mounted duplicate through — the
    // gap `page_translations` had to close with a second partial index
    // back when the codebase targeted an older Postgres.
    //
    // The whole path and not just the sibling scope: a term's URL is
    // `/{locale}/{prefix}/{slug}`, flat, so a slug that repeats under a
    // different parent would still be a second name for one address.
    // Deliberately the stricter of the two rules the plan allowed —
    // relaxing a constraint later is always possible, tightening one
    // over data that already violates it is not.
    unique('term_slugs_route_unique')
      .on(
        table.tenantId,
        table.siteId,
        table.locale,
        table.routePrefix,
        table.slug,
      )
      .nullsNotDistinct(),
    index('term_slugs_lookup_idx').on(
      table.tenantId,
      table.siteId,
      table.locale,
      table.slug,
    ),
  ],
);

/**
 * Which terms a page carries — on the GROUP and not on the translation,
 * exactly as `parentId` is: the Italian and the English version of an
 * article belong to the same categories (ADR-0064).
 */
export const pageGroupTerms = pgTable(
  'page_group_terms',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    pageGroupId: uuid('page_group_id')
      .notNull()
      .references(() => pageGroups.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.pageGroupId, table.termId] }),
    // "Everything filed under this term", which is what the term's own
    // page is a list of.
    index('page_group_terms_term_idx').on(table.termId),
  ],
);
