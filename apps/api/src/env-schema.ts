import { z } from 'zod';
import { STORAGE_PROVIDERS } from '@kometio/shared-types';

/**
 * Every env var apps/api reads, validated together in one place instead
 * of discovered one `requireEnv()` call at a time as each NestJS
 * module/factory happens to run — a deployment missing three variables
 * used to fail on the first one, get fixed, restart, fail on the second,
 * and so on. `validateApiEnv()` (called first thing in main.ts, before
 * `NestFactory.create()`) reports every problem at once.
 *
 * It is also the only way the app reads them: what it returns is the
 * typed `ApiEnv` that `API_ENV` hands to every factory, and lint refuses
 * `process.env` anywhere else in the app. A variable read beside this
 * schema was a variable a deployment could leave unset without being
 * told, or set with a typo nobody caught.
 *
 * Deliberately scoped to apps/api's own runtime needs only — not
 * `apps/editor-app` (Vite build-time `VITE_*` vars) or `apps/public-site`
 * (its own separate runtime), and not `POSTGRES_PASSWORD`/
 * `DEFAULT_USER_EMAIL`/`DEFAULT_USER_PASSWORD` (only used by the one-off
 * `db:seed`/migration scripts, a different process entirely, never read by
 * this app at runtime).
 */
/**
 * `KEY=` with nothing after it is how an example file leaves a variable the
 * person may fill in, and it has to mean "not set": read as the empty string it
 * failed `min(1)`, so a copied `.env.example` did not start.
 */
const emptyIsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const apiEnvBaseSchema = z.object({
  POSTGRES_APP_PASSWORD: z.string().min(1),
  // Where the database is: this machine in development, the `postgres`
  // service in docker-compose.prod.yml.
  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1).default('kometio'),
  // Optional since the first-run wizard: a self-hosted deployment that has
  // never been set up has no tenant to name here, and DeploymentTenantResolver
  // falls back to the single row in `tenants`. Still honoured when present —
  // development and the integration tests both pin it.
  DEFAULT_TENANT_ID: z.string().uuid().optional(),
  // Optional for the same reason, and read by DeploymentSiteResolver:
  // which site this deployment edits. Only needed for the one topology
  // where the tenant owns more than one (docs/adr/0032) — otherwise the
  // resolver takes the tenant's only site, which is what lets a
  // wizard-created deployment need no site id anywhere.
  DEFAULT_SITE_ID: z.string().uuid().optional(),
  PREVIEW_TOKEN_SECRET: z.string().min(1),
  EDITOR_APP_URL: z.string().url(),
  // Optional as a group: without SMTP_HOST the deployment has no mail server
  // and writes its emails to its log instead (docs/adr/0103); with it, the
  // other two are required (the `superRefine` below).
  SMTP_HOST: emptyIsUnset(z.string().min(1).optional()),
  SMTP_PORT: emptyIsUnset(z.coerce.number().int().positive().optional()),
  SMTP_FROM_ADDRESS: emptyIsUnset(z.string().min(1).optional()),
  // Optional: Mailpit in development needs none. Declared so the
  // production check sees an example placeholder left in them.
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MEDIA_UPLOAD_DIR: z.string().min(1),
  API_PUBLIC_URL: z.string().url(),
  // docs/adr/0042 — where FilesystemThemeCatalogAdapter scans for bundled
  // themes; see libs/adapters/filesystem-theme-catalog's own README for why
  // this differs between local dev and this app's pruned production image.
  THEMES_DIR: z.string().min(1),
  // docs/adr/0091 — the volume shared with the theme builder and the public
  // site. Optional: unset, theme uploads are off.
  THEME_DATA_DIR: z.string().min(1).optional(),
  // Narrows the bundled themes offered to one (docs/adr/0042). Unset:
  // every bundled theme.
  KOMETIO_THEME: z.string().min(1).optional(),
  // Page generation (docs/adr — page generation): where the key that seals
  // the AI provider's API key is generated and kept, or the key itself.
  // Neither set: page generation is off.
  KOMETIO_SECRETS_DIR: z.string().min(1).optional(),
  KOMETIO_SECRETS_KEY: z.string().min(1).optional(),
  // Lets a site's OpenAI-compatible server be inside the network — this
  // machine, a private range — for a model run locally. Off by default: an
  // admin could otherwise make the API call internal services.
  KOMETIO_AI_ALLOW_PRIVATE_HOSTS: z.enum(['true', 'false']).optional(),
  // Reverse proxies in front of the API (Caddy in docker-compose.prod.yml
  // is one), so each visitor keeps their own address for rate limits.
  // Unset: 0, the API reached directly.
  TRUSTED_PROXY_HOPS: z.string().regex(/^\d$/).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  // Optional: unset, the API trusts no visitor address the public site
  // forwards (public-pages-throttler.guard.ts).
  PUBLIC_API_SERVICE_TOKEN: emptyIsUnset(z.string().min(1).optional()),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Both groups below are opt-in (ADR-0013's LocalDisk-by-default, and
  // "no NEWSLETTER_PROVIDER = newsletter signup is a harmless no-op") —
  // their own variables are only required once the provider is actually
  // selected, enforced in the `superRefine` below, not by making them
  // required here unconditionally.
  MEDIA_STORAGE_PROVIDER: z.enum(STORAGE_PROVIDERS).default('local'),
  S3_MEDIA_BUCKET: z.string().optional(),
  S3_MEDIA_REGION: z.string().optional(),
  S3_MEDIA_ACCESS_KEY_ID: z.string().optional(),
  S3_MEDIA_SECRET_ACCESS_KEY: z.string().optional(),
  S3_MEDIA_PUBLIC_BASE_URL: z.string().optional(),
  // For an S3-compatible store that is not AWS (MinIO, R2): its address,
  // and whether it wants the bucket in the path rather than the host.
  S3_MEDIA_ENDPOINT: z.string().url().optional(),
  S3_MEDIA_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  NEWSLETTER_PROVIDER: z.enum(['mailchimp', 'brevo']).optional(),
  MAILCHIMP_API_KEY: z.string().optional(),
  MAILCHIMP_AUDIENCE_ID: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_LIST_ID: z.string().optional(),
});

const S3_REQUIRED_KEYS = [
  'S3_MEDIA_BUCKET',
  'S3_MEDIA_REGION',
  'S3_MEDIA_ACCESS_KEY_ID',
  'S3_MEDIA_SECRET_ACCESS_KEY',
  'S3_MEDIA_PUBLIC_BASE_URL',
] as const;

/** What an SMTP host cannot be used without. */
const SMTP_REQUIRED_KEYS = ['SMTP_PORT', 'SMTP_FROM_ADDRESS'] as const;

const MAILCHIMP_REQUIRED_KEYS = [
  'MAILCHIMP_API_KEY',
  'MAILCHIMP_AUDIENCE_ID',
] as const;
const BREVO_REQUIRED_KEYS = ['BREVO_API_KEY', 'BREVO_LIST_ID'] as const;

/** What `.env.prod.example` used to leave in place of a secret. */
const PLACEHOLDER = 'CHANGE_ME';

/**
 * Secrets that sign or authenticate something: a guessable one is a
 * forged preview link (drafts readable) or a forged visitor address.
 */
const SIGNING_SECRETS = [
  'PREVIEW_TOKEN_SECRET',
  'PUBLIC_API_SERVICE_TOKEN',
] as const;
const SIGNING_SECRET_MIN_LENGTH = 32;
const PASSWORD_MIN_LENGTH = 16;

/** Cloudflare's test secret keys (1x…, 2x…, 3x…): they pass or fail every captcha, whoever solves it. */
const TURNSTILE_TEST_SECRET = /^[123]x0+[A-Z]*$/;

/**
 * In the production image (NODE_ENV=production, set by its Dockerfile),
 * refuses to start on what a copied example leaves behind: a
 * placeholder, a short signing secret, a short database password, a test
 * captcha key. Development and CI run without NODE_ENV and keep theirs.
 */
function refuseExampleSecrets(
  env: z.infer<typeof apiEnvBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  if (env.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  for (const [key, value] of Object.entries(env)) {
    if (value === PLACEHOLDER) {
      fail(key, `${key} is still ${PLACEHOLDER}: set a real value`);
    }
  }
  for (const key of SIGNING_SECRETS) {
    const value = env[key];
    if (value !== undefined && value.length < SIGNING_SECRET_MIN_LENGTH) {
      fail(
        key,
        `${key} must be at least ${SIGNING_SECRET_MIN_LENGTH} characters (openssl rand -hex 32)`,
      );
    }
  }
  if (env.POSTGRES_APP_PASSWORD.length < PASSWORD_MIN_LENGTH) {
    fail(
      'POSTGRES_APP_PASSWORD',
      `POSTGRES_APP_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (TURNSTILE_TEST_SECRET.test(env.TURNSTILE_SECRET_KEY)) {
    fail(
      'TURNSTILE_SECRET_KEY',
      "TURNSTILE_SECRET_KEY is a Cloudflare test key, which accepts every captcha: use your site's own",
    );
  }
}

export const apiEnvSchema = apiEnvBaseSchema.superRefine((env, ctx) => {
  refuseExampleSecrets(env, ctx);
  if (env.SMTP_HOST !== undefined) {
    for (const key of SMTP_REQUIRED_KEYS) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when SMTP_HOST is set`,
        });
      }
    }
  }
  if (env.MEDIA_STORAGE_PROVIDER === 's3') {
    for (const key of S3_REQUIRED_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when MEDIA_STORAGE_PROVIDER=s3`,
        });
      }
    }
  }
  if (env.NEWSLETTER_PROVIDER === 'mailchimp') {
    for (const key of MAILCHIMP_REQUIRED_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when NEWSLETTER_PROVIDER=mailchimp`,
        });
      }
    }
  }
  if (env.NEWSLETTER_PROVIDER === 'brevo') {
    for (const key of BREVO_REQUIRED_KEYS) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when NEWSLETTER_PROVIDER=brevo`,
        });
      }
    }
  }
});

/** The environment as the app reads it: validated, with its defaults applied. */
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * A variable the schema requires only in some configurations
 * (S3_MEDIA_BUCKET once MEDIA_STORAGE_PROVIDER=s3), read in one of them.
 * validateApiEnv has already refused to start without it, so this narrows
 * its type; called where the schema does not require it, it still fails
 * loudly instead of handing an adapter `undefined`.
 */
export function requiredIn<K extends keyof ApiEnv>(
  env: ApiEnv,
  key: K,
): NonNullable<ApiEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Throws one Error listing every missing/invalid variable, not just the first. */
export function validateApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const result = apiEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\n` +
        'Set them in the .env this deployment reads, then restart. For local ' +
        'development that file comes from .env.example (docs/development.md); ' +
        'for a self-hosted deployment from .env.prod.example ' +
        '(docs/self-hosting.md). They can also be exported directly.',
    );
  }
  return result.data;
}
