-- The second step of a sign-in (docs/adr/0137): a sealed secret and the codes
-- that stand in for it.
ALTER TYPE "public"."verification_token_purpose" ADD VALUE IF NOT EXISTS 'second-factor';--> statement-breakpoint
CREATE TABLE "user_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"spent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_second_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'totp' NOT NULL,
	"sealed_secret" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_second_factors" ADD CONSTRAINT "user_second_factors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_second_factors" ADD CONSTRAINT "user_second_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_recovery_codes_user_hash_idx" ON "user_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "user_second_factors_user_kind_idx" ON "user_second_factors" USING btree ("user_id","kind");--> statement-breakpoint

-- Tenant isolation, as on every other tenant-scoped table (see the policy
-- loop in 0000_baseline_schema.sql). The application's role may change both:
-- the step a code was accepted for moves forward, and a recovery code is
-- spent.
ALTER TABLE "user_second_factors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_second_factors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_second_factors"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());--> statement-breakpoint
ALTER TABLE "user_recovery_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_recovery_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_recovery_codes"
  USING (tenant_id = current_tenant())
  WITH CHECK (tenant_id = current_tenant());
