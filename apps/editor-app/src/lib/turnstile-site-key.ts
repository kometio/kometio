import { containerValue } from './runtime-config';

/**
 * The site's Cloudflare Turnstile public key, or `null` when it has none and
 * the captcha is the one built into Kometio (docs/adr/0103).
 *
 * Public by design: a Turnstile site key is meant to be embedded in
 * client-side code, unlike TURNSTILE_SECRET_KEY (server-side only, verifies the
 * token). The rule is the API's own: with both keys the captcha is
 * Cloudflare's, with neither it is the built-in one, and the schema refuses
 * one alone. So the editor draws the widget of whichever has its key here.
 *
 * Read when the editor starts, like its two addresses (docs/adr/0076): what
 * the container wrote, then what the build knew. The build is the fallback
 * for a development server and for a build made for one site; the published
 * image is built without one, and the build turns that into the empty string,
 * which `??` does not take for "unset": the widget was handed `""` and the
 * login button stayed disabled for everyone who pulled the image. An empty
 * value is "unset" at every step, for that reason.
 *
 * It used to fall back to Cloudflare's test key, a captcha that passes
 * everybody. Nothing falls back to that now: no key means a real captcha.
 */
export function turnstileSiteKey(): string | null {
  const built: unknown = import.meta.env['VITE_TURNSTILE_SITE_KEY'];
  return (
    containerValue('turnstileSiteKey') ??
    (typeof built === 'string' && built.length > 0 ? built : null)
  );
}
