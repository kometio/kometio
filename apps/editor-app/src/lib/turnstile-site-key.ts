import { containerValue } from './runtime-config';

/** Cloudflare's own "always passes" test site key. */
const TEST_SITE_KEY = '1x00000000000000000000AA';

/**
 * The captcha's public key: public by design — a Turnstile site key is meant
 * to be embedded in client-side code, unlike TURNSTILE_SECRET_KEY (server-side
 * only, verifies the token).
 *
 * Read when the editor starts, like its two addresses (docs/adr/0076): what
 * the container wrote, then what the build knew, then Cloudflare's test key
 * (security review 2026-08-24, point 13). It was a build input alone, and the
 * published image is built without one: the build set it to the empty string,
 * which `??` does not take for "unset", so the widget was handed `""` and the
 * login button stayed disabled for everyone who pulled the image.
 *
 * An empty value is "unset" at every step, for that reason.
 */
export function turnstileSiteKey(): string {
  const built: unknown = import.meta.env['VITE_TURNSTILE_SITE_KEY'];
  return (
    containerValue('turnstileSiteKey') ??
    (typeof built === 'string' && built.length > 0 ? built : TEST_SITE_KEY)
  );
}
