-- Who is emailed each submission becomes a list (docs/adr/0086). The one
-- address a form had becomes the first entry of its list; a blank one
-- becomes an empty list, which is what "nobody" is now. The old column
-- goes in the next migration, once nothing reads it.
ALTER TABLE "forms" ADD COLUMN "notification_emails" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "forms"
SET "notification_emails" = ARRAY[btrim("notification_email")]
WHERE "notification_email" IS NOT NULL AND btrim("notification_email") <> '';
