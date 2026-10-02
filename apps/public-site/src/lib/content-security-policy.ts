import { createHash } from 'node:crypto';
import type { TrackerDomainEntry } from '@kometio/shared-types';
import { PROMO_BAR_DISMISS_SCRIPT } from '../components/blocks/promo-bar-dismiss-script';
import { COOKIE_CONSENT_DISMISS_SCRIPT } from '../components/cookie-consent-dismiss-script';
import { COOKIE_CONSENT_PANEL_SCRIPT } from '../components/cookie-consent-panel-script';
import { BOOKING_EMBED_HOSTS } from './booking-embed';

/**
 * Most core blocks' own `<script>` (no `is:inline`) get bundled by Astro
 * into an external, same-origin file — already covered by `'self'`. That
 * only holds when the script's module is reachable from a second entry
 * point too (Tabs/HamburgerMenu's behavior modules are also imported by
 * the live-canvas re-init system) — a script imported from exactly one
 * place gets inlined directly into the SSR HTML regardless of `import`
 * statements (confirmed the hard way against a real `astro build`, not
 * just `astro dev` — see cookie-consent-panel-script.ts's own comment).
 * `is:inline` scripts with no per-request data (PromoBar's/CookieConsent's
 * own pre-paint dismiss-checks, and CookieConsent's click-delegation
 * script) go through this hash allowlist instead of a blanket
 * `'unsafe-inline'` — each computed from the same string its component
 * renders, so it can never drift out of sync with the actual content.
 */
function scriptHash(source: string): string {
  const digest = createHash('sha256').update(source).digest('base64');
  return `'sha256-${digest}'`;
}

/**
 * `script-src`/`style-src` stay otherwise as tight as `'self'` (plus the
 * hashes above) allows: `embed-html` (see EmbedHtml.astro) is a
 * deliberate product feature letting a site owner paste arbitrary
 * third-party HTML/JS (analytics snippets, chat widgets, Calendly, ...).
 * It runs isolated in a sandboxed `<iframe>` with its own permissive CSP
 * (declared inside the srcdoc itself, see EmbedHtml.astro) — this policy
 * only has to cover everything Kometio's OWN 48 blocks + Astro's own bundled
 * scripts need, which is why it can stay strict everywhere instead of
 * being loosened to accommodate that isolated iframe's own separate
 * policy.
 *
 * Every other directive here has zero legitimate use case on a page this
 * product renders, so there's no tradeoff to weigh: `object-src 'none'`
 * (no plugins), `base-uri 'self'` (no `<base>`-tag hijack of relative
 * URLs), `upgrade-insecure-requests` (no accidental http:// subresource).
 * `frame-ancestors` is the one directive real callers need to vary (the
 * editor's own live-preview route embeds a page in an iframe from
 * EDITOR_APP_URL, every real published page never should be), so it's a
 * parameter here rather than baked in.
 */
// Form.astro/NewsletterSignup.astro's anti-spam widget (docs/adr/0020) —
// its script renders its own challenge inside an iframe from this same
// host, and calls home to verify solve state.
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// VideoEmbed.astro/MapEmbed.astro's click-to-load iframes (ConsentGatedEmbed)
// — every embeddable host is normalized to exactly one of these three by
// video-embed.ts/MapEmbed.astro itself (YouTube/Vimeo URLs are parsed and
// re-built into one canonical embed URL, Google Maps only ever gets built
// from a fixed template), never an arbitrary user-supplied iframe src.
const EMBEDDABLE_FRAME_ORIGINS = [
  TURNSTILE_ORIGIN,
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.google.com',
  // BookingEmbed — the booking services' own hosts, the same list
  // booking-embed.ts accepts an address from.
  ...Object.values(BOOKING_EMBED_HOSTS)
    .flat()
    .map((host) => `https://${host}`),
];

/**
 * Curated allowlist for the Tier 1 head/body script field (ADR-0021) — the
 * 3 trackers site owners actually ask for. Not a general-purpose mechanism
 * (see the deferred admin-managed-whitelist idea): each of these needs
 * BOTH a nonce (for the inline bootstrap snippet the owner pastes, see
 * `injectScriptNonce` below) AND these origins (for what that snippet then
 * loads/calls from Google's/Meta's own domains) — a nonce alone doesn't
 * unblock the follow-up requests, and an origin allowlist alone doesn't
 * unblock the pasted inline snippet itself.
 */
const GOOGLE_TAG_MANAGER_ORIGIN = 'https://www.googletagmanager.com';
const GOOGLE_ANALYTICS_ORIGINS = [
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
];
const META_PIXEL_SCRIPT_ORIGIN = 'https://connect.facebook.net';
// Also the noscript `<img>` fallback pixel Meta's own snippet includes.
const META_PIXEL_BEACON_ORIGIN = 'https://www.facebook.com';

/**
 * ADR-0031's admin-managed tracker whitelist (`themeSettings.allowedTrackerDomains`)
 * — each entry gets `https://` prepended (the schema only ever stores a bare
 * host, see site-theme-settings.ts's trackerDomainSchema) and is added to
 * `script-src`/`connect-src`/`frame-src` only. NOT `img-src`/`font-src`/
 * `style-src`: those already allow any `https:` origin below (see their own
 * entries), so adding a specific domain there would be strictly redundant —
 * these 3 are the only directives in this policy narrow enough for a
 * per-site addition to actually change anything.
 */
function trackerOrigins(allowedTrackerDomains: TrackerDomainEntry[]): string {
  return allowedTrackerDomains
    .map((entry) => `https://${entry.domain}`)
    .join(' ');
}

export function buildContentSecurityPolicy(
  frameAncestors: string,
  nonce: string,
  allowedTrackerDomains: TrackerDomainEntry[] = [],
): string {
  const extra = trackerOrigins(allowedTrackerDomains);
  const withExtra = (base: string) => (extra ? `${base} ${extra}` : base);

  return [
    `default-src 'self'`,
    withExtra(
      `script-src 'self' 'nonce-${nonce}' ${TURNSTILE_ORIGIN} ${GOOGLE_TAG_MANAGER_ORIGIN} ${META_PIXEL_SCRIPT_ORIGIN} ${scriptHash(PROMO_BAR_DISMISS_SCRIPT)} ${scriptHash(COOKIE_CONSENT_DISMISS_SCRIPT)} ${scriptHash(COOKIE_CONSENT_PANEL_SCRIPT)}`,
    ),
    `style-src 'self' 'unsafe-inline' https:`,
    `img-src 'self' data: https: ${META_PIXEL_BEACON_ORIGIN}`,
    `font-src 'self' https: data:`,
    withExtra(`frame-src ${EMBEDDABLE_FRAME_ORIGINS.join(' ')}`),
    withExtra(
      `connect-src 'self' ${TURNSTILE_ORIGIN} ${GOOGLE_TAG_MANAGER_ORIGIN} ${GOOGLE_ANALYTICS_ORIGINS.join(' ')} ${META_PIXEL_BEACON_ORIGIN}`,
    ),
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors ${frameAncestors}`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

/**
 * Tier 1 head/body scripts (ADR-0021) are raw, admin-trusted HTML —
 * verbatim third-party snippets (GTM/GA4/Meta Pixel, ...) the site owner
 * pastes as-is, never parsed into Kometio's own template. A CSP `nonce` only
 * has any effect when it's an attribute on the actual `<script>` tag
 * itself (it doesn't propagate to a wrapping element or inherit down), so
 * the pasted snippet's own `<script>` tags need it inserted directly.
 * Regex-based rather than a full HTML parse: this content is already
 * unsanitized/unescaped by design (same trust level as editing pages/
 * blocks directly, see the comment where this is called), so a full
 * parser would be defending against a threat model that doesn't apply
 * here — it only needs to handle the shape every real analytics snippet
 * actually has (one or more plain `<script>`/`<script ...>` tags).
 */
export function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`);
}
