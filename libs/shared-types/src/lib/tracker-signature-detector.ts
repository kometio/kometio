import type { ConsentCategory } from './cookie-consent';

export interface DetectedTracker {
  vendor: string;
  category: ConsentCategory;
  html: string;
}

export interface TrackerDetectionResult {
  detected: DetectedTracker[];
  // The input with every detected snippet removed — what's left over is
  // either custom code or an unrecognized vendor, and stays in the legacy
  // free-text field, always executed as "necessary" (docs/adr/0039).
  remainingHtml: string;
}

interface TrackerSignature {
  vendor: string;
  category: ConsentCategory;
  pattern: RegExp;
}

/**
 * The same 3 vendors already hardcoded as CSP origins in
 * content-security-policy.ts ("the 3 trackers site owners actually ask
 * for") — detected here by matching against the well-known script URL or
 * global-function-call each vendor's own snippet always contains. Default
 * category is a starting point, not a compliance judgment — the admin can
 * always recategorize a detected entry afterward in Integrazioni.
 */
const TRACKER_SIGNATURES: TrackerSignature[] = [
  {
    vendor: 'Google Tag Manager',
    category: 'measurement',
    pattern: /googletagmanager\.com\/gtm\.js/i,
  },
  {
    vendor: 'Google Analytics (GA4)',
    category: 'measurement',
    pattern: /googletagmanager\.com\/gtag\/js|gtag\(\s*['"]config['"]/i,
  },
  {
    vendor: 'Meta Pixel',
    category: 'experience',
    pattern:
      /connect\.facebook\.net\/[^'"]*\/fbevents\.js|fbq\(\s*['"]init['"]/i,
  },
];

// Same assumption injectScriptNonce() already makes (content-security-policy.ts):
// every real analytics snippet is one or more plain <script>...</script>
// tags, so a full HTML parse isn't needed to find their boundaries. A
// vendor's own <noscript> fallback (e.g. GTM's iframe) is NOT matched by
// this pattern and stays in remainingHtml, unextracted — a known,
// documented limitation (docs/adr/0039), not an oversight.
//
// The closing tag is `<\/script\b[^>]*>` — mirroring the opening tag's own
// `<script\b[^>]*>` — not the literal `<\/script>` or even `<\/script\s*>`.
// A real HTML parser treats ANY `</script` followed by a word boundary and
// arbitrary non-`>` content (not just whitespace, e.g. `</script data-x>`
// or `</script\t\nbar>`) as the closing tag. CodeQL flagged both narrower
// versions (js/incomplete-html-attribute-sanitization-2): a script this
// pattern fails to fully match leaves a bare `<script` fragment in
// `remainingHtml`, which is later re-injected via `set:html` in
// PageLayout.astro.
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;

/**
 * Scans a free-text head/body script blob (themeHeadScript/themeBodyScript)
 * for known-vendor `<script>` tags and splits them out. Pure and
 * order-preserving within `remainingHtml`; called from
 * update-site-theme-settings.use-case.ts on every save, and on demand from
 * the "Rileva di nuovo" button in Integrazioni.
 *
 * A detected match is replaced with a single space, never `''` — deleting
 * to nothing risks splicing the surrounding leftovers into a brand new
 * `<script` sequence that was never in the original input (the classic
 * "incomplete multi-character sanitization" bug, CodeQL
 * js/incomplete-multi-character-sanitization: e.g. `<scri` immediately
 * followed by a removed `<script>...</script>` immediately followed by
 * `pt>` — deleting only the middle leaves `<scri` + `pt>` = a literal
 * `<script>` that was never there before). HTML tag names can't contain
 * whitespace, so a single space between two leftover fragments makes that
 * reconstruction impossible regardless of what precedes or follows the
 * removed match — a stronger guarantee than a fixed-point retry loop
 * gives (a loop only catches a reconstruction that happens to form a
 * *complete* new open+close pair; it can't catch one that only
 * reconstructs a bare, unclosed `<script` opening tag, which is exactly
 * what the `<scri`+`pt>` case above produces).
 */
export function detectKnownTrackers(html: string): TrackerDetectionResult {
  const detected: DetectedTracker[] = [];

  const remainingHtml = html
    .replace(SCRIPT_TAG_PATTERN, (scriptTag) => {
      const signature = TRACKER_SIGNATURES.find((candidate) =>
        candidate.pattern.test(scriptTag),
      );
      if (!signature) {
        return scriptTag;
      }
      detected.push({
        vendor: signature.vendor,
        category: signature.category,
        html: scriptTag,
      });
      return ' ';
    })
    .trim();

  return { detected, remainingHtml };
}
