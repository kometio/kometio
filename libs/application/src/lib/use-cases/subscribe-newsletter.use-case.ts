import { InvalidCaptchaError } from '@kometio/domain-core';
import type { CaptchaPort, NewsletterPort } from '@kometio/ports';

export interface SubscribeNewsletterDeps {
  newsletterPort: NewsletterPort;
  captchaPort: CaptchaPort;
}

export interface SubscribeNewsletterInput {
  email: string;
  /** CSS-hidden field real visitors never fill (docs/adr/0015). Non-empty means a bot. */
  honeypot: string;
  /** Cloudflare Turnstile's client-side widget token. */
  captchaToken: string;
}

/**
 * Deliberately not "best-effort" the way submitForm's own newsletter
 * subscribe is: there, the subscribe is a secondary side effect of a
 * primary contact request that's already saved and notified regardless.
 * Here, subscribing *is* the entire point of the block — a provider
 * failure has to propagate so the visitor sees it failed and can retry,
 * instead of a "grazie" that quietly did nothing.
 */
export async function subscribeNewsletter(
  deps: SubscribeNewsletterDeps,
  input: SubscribeNewsletterInput,
): Promise<void> {
  if (input.honeypot.trim() !== '') {
    // Silent accept — same reasoning as submitForm.
    return;
  }

  const captchaValid = await deps.captchaPort.verify({
    token: input.captchaToken,
  });
  if (!captchaValid) {
    throw new InvalidCaptchaError();
  }

  await deps.newsletterPort.subscribe(input.email);
}
