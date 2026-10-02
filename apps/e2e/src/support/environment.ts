import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireEnv } from '@kometio/env-config';

// Locally the suite reads the same root .env the three apps do; in CI the
// job's own environment is already set and there is no file. Variables
// already in the environment win, as they do for the apps.
const ENV_FILE = resolve(import.meta.dirname, '../../../../.env');
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

/** A base URL that relative paths resolve INSIDE of, not next to. */
function asBase(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * What the suite runs against, read from the variables the apps themselves
 * read, so the suite and the stack it drives cannot disagree about where
 * anything is.
 */
export const environment = {
  apiUrl: asBase(requireEnv('VITE_API_URL')),
  editorUrl: asBase(requireEnv('EDITOR_APP_URL')),
  publicSiteUrl: asBase(requireEnv('VITE_PUBLIC_SITE_URL')),
  mailpitUrl: asBase(process.env.MAILPIT_URL ?? 'http://localhost:8025'),
  adminEmail: requireEnv('DEFAULT_USER_EMAIL'),
  adminPassword: requireEnv('DEFAULT_USER_PASSWORD'),
  /** Where the logged-in session is kept between the setup and the tests. */
  storageStatePath: resolve(
    import.meta.dirname,
    '../../../../dist/e2e/.auth/admin.json',
  ),
} as const;
