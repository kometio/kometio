/**
 * The exact source of CookieConsent.astro's `is:inline` pre-paint
 * visibility check — same reasoning and same technique as PromoBar's own
 * dismiss script (promo-bar-dismiss-script.ts): must run before first
 * paint, or a visitor who already consented sees a flash of the banner.
 * A fixed string (no per-request data — window.kometioConsent is already
 * defined by cookie-consent-bootstrap.ts's own head script by the time
 * this runs) so its CSP allowance is a sha256 hash, not a nonce.
 */
export const COOKIE_CONSENT_DISMISS_SCRIPT = `(function () {
  var banner = document.currentScript.parentElement;
  var reopenTab = document.querySelector('.kometio-cookie-consent-reopen');
  try {
    if (window.kometioConsent && window.kometioConsent.get()) {
      banner.hidden = true;
      if (reopenTab) reopenTab.hidden = false;
    }
  } catch (e) {
    // window.kometioConsent not defined yet (e.g. sandboxed preview) — leave
    // the banner visible rather than throwing.
  }
})();`;
