import type { BlockBehavior } from './types';

// Idempotency guard: `{ once: true }` on the click listener already stops
// a double-fire on the SAME element, but re-running this on an
// already-replaced trigger (a live-patched block re-running behaviors on
// an element that's already gone) must still be a safe no-op — see
// run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-consent-embed-initialized';

function wireConsentGatedEmbed(button: HTMLElement): void {
  if (
    !(button instanceof HTMLButtonElement) ||
    button.hasAttribute(INITIALIZED_ATTR)
  ) {
    return;
  }
  button.setAttribute(INITIALIZED_ATTR, '');

  button.addEventListener(
    'click',
    () => {
      const iframe = document.createElement('iframe');
      iframe.src = button.dataset.embedSrc ?? '';
      iframe.title = button.dataset.embedTitle ?? '';
      iframe.loading = 'lazy';
      iframe.allowFullscreen = true;
      iframe.className = 'kometio-consent-embed__iframe';
      button.replaceWith(iframe);
    },
    { once: true },
  );
}

// Shared by VideoEmbed and MapEmbed (both render ConsentGatedEmbed.astro,
// see that file's own comment) — registered under both block types in
// block-behavior-registry.ts, same pattern as Form/NewsletterSignup
// sharing turnstileBehaviors.
export const consentGatedEmbedBehaviors: BlockBehavior[] = [
  { selector: '.kometio-consent-embed__trigger', wire: wireConsentGatedEmbed },
];
