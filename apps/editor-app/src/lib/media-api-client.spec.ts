import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMedia, listMedia, uploadMedia } from './media-api-client';
import { buildMediaRecord } from '@kometio/testing/records';

const sampleMedia = buildMediaRecord();

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('media-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listMedia requests the site, page, and pageSize as query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ items: [sampleMedia], total: 1 }),
    );

    const result = await listMedia('site-1', 2, 24);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/media?siteId=site-1&page=2&pageSize=24'),
      expect.anything(),
    );
    expect(result).toEqual({ items: [sampleMedia], total: 1 });
  });

  it('uploadMedia sends a multipart FormData with the site id and file', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(sampleMedia));
    const file = new File(['data'], 'foto.png', { type: 'image/png' });

    const result = await uploadMedia('site-1', file);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/media'),
      expect.objectContaining({ method: 'POST' }),
    );
    const call = vi.mocked(fetch).mock.calls[0];
    const body = call[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('siteId')).toBe('site-1');
    expect(body.get('file')).toBe(file);
    expect(result).toEqual(sampleMedia);
  });

  it('deleteMedia sends a DELETE for the given id', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('should not be called')),
    } as unknown as Response);

    await deleteMedia('media-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/media/media-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
