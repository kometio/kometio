-- The owner's "this site does not move" switch (docs/adr/0142). True for every site
-- that existed before it: they all moved exactly as their theme said.
ALTER TABLE "sites" ADD COLUMN "theme_motion_enabled" boolean DEFAULT true NOT NULL;
