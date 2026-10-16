-- The owner's choice of whether a form, and the newsletter signup, ask for the captcha
-- built into Kometio (docs/adr/0145). True for every form and site that existed before it:
-- they all asked, as they did.
ALTER TABLE "forms" ADD COLUMN "captcha_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "newsletter_captcha_enabled" boolean DEFAULT true NOT NULL;