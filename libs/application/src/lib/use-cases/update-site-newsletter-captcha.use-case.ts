import { type Site } from '@kometio/domain-core';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface UpdateSiteNewsletterCaptchaDeps {
  siteRepository: SiteRepositoryPort;
}

export interface UpdateSiteNewsletterCaptchaInput {
  tenantId: string;
  siteId: string;
  newsletterCaptchaEnabled: boolean;
}

/** Whether the newsletter signup of the site asks for a captcha (docs/adr/0145). */
export async function updateSiteNewsletterCaptcha(
  deps: UpdateSiteNewsletterCaptchaDeps,
  input: UpdateSiteNewsletterCaptchaInput,
): Promise<Site> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );

  site.updateNewsletterCaptcha({
    newsletterCaptchaEnabled: input.newsletterCaptchaEnabled,
  });
  await deps.siteRepository.save(site);

  return site;
}
