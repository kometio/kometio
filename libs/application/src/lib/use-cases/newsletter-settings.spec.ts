import { describe, expect, it } from 'vitest';
import { SiteNotFoundError } from '@kometio/domain-core';
import { InMemorySiteRepository, buildSite } from '@kometio/testing';
import { getPublicNewsletterSettings } from './get-public-newsletter-settings.use-case';
import { updateSiteNewsletterCaptcha } from './update-site-newsletter-captcha.use-case';

describe("the newsletter signup's captcha (docs/adr/0145)", () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';

  function setup() {
    return {
      siteRepository: new InMemorySiteRepository(
        buildSite({ id: siteId, tenantId }),
      ),
    };
  }

  it('is asked for on a site that never said otherwise', async () => {
    const deps = setup();

    expect(
      await getPublicNewsletterSettings(deps, { tenantId, siteId }),
    ).toEqual({ captchaEnabled: true });
  });

  it('is turned off and on again by the owner, and the public settings follow', async () => {
    const deps = setup();

    const off = await updateSiteNewsletterCaptcha(deps, {
      tenantId,
      siteId,
      newsletterCaptchaEnabled: false,
    });
    expect(off.newsletterCaptchaEnabled).toBe(false);
    expect(
      await getPublicNewsletterSettings(deps, { tenantId, siteId }),
    ).toEqual({ captchaEnabled: false });

    await updateSiteNewsletterCaptcha(deps, {
      tenantId,
      siteId,
      newsletterCaptchaEnabled: true,
    });
    expect(
      await getPublicNewsletterSettings(deps, { tenantId, siteId }),
    ).toEqual({ captchaEnabled: true });
  });

  it("cannot be changed for a site that is not this tenant's", async () => {
    const deps = setup();

    await expect(
      updateSiteNewsletterCaptcha(deps, {
        tenantId: 'another-tenant',
        siteId,
        newsletterCaptchaEnabled: false,
      }),
    ).rejects.toThrow(SiteNotFoundError);
    await expect(
      getPublicNewsletterSettings(deps, {
        tenantId: 'another-tenant',
        siteId,
      }),
    ).rejects.toThrow(SiteNotFoundError);
  });
});
