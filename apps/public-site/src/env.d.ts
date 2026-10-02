/// <reference types="astro/client" />

import type { KometioConsentApi } from '@kometio/shared-types';
import type { KometioThemeLocals } from '@kometio/theme-runtime';

declare global {
  namespace App {
    interface Locals extends KometioThemeLocals {
      // Generated once per request by middleware.ts, shared with the matched
      // route's own frontmatter (Astro runs it as part of `next()`) so the
      // SAME value ends up both in the CSP header's `script-src` and on the
      // Tier 1 head/body script tags PageLayout.astro renders — see
      // `injectScriptNonce` in lib/content-security-policy.ts for why a
      // nonce has to be applied per-tag rather than inherited.
      cspNonce: string;
      /**
       * Which page, in which language, is being rendered — set by
       * PublicPageContent.astro (the one funnel every real route goes
       * through) and read by the Form block, which needs it to record
       * where a submission came from.
       *
       * Ambient rather than a BlockRenderer prop on purpose: it would
       * otherwise have to be threaded through every recursive render and
       * every block's signature for the benefit of one block — and that
       * block already reads request-scoped context directly (Astro.url's
       * query string, the Turnstile site key). `null` wherever there is
       * no page behind the render: a term with no landing page, a section
       * preview, a single block re-rendered for the canvas.
       */
      pageTranslationId: string | null;
    }
  }

  // Defined at runtime by cookie-consent-bootstrap.ts's is:inline script
  // (docs/adr/0039) — CookieConsent.astro's own UI script and its tests
  // read/call this global, never re-implement consent logic themselves.
  interface Window {
    kometioConsent: KometioConsentApi;
  }
}

export {};
