/**
 * The exact source of PromoBar.astro's `is:inline` dismiss-check script —
 * pulled out into its own string constant, not left as JSX-embedded
 * literal text, so its CSP hash (see content-security-policy.ts) is
 * computed from this exact same string instead of a hand-copied value
 * that could silently drift out of sync with the real script the next
 * time this file gets reformatted.
 */
export const PROMO_BAR_DISMISS_SCRIPT = `(function () {
  var bar = document.currentScript.parentElement;
  try {
    if (localStorage.getItem('kometio-promo-bar-dismissed') === 'true') {
      bar.style.display = 'none';
    }
  } catch (e) {
    // Storage non disponibile (anteprima sandboxata) — ignorato.
  }
})();`;
