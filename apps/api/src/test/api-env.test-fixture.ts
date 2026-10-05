import { validateApiEnv, type ApiEnv } from '../env-schema';

/** Invented values for every variable the API always requires. */
const REQUIRED: NodeJS.ProcessEnv = {
  POSTGRES_APP_PASSWORD: 'an-invented-app-password',
  PREVIEW_TOKEN_SECRET: 'an-invented-preview-secret',
  EDITOR_APP_URL: 'http://localhost:4200',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM_ADDRESS: 'noreply@esempio.test',
  MEDIA_UPLOAD_DIR: './uploads',
  API_PUBLIC_URL: 'http://localhost:3000/api',
  TURNSTILE_SITE_KEY: 'an-invented-turnstile-site-key',
  TURNSTILE_SECRET_KEY: 'an-invented-turnstile-secret',
  THEMES_DIR: './themes',
};

/**
 * An environment as the app reads it, for a factory's spec: the required
 * variables with invented values, then `overrides` as given — set
 * straight onto the result, so a spec can also build one the schema
 * would refuse (S3 chosen, its bucket missing).
 */
export function testApiEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return { ...validateApiEnv(REQUIRED), ...overrides };
}
