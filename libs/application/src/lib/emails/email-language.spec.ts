import { describe, expect, it, vi } from 'vitest';
import type { DeploymentLocalePort } from '@kometio/ports';
import { FakeDeploymentLocale } from '@kometio/testing';
import { emailLanguageOfSite, emailLanguageOfUser } from './email-language';

const tenantId = 'tenant-1';

describe('emailLanguageOfSite', () => {
  it.each([
    ['it', 'it'],
    ['en', 'en'],
    // A regional variant is the language it belongs to.
    ['it-IT', 'it'],
    ['en-GB', 'en'],
  ] as const)(
    'writes in %s for a site whose default is %s',
    async (locale, expected) => {
      expect(
        await emailLanguageOfSite(
          { deploymentLocale: new FakeDeploymentLocale(locale) },
          tenantId,
        ),
      ).toBe(expected);
    },
  );

  it('writes in English for a site in a language no email is written in', async () => {
    expect(
      await emailLanguageOfSite(
        { deploymentLocale: new FakeDeploymentLocale('fr') },
        tenantId,
      ),
    ).toBe('en');
  });

  it('writes in English when there is no site to ask', async () => {
    expect(
      await emailLanguageOfSite(
        { deploymentLocale: new FakeDeploymentLocale(null) },
        tenantId,
      ),
    ).toBe('en');
  });
});

describe('emailLanguageOfUser', () => {
  it("writes in the person's own language, whatever the site speaks", async () => {
    expect(
      await emailLanguageOfUser(
        { deploymentLocale: new FakeDeploymentLocale('it') },
        { tenantId, language: 'en' },
      ),
    ).toBe('en');
  });

  it('does not ask the site when the person has chosen: their mail cannot wait on it', async () => {
    const deploymentLocale: DeploymentLocalePort = {
      defaultLocale: vi.fn().mockRejectedValue(new Error('no site')),
    };

    await emailLanguageOfUser(
      { deploymentLocale },
      { tenantId, language: 'it' },
    );

    expect(deploymentLocale.defaultLocale).not.toHaveBeenCalled();
  });

  it("falls back to the site's language for somebody who has not chosen", async () => {
    expect(
      await emailLanguageOfUser(
        { deploymentLocale: new FakeDeploymentLocale('en') },
        { tenantId, language: null },
      ),
    ).toBe('en');
  });
});
