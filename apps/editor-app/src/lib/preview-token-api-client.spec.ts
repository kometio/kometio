import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReusableSectionPreviewToken,
  createTranslationPreviewToken,
} from './preview-token-api-client';

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 201,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('preview-token-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createTranslationPreviewToken POSTs to the translation-scoped route', async () => {
    const token = { token: 'tok123', expiresAt: '2026-01-01T00:00:00.000Z' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(token));

    const result = await createTranslationPreviewToken('tr-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/page-groups/translations/tr-1/preview-token'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(result).toEqual(token);
  });

  it('createReusableSectionPreviewToken POSTs to the section-scoped route', async () => {
    const token = { token: 'tok456', expiresAt: '2026-01-01T00:00:00.000Z' };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(token));

    const result = await createReusableSectionPreviewToken('section-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reusable-sections/section-1/preview-token'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(result).toEqual(token);
  });
});
