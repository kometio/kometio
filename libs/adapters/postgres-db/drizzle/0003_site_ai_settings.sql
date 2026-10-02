-- How a site generates pages from a prompt (provider, model, and its API
-- key sealed with SecretCipherPort, never in the clear). A table of its own
-- so the secret never travels with the widely-read `sites` row.
CREATE TYPE "public"."page_generator_provider" AS ENUM('anthropic', 'openai-compatible');--> statement-breakpoint
CREATE TABLE "site_ai_settings" (
	"tenant_id" uuid NOT NULL,
	"site_id" uuid PRIMARY KEY NOT NULL,
	"provider" "page_generator_provider" NOT NULL,
	"model" text NOT NULL,
	"base_url" text,
	"api_key_sealed" text,
	"api_key_hint" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_ai_settings" ADD CONSTRAINT "site_ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_ai_settings" ADD CONSTRAINT "site_ai_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_ai_settings_tenant_idx" ON "site_ai_settings" USING btree ("tenant_id");--> statement-breakpoint

-- Tenant isolation, as on every other tenant-scoped table (see the policy
-- loop in 0000_baseline_schema.sql).
ALTER TABLE "site_ai_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_ai_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "site_ai_settings"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "site_ai_settings" TO kometio_app;
