import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/public-api-client';
import { GET } from './robots.txt';

vi.mock('../lib/public-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/public-api-client')>();
  return { ...actual, listPublishedPagesForSitemap: vi.fn() };
});

describe('GET /robots.txt', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows everything and points to the sitemap when indexing is enabled', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/robots.txt');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('blocks all crawling when the site discourages indexing', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: false,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/robots.txt');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain('Disallow: /');
    expect(body).not.toContain('Allow: /');
  });
});
