import type { BlockBehavior } from './types';

interface TurnstileGlobal {
  render: (container: HTMLElement, options: { sitekey: string }) => string;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

// render=explicit: without it, Turnstile's own script auto-scans the WHOLE
// document for `.cf-turnstile` elements once, when it finishes loading —
// which only ever catches the first widget on a page with two (Form +
// NewsletterSignup, or two Forms) rendered via the isolated single-block-
// fragment endpoint (each block renders independently, no shared page
// context for the auto-scan to run against a second time). Explicit
// render, one call per element, works the same whether the widget existed
// at initial page load or arrived via a live canvas insert/patch.
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`,
      );
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(), { once: true });
      document.head.append(script);
    });
  }
  return scriptLoadPromise;
}

// Idempotency guard: render() throws if called twice on the same element
// (Cloudflare's own API) — needed both because a page can have this
// behavior run more than once (see run-block-behaviors.ts) and because
// Form.astro and NewsletterSignup.astro both register it independently.
const RENDERED_ATTR = 'data-kometio-turnstile-rendered';

function wireTurnstileWidget(container: HTMLElement): void {
  if (container.hasAttribute(RENDERED_ATTR)) return;
  const sitekey = container.dataset.sitekey;
  if (!sitekey) return;
  container.setAttribute(RENDERED_ATTR, '');

  void loadTurnstileScript().then(() => {
    window.turnstile?.render(container, { sitekey });
  });
}

export const turnstileBehaviors: BlockBehavior[] = [
  { selector: '.cf-turnstile', wire: wireTurnstileWidget },
];
