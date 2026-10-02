import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSiteRecord } from '@kometio/testing/records';
import {
  getCurrentSite,
  updateBusinessInfo,
  updateGeneralSettings,
  updateLocaleSettings,
  updateSeoSettings,
} from './sites-api-client';

const sampleSite = buildSiteRecord();

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('sites-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getCurrentSite asks the API which site this deployment edits', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSite));

    const result = await getCurrentSite();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/current'),
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(result).toEqual(sampleSite);
  });

  it('updateBusinessInfo patches the business-info endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSite));

    await updateBusinessInfo('site-1', {
      businessAddress: {
        street: 'Via Roma 1',
        postalCode: '20121',
        city: 'Milano',
        country: 'IT',
      },
      businessPhone: '+39 02 1234567',
      businessEmail: null,
      businessType: 'Restaurant',
      openingHours: [{ dayOfWeek: 'monday', ranges: [] }],
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/business-info'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          businessAddress: {
            street: 'Via Roma 1',
            postalCode: '20121',
            city: 'Milano',
            country: 'IT',
          },
          businessPhone: '+39 02 1234567',
          businessEmail: null,
          businessType: 'Restaurant',
          openingHours: [{ dayOfWeek: 'monday', ranges: [] }],
        }),
      }),
    );
  });

  it('updateGeneralSettings patches the general-settings endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSite));

    await updateGeneralSettings('site-1', {
      name: 'Il mio ristorante',
      domain: 'ilmioristorante.it',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/general-settings'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Il mio ristorante',
          domain: 'ilmioristorante.it',
        }),
      }),
    );
  });

  it('updateSeoSettings patches the seo-settings endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSite));

    await updateSeoSettings('site-1', { searchEngineIndexingEnabled: true });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/seo-settings'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ searchEngineIndexingEnabled: true }),
      }),
    );
  });

  it('updateLocaleSettings patches the locale-settings endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleSite));

    await updateLocaleSettings('site-1', {
      enabledLocales: ['it', 'en'],
      defaultLocale: 'it',
      untranslatedPageFallback: 'not-available',
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sites/site-1/locale-settings'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          enabledLocales: ['it', 'en'],
          defaultLocale: 'it',
          untranslatedPageFallback: 'not-available',
        }),
      }),
    );
  });
});
