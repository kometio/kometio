// Public by design — a Turnstile site key is meant to be embedded in
// client-side code, unlike TURNSTILE_SECRET_KEY (server-side only, verifies
// the token). Falls back to Cloudflare's own "always passes" test site key
// (security review 2026-08-24, point 13) — same fallback pattern as
// PUBLIC_SITE_URL above.
export const TURNSTILE_SITE_KEY =
  (import.meta.env['VITE_TURNSTILE_SITE_KEY'] as string | undefined) ??
  '1x00000000000000000000AA';
