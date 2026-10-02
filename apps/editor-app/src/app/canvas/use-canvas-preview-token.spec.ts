import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import { useCanvasPreviewToken } from './use-canvas-preview-token';

vi.mock('../../lib/preview-token-api-client', () => ({
  createTranslationPreviewToken: vi.fn(),
  createReusableSectionPreviewToken: vi.fn(),
}));

describe('useCanvasPreviewToken', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mints a page token for a page, and hands it back', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'page-token',
      expiresAt: '',
    });

    const { result } = renderHook(() =>
      useCanvasPreviewToken('page-1', undefined),
    );

    await waitFor(() => expect(result.current).toBe('page-token'));
    expect(previewTokenApi.createTranslationPreviewToken).toHaveBeenCalledWith(
      'page-1',
    );
  });

  /*
   * The section editor passes `sectionPreview` as an object literal — a new
   * one on every render. Keyed on the object, the hook asked the API for a
   * fresh token every time the editor re-rendered.
   */
  it('does not mint again when re-rendered with an equal but new section object', async () => {
    vi.mocked(
      previewTokenApi.createReusableSectionPreviewToken,
    ).mockResolvedValue({ token: 'section-token', expiresAt: '' });

    const { result, rerender } = renderHook(
      ({ locale }) =>
        useCanvasPreviewToken('section-1', { sectionId: 'section-1', locale }),
      { initialProps: { locale: 'it' } },
    );
    await waitFor(() => expect(result.current).toBe('section-token'));

    rerender({ locale: 'it' });
    rerender({ locale: 'it' });

    expect(
      previewTokenApi.createReusableSectionPreviewToken,
    ).toHaveBeenCalledTimes(1);
  });

  /*
   * A session that expired while the editor was open: the request is
   * refused. The hook stays without a token — the frame says what went
   * wrong — and the refusal never becomes an unhandled rejection, which
   * vitest would fail the run for.
   */
  it('stays without a token when the request is refused', async () => {
    const refused = Promise.reject(
      new ApiError(401, { message: 'No session' }),
    );
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockReturnValue(
      refused,
    );

    const { result } = renderHook(() =>
      useCanvasPreviewToken('page-1', undefined),
    );

    await refused.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeNull();
  });

  it('mints a new one when the section itself changes', async () => {
    vi.mocked(
      previewTokenApi.createReusableSectionPreviewToken,
    ).mockResolvedValue({ token: 'section-token', expiresAt: '' });

    const { rerender } = renderHook(
      ({ sectionId }) =>
        useCanvasPreviewToken(sectionId, { sectionId, locale: 'it' }),
      { initialProps: { sectionId: 'section-1' } },
    );
    rerender({ sectionId: 'section-2' });

    await waitFor(() =>
      expect(
        previewTokenApi.createReusableSectionPreviewToken,
      ).toHaveBeenCalledWith('section-2'),
    );
  });
});
