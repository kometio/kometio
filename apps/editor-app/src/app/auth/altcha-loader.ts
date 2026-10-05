import type {} from 'altcha/types/generic';

let loading: Promise<void> | null = null;

/**
 * Loads the captcha built into Kometio (docs/adr/0103), once, and only when a
 * form that needs it is drawn: a deployment that uses Cloudflare Turnstile
 * never downloads the widget, and the editor's own bundle does not carry it.
 *
 * `altcha/external` is the widget without its workers and its style inlined,
 * which is what a policy of `script-src 'self'` asks for. The proof of work
 * runs in a worker this editor serves itself (Vite emits it next to the
 * bundle), so nothing is fetched from anywhere else and a deployment with no
 * route to the internet has a login that works. The default algorithm
 * (PBKDF2/SHA-256) is the browser's own crypto, with no WebAssembly.
 *
 * The translation is for the editor's own language, which the widget reads
 * from its `language` attribute: a person reads "I am not a robot" in the
 * language of the rest of the page.
 */
export function loadAltcha(language: string): Promise<void> {
  loading ??= load().catch((error: unknown) => {
    // A failed download is not remembered: the next form tries again.
    loading = null;
    throw error;
  });
  return loading.then(() => loadTranslation(language));
}

async function load(): Promise<void> {
  await import('altcha/external');
  await import('altcha/altcha.css');
  const { default: Pbkdf2Worker } =
    await import('altcha/workers/pbkdf2?worker');
  $altcha.algorithms.set('PBKDF2/SHA-256', () => new Pbkdf2Worker());
}

async function loadTranslation(language: string): Promise<void> {
  if (language === 'it') {
    await import('altcha/i18n/it');
  }
}
