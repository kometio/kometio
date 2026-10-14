import type { BlockBehavior } from './types';

// Idempotency guard: `{ once: true }` on the click listener already stops
// a double-fire on the SAME element, but re-running this on an
// already-replaced trigger (a live-patched block re-running behaviors on
// an element that's already gone) must still be a safe no-op — see
// run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-consent-embed-initialized';

/**
 * What a visitor must have agreed to, in the banner, for the embed to load
 * without being asked (docs/adr/0131). A video, a map and a booking calendar
 * are third parties' pages: the same category the banner calls experience.
 */
const DEFAULT_CATEGORY = 'experience';

/** Whether the banner has been answered, for `category`, with a yes. No consent API (the canvas, a page with no banner) is no. */
function hasAgreedTo(category: string): boolean {
  const consent: Partial<Window['kometioConsent']> | undefined =
    window.kometioConsent;
  return typeof consent?.has === 'function' && consent.has(category) === true;
}

function wireConsentGatedEmbed(button: HTMLElement): void {
  if (
    !(button instanceof HTMLButtonElement) ||
    button.hasAttribute(INITIALIZED_ATTR)
  ) {
    return;
  }
  button.setAttribute(INITIALIZED_ATTR, '');

  const load = () => {
    // Already replaced by whichever of the click and the consent came first.
    if (!button.isConnected) return;
    const iframe = document.createElement('iframe');
    iframe.src = button.dataset.embedSrc ?? '';
    iframe.title = button.dataset.embedTitle ?? '';
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.className = 'kometio-consent-embed__iframe';
    button.replaceWith(iframe);
  };

  button.addEventListener('click', load, { once: true });

  // The visitor who has already agreed — now, or when they answer the banner
  // — is not asked a second time. With no banner nobody can have agreed, and
  // the embed stays behind its button as it always did.
  const category = button.dataset.embedCategory ?? DEFAULT_CATEGORY;
  if (hasAgreedTo(category)) {
    load();
    return;
  }
  const onConsent = () => {
    if (!hasAgreedTo(category)) return;
    document.removeEventListener('kometio-consent-updated', onConsent);
    load();
  };
  document.addEventListener('kometio-consent-updated', onConsent);
}

// Shared by VideoEmbed and MapEmbed (both render ConsentGatedEmbed.astro,
// see that file's own comment) — registered under both block types in
// block-behavior-registry.ts, same pattern as Form/NewsletterSignup
// sharing turnstileBehaviors.
export const consentGatedEmbedBehaviors: BlockBehavior[] = [
  { selector: '.kometio-consent-embed__trigger', wire: wireConsentGatedEmbed },
];
