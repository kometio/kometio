-- Two accounts whose addresses differ only by case cannot both stay: the
-- index below would refuse to build, with a message about an index. Say what
-- is wrong and which addresses, so whoever upgrades knows what to merge.
DO $$
DECLARE
  clash text;
BEGIN
  SELECT string_agg(emails, '; ') INTO clash FROM (
    SELECT string_agg(email, ', ' ORDER BY email) AS emails
      FROM users
     GROUP BY tenant_id, lower(email)
    HAVING count(*) > 1
  ) AS clashes;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'users: these accounts differ only by the case of their email and must be merged or renamed before upgrading: %', clash;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_id_email_lower_unique" ON "users" USING btree ("tenant_id",lower("email"));
