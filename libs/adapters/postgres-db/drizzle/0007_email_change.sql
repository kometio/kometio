ALTER TYPE "public"."verification_token_purpose" ADD VALUE 'email-change';--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD COLUMN "payload" text;