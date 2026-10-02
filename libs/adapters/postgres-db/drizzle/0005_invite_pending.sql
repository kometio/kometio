-- Until now a person waiting to join and one an admin switched off were the
-- same row (is_active = false). The new flag says which; the column starts
-- false for everybody, and the people who are waiting today are found the
-- only way the old data allows: still inactive, with an invitation link
-- that has not been used (a link is deleted when it is).
ALTER TABLE "users" ADD COLUMN "invite_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "invite_pending" = true
WHERE "is_active" = false
  AND EXISTS (
    SELECT 1 FROM "verification_tokens" AS t
    WHERE t."user_id" = "users"."id" AND t."purpose" = 'user-invite'
  );
