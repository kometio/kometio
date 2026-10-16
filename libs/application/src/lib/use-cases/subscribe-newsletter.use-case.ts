import { InvalidCaptchaError } from '@kometio/domain-core';
import type {
  CaptchaPort,
  NewsletterPort,
  SiteRepositoryPort,
} from '@kometio/ports';
import { requireSite } from './require-site';

export interface SubscribeNewsletterDeps {
  newsletterPort: NewsletterPort;
  captchaPort: CaptchaPort;
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface SubscribeNewsletterInput {
  /** The site this deployment serves: it is the one whose setting says whether a captcha is asked for (docs/adr/0145). */
  tenantId: string;
  siteId: string;
  email: string;
  /** CSS-hidden field real visitors never fill (docs/adr/0015). Non-empty means a bot. */
  honeypot: string;
  /** The solution of the captcha's challenge, as the widget leaves it in the form. */
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

  // Read here, not sent by the page: the block has no entity of its own, so
  // the choice is the site's and the server is the one that knows it.
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  if (site.newsletterCaptchaEnabled) {
    const captchaValid = await deps.captchaPort.verify({
      token: input.captchaToken,
    });
    if (!captchaValid) {
      throw new InvalidCaptchaError();
    }
  }

  await deps.newsletterPort.subscribe(input.email);
}
