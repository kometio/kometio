import { requireViteEnv } from './require-vite-env';

/**
 * Where the API and the public site live, read when the editor starts
 * rather than when it was built (docs/adr/0076).
 *
 * These two values used to be compiled into the bundle, so the published
 * image carried whatever host it was built against — `localhost:3000` for
 * the images on the registry, which is the one host a self-hoster never
 * means. Changing a domain meant rebuilding rather than restarting.
 *
 * The container writes `/config.js` at start from its own environment and
 * serves it before the bundle; this reads what that file set. A plain
 * `nx build` emits the same file from the build-time variables, so serving
 * `dist/` from any static host still works with no extra step, and in dev
 * the vite server generates it on the fly.
 *
 * The build-time variable stays as the fallback, for the case where the
 * file was not served at all (a stale cache, a proxy that swallowed it):
 * better the address the build knew than a blank screen.
 */
export interface KometioRuntimeConfig {
  apiUrl?: string;
  publicSiteUrl?: string;
  /** Public by design, like the two addresses: see turnstile-site-key.ts. */
  turnstileSiteKey?: string;
}

declare global {
  interface Window {
    __KOMETIO_CONFIG__?: KometioRuntimeConfig;
  }
}

/**
 * A value the container never replaced — `config.js` ships with these so
 * an unset variable reads as "nothing here", not as a literal `${VAR}`
 * arriving at `fetch`.
 */
function isUsable(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('${');
}

/** What the container wrote for `key`, or `undefined` if it wrote nothing usable. */
export function containerValue(
  key: keyof KometioRuntimeConfig,
): string | undefined {
  const value =
    typeof window === 'undefined'
      ? undefined
      : window.__KOMETIO_CONFIG__?.[key];
  return isUsable(value) ? value : undefined;
}

function runtimeValue(
  key: keyof KometioRuntimeConfig,
  viteName: string,
): string {
  return containerValue(key) ?? requireViteEnv(viteName);
}

export function apiBaseUrl(): string {
  return runtimeValue('apiUrl', 'VITE_API_URL');
}

export function publicSiteUrl(): string {
  return runtimeValue('publicSiteUrl', 'VITE_PUBLIC_SITE_URL');
}
