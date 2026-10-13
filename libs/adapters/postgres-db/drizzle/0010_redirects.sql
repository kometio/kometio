-- Redirects (docs/adr/0127): the old addresses a site answers with a move or a
-- "gone", and the count of what visitors asked for and did not find.
CREATE TYPE "public"."redirect_kind" AS ENUM('exact', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."redirect_origin" AS ENUM('manual', 'list', 'wordpress');--> statement-breakpoint
CREATE TYPE "public"."redirect_target_kind" AS ENUM('page', 'url');--> statement-breakpoint
CREATE TABLE "missing_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"path" text NOT NULL,
	"hits" bigint DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "missing_paths_site_path_unique" UNIQUE("site_id","path")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"source_query" text DEFAULT '' NOT NULL,
	"kind" "redirect_kind" NOT NULL,
	"target_kind" "redirect_target_kind",
	"target_page_group_id" uuid,
	"target_locale" text,
	"target_url" text,
	"status" smallint DEFAULT 301 NOT NULL,
	"origin" "redirect_origin" DEFAULT 'manual' NOT NULL,
	"hits" bigint DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redirects_site_source_unique" UNIQUE("site_id","source_path","source_query"),
	CONSTRAINT "redirects_status_check" CHECK ("redirects"."status" in (301, 302, 410)),
	CONSTRAINT "redirects_target_check" CHECK (("redirects"."status" = 410) = ("redirects"."target_kind" is null)),
	CONSTRAINT "redirects_target_shape_check" CHECK (("redirects"."target_kind" is distinct from 'page' or ("redirects"."target_locale" is not null and "redirects"."target_url" is null))
        and ("redirects"."target_kind" is distinct from 'url' or ("redirects"."target_url" is not null and "redirects"."target_page_group_id" is null and "redirects"."target_locale" is null))),
	CONSTRAINT "redirects_pattern_check" CHECK ("redirects"."kind" <> 'pattern' or ("redirects"."source_query" = '' and "redirects"."target_kind" is distinct from 'page'))
);
--> statement-breakpoint
ALTER TABLE "missing_paths" ADD CONSTRAINT "missing_paths_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_paths" ADD CONSTRAINT "missing_paths_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_target_page_group_id_page_groups_id_fk" FOREIGN KEY ("target_page_group_id") REFERENCES "public"."page_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missing_paths_tenant_site_hits_idx" ON "missing_paths" USING btree ("tenant_id","site_id","hits");--> statement-breakpoint
CREATE INDEX "redirects_tenant_site_idx" ON "redirects" USING btree ("tenant_id","site_id");--> statement-breakpoint

-- Tenant isolation, as on every other tenant-scoped table (see the policy
-- loop in 0000_baseline_schema.sql).
ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "redirects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "redirects"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "redirects" TO kometio_app;--> statement-breakpoint
ALTER TABLE "missing_paths" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "missing_paths" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "missing_paths"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "missing_paths" TO kometio_app;
