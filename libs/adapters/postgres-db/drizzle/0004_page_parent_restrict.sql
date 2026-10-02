-- A page deleted under the old ON DELETE SET NULL moved its subpages to the
-- top level while their translations still named it as their parent: those
-- subpages answered 404 everywhere. The copy now follows its page again,
-- before the foreign key below is added (it would refuse these rows). A
-- slug already taken at the new level gets the page id's first eight
-- characters, rather than failing the migration.
UPDATE "page_translations" AS t
SET
  "parent_group_id" = g."parent_id",
  "slug" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "page_translations" AS other
      WHERE other."id" <> t."id"
        AND other."tenant_id" = t."tenant_id"
        AND other."site_id" = t."site_id"
        AND other."locale" = t."locale"
        AND other."slug" = t."slug"
        AND other."parent_group_id" IS NOT DISTINCT FROM g."parent_id"
    )
    THEN t."slug" || '-' || left(g."id"::text, 8)
    ELSE t."slug"
  END
FROM "page_groups" AS g
WHERE g."id" = t."page_group_id"
  AND t."parent_group_id" IS DISTINCT FROM g."parent_id";
--> statement-breakpoint
ALTER TABLE "page_groups" DROP CONSTRAINT "page_groups_parent_id_page_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "page_groups" ADD CONSTRAINT "page_groups_parent_id_page_groups_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."page_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_parent_group_id_page_groups_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."page_groups"("id") ON DELETE restrict ON UPDATE no action;