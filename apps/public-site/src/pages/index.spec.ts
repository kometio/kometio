import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/public-api-client';
import { GET } from './index';

vi.mock('../lib/public-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/public-api-client')>();
  return {
    ...actual,
    listPublishedPagesForSitemap: vi.fn(),
    resolveRedirect: vi.fn(),
  };
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
    // A bare front door asks nobody else.
    expect(api.resolveRedirect).not.toHaveBeenCalled();
  });

  // What a migrated WordPress site is asked at its front door (docs/adr/0127).
  it('answers a front door with a number by the rules, before the language', async () => {
    vi.mocked(api.resolveRedirect).mockResolvedValue({
      outcome: 'redirect',
      status: 301,
      location: '/it/mio-articolo',
    });

    const url = new URL('https://example.com/?p=123');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('/it/mio-articolo');
    expect(api.resolveRedirect).toHaveBeenCalledWith(
      'example.com',
      '/',
      '?p=123',
    );
    expect(api.listPublishedPagesForSitemap).not.toHaveBeenCalled();
  });

  it('goes to the language when no rule has the number', async () => {
    vi.mocked(api.resolveRedirect).mockResolvedValue(null);
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/?p=999');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/it/');
  });

  it('does not ask for a campaign’s tags: they are not a question', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/?utm_source=mail&fbclid=abc');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.headers.get('Location')).toBe('/it/');
    expect(api.resolveRedirect).not.toHaveBeenCalled();
  });

  it('still goes to the language when the rules cannot be asked', async () => {
    vi.mocked(api.resolveRedirect).mockRejectedValue(new Error('api away'));
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/?p=1');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/it/');
  });
});
