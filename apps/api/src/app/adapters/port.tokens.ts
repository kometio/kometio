/*
 * One token per port for the whole API. Which adapter answers each one is
 * decided once, in AdaptersModule; a module names the ports it uses in its
 * deps object, and a test that swaps one (a fake captcha) swaps it for
 * every module at once.
 *
 * These used to be declared per module: SITE_REPOSITORY was ten different
 * symbols built eleven times, and a test that replaced "the" captcha
 * replaced one module's.
 */

// Content, stored.
export const SITE_REPOSITORY = Symbol('SITE_REPOSITORY');
export const SITE_THEME_BLOCK_STYLES_REPOSITORY = Symbol(
  'SITE_THEME_BLOCK_STYLES_REPOSITORY',
);
export const SITE_AI_SETTINGS_REPOSITORY = Symbol(
  'SITE_AI_SETTINGS_REPOSITORY',
);
export const PAGE_GROUP_REPOSITORY = Symbol('PAGE_GROUP_REPOSITORY');
export const PAGE_GROUP_VERSION_REPOSITORY = Symbol(
  'PAGE_GROUP_VERSION_REPOSITORY',
);
export const PAGE_TRANSLATION_REPOSITORY = Symbol(
  'PAGE_TRANSLATION_REPOSITORY',
);
export const PAGE_TRANSLATION_VERSION_REPOSITORY = Symbol(
  'PAGE_TRANSLATION_VERSION_REPOSITORY',
);
export const COLLECTION_REPOSITORY = Symbol('COLLECTION_REPOSITORY');
export const REUSABLE_SECTION_REPOSITORY = Symbol(
  'REUSABLE_SECTION_REPOSITORY',
);
export const REUSABLE_SECTION_VERSION_REPOSITORY = Symbol(
  'REUSABLE_SECTION_VERSION_REPOSITORY',
);
export const SITE_LAYOUT_SECTION_REPOSITORY = Symbol(
  'SITE_LAYOUT_SECTION_REPOSITORY',
);
export const SITE_LAYOUT_SECTION_VERSION_REPOSITORY = Symbol(
  'SITE_LAYOUT_SECTION_VERSION_REPOSITORY',
);
export const TAXONOMY_REPOSITORY = Symbol('TAXONOMY_REPOSITORY');
export const SEARCH_PORT = Symbol('SEARCH_PORT');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const FORM_REPOSITORY = Symbol('FORM_REPOSITORY');
export const FORM_SUBMISSION_REPOSITORY = Symbol('FORM_SUBMISSION_REPOSITORY');
export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
export const IMPORT_JOB_REPOSITORY = Symbol('IMPORT_JOB_REPOSITORY');
export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
export const DATABASE_HEALTH = Symbol('DATABASE_HEALTH');
export const EXPIRED_RECORDS = Symbol('EXPIRED_RECORDS');
export const DASHBOARD_STATS_PORT = Symbol('DASHBOARD_STATS_PORT');
export const DEPLOYMENT_BOOTSTRAP_PORT = Symbol('DEPLOYMENT_BOOTSTRAP_PORT');

// Sessions and one-time tokens.
export const AUTH_PORT = Symbol('AUTH_PORT');
export const VERIFICATION_TOKEN_PORT = Symbol('VERIFICATION_TOKEN_PORT');
export const PREVIEW_TOKEN_PORT = Symbol('PREVIEW_TOKEN_PORT');

// Files.
export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
export const MEDIA_USAGE_PORT = Symbol('MEDIA_USAGE_PORT');
export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
export const THEME_CATALOG = Symbol('THEME_CATALOG');
/** `null` when the deployment has no theme volume: uploads are off. */
export const THEME_UPLOADS = Symbol('THEME_UPLOADS');
export const WORDPRESS_EXPORT_READER = Symbol('WORDPRESS_EXPORT_READER');

// What was typed, made safe to render.
export const CONTENT_SANITIZER = Symbol('CONTENT_SANITIZER');

// Services outside the API.
export const EMAIL_PORT = Symbol('EMAIL_PORT');
/** The language of the site this deployment serves — what an email falls back to (docs/adr/0100). Provided by DeploymentSiteModule. */
export const DEPLOYMENT_LOCALE = Symbol('DEPLOYMENT_LOCALE');
/** The captcha of this deployment, whole: `createCaptcha`'s answer, which CAPTCHA_PORT and CAPTCHA_CHALLENGE_PORT are the two halves of. */
export const DEPLOYMENT_CAPTCHA = Symbol('DEPLOYMENT_CAPTCHA');
export const CAPTCHA_PORT = Symbol('CAPTCHA_PORT');
/** `null` when the captcha is Cloudflare's, which makes its own challenges. */
export const CAPTCHA_CHALLENGE_PORT = Symbol('CAPTCHA_CHALLENGE_PORT');
export const NEWSLETTER_PORT = Symbol('NEWSLETTER_PORT');
/** `null` when the deployment's database is not one the single image runs itself: nothing here can dump it, and the editor offers no export. */
export const SITE_ARCHIVE = Symbol('SITE_ARCHIVE');
/** `null` when the deployment has nowhere to keep its secrets key: page generation is off. */
export const SECRET_CIPHER = Symbol('SECRET_CIPHER');
export const PAGE_GENERATOR_FACTORY = Symbol('PAGE_GENERATOR_FACTORY');
