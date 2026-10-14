ALTER TABLE "page_translations" ADD COLUMN "scheduled_publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "page_translations" ADD COLUMN "scheduled_by" uuid;--> statement-breakpoint
ALTER TABLE "page_translations" ADD COLUMN "schedule_failure" text;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_scheduled_by_users_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_translations_due_idx" ON "page_translations" USING btree ("tenant_id","scheduled_publish_at") WHERE "page_translations"."scheduled_publish_at" is not null;