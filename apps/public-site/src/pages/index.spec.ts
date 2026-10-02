import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/public-api-client';
import { GET } from './index';

vi.mock('../lib/public-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/public-api-client')>();
  return { ...actual, listPublishedPagesForSitemap: vi.fn() };
});

describe('GET /', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the bare root to the site's default locale", async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/it/');
    expect(api.listPublishedPagesForSitemap).toHaveBeenCalledWith(
      'example.com',
    );
  });
});
