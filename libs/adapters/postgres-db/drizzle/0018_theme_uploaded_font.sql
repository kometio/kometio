-- The font a site uploaded and draws its pages with (docs/adr/0147): a family
-- name and up to four files of the media library. Null for every site that
-- existed before it, which is what it means: none uploaded.
ALTER TABLE "sites" ADD COLUMN "theme_uploaded_font" jsonb;
