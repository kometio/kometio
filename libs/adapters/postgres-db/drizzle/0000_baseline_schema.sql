CREATE TYPE "public"."import_job_status" AS ENUM('analyzing', 'analyzed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."page_translation_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."reusable_section_kind" AS ENUM('shared', 'template');--> statement-breakpoint
CREATE TYPE "public"."reusable_section_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."site_layout_section_kind" AS ENUM('header', 'footer');--> statement-breakpoint
CREATE TYPE "public"."site_layout_section_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."storage_provider" AS ENUM('local', 's3');--> statement-breakpoint
CREATE TYPE "public"."untranslated_page_fallback" AS ENUM('redirect-to-default', 'not-available');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'publisher', 'editor');--> statement-breakpoint
CREATE TYPE "public"."verification_token_purpose" AS ENUM('email-verification', 'password-reset', 'user-invite');--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'newspaper' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"default_template_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"page_id" uuid,
	"form_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notification_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"source" text NOT NULL,
	"file_name" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"status" "import_job_status" DEFAULT 'analyzing' NOT NULL,
	"report" jsonb,
	"failure_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"storage_provider" "storage_provider" NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_group_terms" (
	"tenant_id" uuid NOT NULL,
	"page_group_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_group_terms_page_group_id_term_id_pk" PRIMARY KEY("page_group_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "page_group_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_group_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"parent_id" uuid,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"collection_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_translation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page_translation_id" uuid NOT NULL,
	"field_values" jsonb NOT NULL,
	"seo_meta" jsonb NOT NULL,
	"diverged_content" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"page_group_id" uuid NOT NULL,
	"parent_group_id" uuid,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"former_slugs" text[] DEFAULT '{}' NOT NULL,
	"former_parents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"field_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "page_translation_status" NOT NULL,
	"published_snapshot" jsonb,
	"is_diverged" boolean DEFAULT false NOT NULL,
	"diverged_content" jsonb,
	"search_text" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "page_translations_tenant_id_page_group_id_locale_unique" UNIQUE("tenant_id","page_group_id","locale"),
	CONSTRAINT "page_translations_tenant_id_site_id_locale_parent_group_id_slug_unique" UNIQUE("tenant_id","site_id","locale","parent_group_id","slug")
);
--> statement-breakpoint
CREATE TABLE "reusable_section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reusable_section_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reusable_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "reusable_section_kind" NOT NULL,
	"status" "reusable_section_status" NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_content" jsonb,
	"exposed_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reusable_sections_tenant_id_site_id_name_unique" UNIQUE("tenant_id","site_id","name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "site_layout_section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_layout_section_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_layout_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"kind" "site_layout_section_kind" NOT NULL,
	"status" "site_layout_section_status" NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_content" jsonb,
	"sticky" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_layout_sections_tenant_id_site_id_locale_kind_unique" UNIQUE("tenant_id","site_id","locale","kind")
);
--> statement-breakpoint
CREATE TABLE "site_theme_block_styles" (
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"block_type" text NOT NULL,
	"variant" text DEFAULT 'default' NOT NULL,
	"style" jsonb NOT NULL,
	CONSTRAINT "site_theme_block_styles_site_id_block_type_variant_pk" PRIMARY KEY("site_id","block_type","variant")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"default_locale" text NOT NULL,
	"enabled_locales" text[] DEFAULT '{}' NOT NULL,
	"untranslated_page_fallback" "untranslated_page_fallback" DEFAULT 'redirect-to-default' NOT NULL,
	"business_address" jsonb,
	"business_phone" text,
	"business_email" text,
	"business_type" text,
	"opening_hours" jsonb,
	"search_engine_indexing_enabled" boolean DEFAULT false NOT NULL,
	"theme_name" text DEFAULT 'classic' NOT NULL,
	"theme_primary_color" text,
	"theme_secondary_color" text,
	"theme_font_family" text,
	"theme_custom_css" text,
	"theme_content_width" text,
	"theme_head_script" text,
	"theme_body_script" text,
	"theme_favicon_url" text,
	"theme_overrides_enabled" boolean DEFAULT true NOT NULL,
	"theme_allowed_tracker_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"form_submission_retention_days" integer,
	"theme_tracker_scripts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cookie_banner_settings" jsonb DEFAULT '{"enabled":false,"position":"bottom-bar","acceptButtonSide":"left","showReopenTab":true,"reopenPosition":"bottom-left","privacyPolicyPageGroupId":null,"cookiePolicyPageGroupId":null,"copyOverrides":{}}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_tenant_id_domain_unique" UNIQUE("tenant_id","domain")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text,
	"name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hierarchical" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomies_tenant_id_site_id_slug_unique" UNIQUE("tenant_id","site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term_slugs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"route_prefix" text,
	CONSTRAINT "term_slugs_tenant_id_term_id_locale_unique" UNIQUE("tenant_id","term_id","locale"),
	CONSTRAINT "term_slugs_route_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","site_id","locale","route_prefix","slug")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seo_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"noindex" boolean DEFAULT false NOT NULL,
	"landing_page_group_id" uuid,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text,
	"former_slugs" text[] DEFAULT '{}' NOT NULL,
	"bio" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avatar_storage_key" text,
	"avatar_width" integer,
	"avatar_height" integer,
	CONSTRAINT "users_tenant_id_email_unique" UNIQUE("tenant_id","email"),
	CONSTRAINT "users_tenant_id_slug_unique" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "verification_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_default_template_id_reusable_sections_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."reusable_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_page_id_page_translations_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."page_translations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_terms" ADD CONSTRAINT "page_group_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_terms" ADD CONSTRAINT "page_group_terms_page_group_id_page_groups_id_fk" FOREIGN KEY ("page_group_id") REFERENCES "public"."page_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_terms" ADD CONSTRAINT "page_group_terms_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_versions" ADD CONSTRAINT "page_group_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_versions" ADD CONSTRAINT "page_group_versions_page_group_id_page_groups_id_fk" FOREIGN KEY ("page_group_id") REFERENCES "public"."page_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_group_versions" ADD CONSTRAINT "page_group_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_parent_id_page_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_versions" ADD CONSTRAINT "page_translation_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_versions" ADD CONSTRAINT "page_translation_versions_page_translation_id_page_translations_id_fk" FOREIGN KEY ("page_translation_id") REFERENCES "public"."page_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translation_versions" ADD CONSTRAINT "page_translation_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_page_group_id_page_groups_id_fk" FOREIGN KEY ("page_group_id") REFERENCES "public"."page_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_section_versions" ADD CONSTRAINT "reusable_section_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_section_versions" ADD CONSTRAINT "reusable_section_versions_reusable_section_id_reusable_sections_id_fk" FOREIGN KEY ("reusable_section_id") REFERENCES "public"."reusable_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_section_versions" ADD CONSTRAINT "reusable_section_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_sections" ADD CONSTRAINT "reusable_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_sections" ADD CONSTRAINT "reusable_sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reusable_sections" ADD CONSTRAINT "reusable_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_layout_section_versions" ADD CONSTRAINT "site_layout_section_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_layout_section_versions" ADD CONSTRAINT "site_layout_section_versions_site_layout_section_id_site_layout_sections_id_fk" FOREIGN KEY ("site_layout_section_id") REFERENCES "public"."site_layout_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_layout_section_versions" ADD CONSTRAINT "site_layout_section_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_layout_sections" ADD CONSTRAINT "site_layout_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_layout_sections" ADD CONSTRAINT "site_layout_sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_theme_block_styles" ADD CONSTRAINT "site_theme_block_styles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_theme_block_styles" ADD CONSTRAINT "site_theme_block_styles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_slugs" ADD CONSTRAINT "term_slugs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_slugs" ADD CONSTRAINT "term_slugs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term_slugs" ADD CONSTRAINT "term_slugs_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_id_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_landing_page_group_id_page_groups_id_fk" FOREIGN KEY ("landing_page_group_id") REFERENCES "public"."page_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collections_tenant_site_idx" ON "collections" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "form_submissions_tenant_site_idx" ON "form_submissions" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "forms_tenant_site_idx" ON "forms" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "import_jobs_tenant_site_created_idx" ON "import_jobs" USING btree ("tenant_id","site_id","created_at");--> statement-breakpoint
CREATE INDEX "media_tenant_site_idx" ON "media" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "page_group_terms_term_idx" ON "page_group_terms" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "page_group_versions_group_created_idx" ON "page_group_versions" USING btree ("page_group_id","created_at");--> statement-breakpoint
CREATE INDEX "page_groups_tenant_site_idx" ON "page_groups" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "page_translation_versions_translation_created_idx" ON "page_translation_versions" USING btree ("page_translation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_translations_root_slug_unique" ON "page_translations" USING btree ("tenant_id","site_id","locale","slug") WHERE "page_translations"."parent_group_id" is null;--> statement-breakpoint
CREATE INDEX "page_translations_tenant_group_idx" ON "page_translations" USING btree ("tenant_id","page_group_id");--> statement-breakpoint
CREATE INDEX "page_translations_former_slugs_idx" ON "page_translations" USING gin ("former_slugs");--> statement-breakpoint
CREATE INDEX "reusable_section_versions_section_created_idx" ON "reusable_section_versions" USING btree ("reusable_section_id","created_at");--> statement-breakpoint
CREATE INDEX "reusable_sections_tenant_site_idx" ON "reusable_sections" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_layout_section_versions_section_created_idx" ON "site_layout_section_versions" USING btree ("site_layout_section_id","created_at");--> statement-breakpoint
CREATE INDEX "site_layout_sections_tenant_site_idx" ON "site_layout_sections" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "site_theme_block_styles_tenant_site_idx" ON "site_theme_block_styles" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "taxonomies_tenant_site_idx" ON "taxonomies" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "term_slugs_lookup_idx" ON "term_slugs" USING btree ("tenant_id","site_id","locale","slug");--> statement-breakpoint
CREATE INDEX "terms_tenant_site_idx" ON "terms" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "terms_taxonomy_parent_order_idx" ON "terms" USING btree ("taxonomy_id","parent_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_landing_page_group_unique" ON "terms" USING btree ("landing_page_group_id") WHERE "terms"."landing_page_group_id" is not null;--> statement-breakpoint
CREATE INDEX "users_former_slugs_idx" ON "users" USING gin ("former_slugs");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_idx" ON "verification_tokens" USING btree ("user_id");
--> statement-breakpoint
-- Everything below is written by hand: drizzle-kit generates only what
-- schema.ts can describe, and none of this can be. It compacts what 24
-- migrations built up to 0023 (squashed on 2026-09-25, docs/development.md)
-- and was checked against a database built from those 24: the two schema
-- dumps are identical.

-- Generated column, not modeled in schema.ts (Drizzle has no DSL for
-- tsvector/generated columns): the search adapter writes plain text to
-- `search_text` and Postgres derives `search_vector` from it on every write.
ALTER TABLE "page_translations" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('italian', coalesce("search_text", ''))) STORED;
--> statement-breakpoint
CREATE INDEX "page_translations_search_vector_idx" ON "page_translations" USING GIN ("search_vector");
--> statement-breakpoint

-- Row Level Security on every tenant-scoped table, with a deliberately
-- trivial policy. The app sets the session with:
--   select set_config('app.current_tenant_id', '<uuid>', true);
-- (transaction-local, not session-wide — safe under connection pooling.)
--
-- It only protects anything because migrations run as a table owner that
-- is NOT the role the app connects as (docs/adr/0002): superusers always
-- bypass RLS. Assumes `kometio_app` already exists (db/init/000_roles.sh,
-- which needs a secret from the environment no checked-in file can hold).
--
-- `tenants` is left out on purpose: it IS the tenant boundary. A table
-- added later gets its policy in its own migration — the guarded form
-- below, since `create policy` has no `if not exists`.
create or replace function current_tenant() returns uuid as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$ language sql stable;
--> statement-breakpoint

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'collections', 'form_submissions', 'forms',
    'import_jobs', 'media', 'page_group_terms',
    'page_group_versions', 'page_groups', 'page_translation_versions',
    'page_translations', 'reusable_section_versions', 'reusable_sections',
    'sessions', 'site_layout_section_versions', 'site_layout_sections',
    'site_theme_block_styles', 'sites', 'taxonomies',
    'term_slugs', 'terms', 'users',
    'verification_tokens'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation'
    ) then
      execute format(
        'create policy tenant_isolation on %I using (tenant_id = current_tenant()) with check (tenant_id = current_tenant())',
        t
      );
    end if;
  end loop;
end $$;
--> statement-breakpoint

grant usage on schema public to kometio_app;
--> statement-breakpoint
grant select, insert, update, delete on all tables in schema public to kometio_app;
--> statement-breakpoint
alter default privileges in schema public
  grant select, insert, update, delete on tables to kometio_app;
