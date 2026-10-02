import type { CaptchaPort, NewsletterPort } from '@kometio/ports';

/** What the public newsletter module's use cases are built from (see moduleDeps). */
export interface PublicNewsletterDeps {
  captchaPort: CaptchaPort;
  newsletterPort: NewsletterPort;
}
