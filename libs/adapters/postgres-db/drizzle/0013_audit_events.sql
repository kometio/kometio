-- The activity log of a site (docs/adr/0130).
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_id" text,
	"target_label" text,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_tenant_at_idx" ON "audit_events" USING btree ("tenant_id","at");--> statement-breakpoint

-- Tenant isolation, as on every other tenant-scoped table (see the policy
-- loop in 0000_baseline_schema.sql). The application's role may add, read and
-- remove entries, and not change one: an entry is a statement of what
-- happened, and the grant says so.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_events"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "audit_events" TO kometio_app;--> statement-breakpoint
-- Default privileges give the role every right on a new table: the one that
-- must not be there is taken back.
REVOKE UPDATE ON "audit_events" FROM kometio_app;
