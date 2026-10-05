import type { BlockBehavior } from './types';
import type {} from 'altcha/types/generic';

// The widget of the captcha built into Kometio (docs/adr/0103): a proof of work
// the visitor's browser solves in the background, which is what a site gets when
// it has no Cloudflare keys. It is the counterpart of turnstile.ts, for the same
// two blocks, and a page has one or the other, never both.
//
// The widget is the library's "external" build, which is what this site's
// `script-src 'self'` asks for, and it is a download of its own: it is imported
// when a form is on the page, not before, so a page without one never carries
// it. Its worker is emitted next to it under `_astro/` and so comes from the
// site's own origin; nothing is fetched from anywhere else.
let loading: Promise<void> | null = null;

function loadAltchaWidget(): Promise<void> {
  loading ??= load().catch((error: unknown) => {
    // A failed download is not remembered: the next form on the page tries again.
    loading = null;
    throw error;
  });
  return loading;
}

async function load(): Promise<void> {
  await import('altcha/external');
  await import('altcha/altcha.css');
  const { default: Pbkdf2Worker } =
    await import('altcha/workers/pbkdf2?worker');
  $altcha.algorithms.set('PBKDF2/SHA-256', () => new Pbkdf2Worker());
}

// The widget's own words, in the languages this site's own are in (Translator:
// Italian and English). English is the widget's own; any other page language
// gets it too, as it gets the site's.
const TRANSLATIONS: Record<string, () => Promise<unknown>> = {
  it: () => import('altcha/i18n/it'),
};

function widgetLanguage(locale: string | undefined): string {
  const language = (locale ?? '').toLowerCase().split('-')[0] ?? '';
  return language in TRANSLATIONS ? language : 'en';
}

// Idempotency guard, as turnstile.ts's: a page can run these behaviors more
// than once (see run-block-behaviors.ts) and a second widget in the same slot
// would ask for a second challenge and write a second hidden field.
const RENDERED_ATTR = 'data-kometio-altcha-rendered';

function wireAltchaWidget(container: HTMLElement): void {
  if (container.hasAttribute(RENDERED_ATTR)) return;
  const challenge = container.dataset['challenge'];
  if (!challenge) return;
  container.setAttribute(RENDERED_ATTR, '');
  const language = widgetLanguage(container.dataset['language']);

  void loadAltchaWidget()
    .then(() => TRANSLATIONS[language]?.())
    .then(() => {
      const widget = document.createElement('altcha-widget');
      widget.setAttribute('challenge', challenge);
      // Asked for when the visitor starts on the form, so that it is solved by
      // the time they have finished it, and a visitor who only reads the page
      // never costs the server a challenge or their browser the work.
      widget.setAttribute('auto', 'onfocus');
      // The field the submit proxies read the solution from. An underscore: the
      // form's own fields are never named so, and the proxy skips those.
      widget.setAttribute('name', '_captcha');
      widget.setAttribute('language', language);
      widget.setAttribute('type', 'checkbox');
      container.append(widget);
    })
    .catch(() => {
      // The form still renders and can be filled in; without a solution the
      // server refuses it with the same message as any refused captcha, which
      // is the visitor's cue to reload.
      container.removeAttribute(RENDERED_ATTR);
    });
}

export const altchaBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-altcha]', wire: wireAltchaWidget },
];
