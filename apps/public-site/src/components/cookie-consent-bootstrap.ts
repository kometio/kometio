/**
 * Docs/adr/0039's "prior blocking" activator. Rendered as one `is:inline`
 * script in `<head>`, nonce'd like any other per-request inline script
 * (content-security-policy.ts) — unlike PromoBar's dismiss-check
 * (promo-bar-dismiss-script.ts), this script's own source varies per
 * request (it embeds the real CSP nonce as a literal), so it can't use the
 * fixed-string sha256-hash technique that script uses; a nonce is the
 * right tool here instead.
 *
 * Why the nonce is embedded as a JS string literal rather than left on the
 * gated `<template>`'s own inner `<script>` tags server-side: browsers
 * scrub a `nonce` CONTENT ATTRIBUTE the instant they parse it (exposing
 * the real value only via the `.nonce` IDL property) specifically to stop
 * an XSS payload from reading a valid nonce off the page and reusing it —
 * and whether that hidden value survives `cloneNode()` on inert template
 * content is inconsistent enough across engines that real consent-
 * management platforms don't rely on it. Setting `.nonce` explicitly in
 * JS at activation time, from a value this same trusted per-request
 * script already carries, sidesteps that entirely.
 */
export function buildCookieConsentBootstrap(nonce: string): string {
  return `(function () {
  var NONCE = ${JSON.stringify(nonce)};
  var COOKIE_NAME = 'kometio_consent';
  var MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

  function readCookie() {
    var match = document.cookie.match(/(?:^|; )kometio_consent=([^;]*)/);
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch (e) {
      return null;
    }
  }

  function has(record, category) {
    if (category === 'necessary') return true;
    return !!(record && record.cats && record.cats[category]);
  }

  function activate(template) {
    var fragment = template.content.cloneNode(true);
    var scripts = fragment.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      scripts[i].nonce = NONCE;
    }
    template.replaceWith(fragment);
  }

  function activateMatching(record) {
    var templates = document.querySelectorAll('template[data-kometio-consent]');
    for (var i = 0; i < templates.length; i++) {
      var tpl = templates[i];
      if (has(record, tpl.getAttribute('data-kometio-consent'))) {
        activate(tpl);
      }
    }
  }

  activateMatching(readCookie());
  document.addEventListener('DOMContentLoaded', function () {
    activateMatching(readCookie());
  });

  window.kometioConsent = {
    get: readCookie,
    has: function (category) {
      return has(readCookie(), category);
    },
    apply: function (prefs) {
      var existing = readCookie();
      var record = {
        v: 1,
        id: (existing && existing.id) || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
        ts: new Date().toISOString(),
        cats: {
          functionality: !!prefs.functionality,
          measurement: !!prefs.measurement,
          experience: !!prefs.experience,
        },
      };
      var secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        COOKIE_NAME +
        '=' +
        encodeURIComponent(JSON.stringify(record)) +
        '; Path=/; Max-Age=' +
        MAX_AGE_SECONDS +
        '; SameSite=Lax' +
        secure;
      activateMatching(record);
      document.dispatchEvent(new CustomEvent('kometio-consent-updated', { detail: record }));
    },
    openPreferences: function () {
      document.dispatchEvent(new CustomEvent('kometio-consent-open-preferences'));
    },
  };
})();`;
}
