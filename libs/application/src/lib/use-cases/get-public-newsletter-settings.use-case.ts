import type { PublicNewsletterSettings } from '@kometio/api-contracts';
import type { SiteRepositoryPort } from '@kometio/ports';
import { requireSite } from './require-site';

export interface GetPublicNewsletterSettingsDeps {
  siteRepository: Pick<SiteRepositoryPort, 'findById'>;
}

export interface GetPublicNewsletterSettingsInput {
  tenantId: string;
  siteId: string;
}

/**
 * What the public site needs to draw the newsletter signup. Fetched live on
 * every render that has one, like a form's fields (docs/adr/0015): a change
 * in the editor is on the next page view.
 */
export async function getPublicNewsletterSettings(
  deps: GetPublicNewsletterSettingsDeps,
  input: GetPublicNewsletterSettingsInput,
): Promise<PublicNewsletterSettings> {
  const site = await requireSite(
    deps.siteRepository,
    input.tenantId,
    input.siteId,
  );
  return { captchaEnabled: site.newsletterCaptchaEnabled };
}
