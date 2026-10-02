import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/public-api-client';
import { GET } from './sitemap.xml';

vi.mock('../lib/public-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/public-api-client')>();
  return { ...actual, listPublishedPagesForSitemap: vi.fn() };
});

describe('GET /sitemap.xml', () => {
  beforeEach(() => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [
        {
          slug: 'home',
          locale: 'it',
          groupId: 'group-home',
          ancestorSlugs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          slug: 'chi-siamo',
          locale: 'it',
          groupId: 'group-about',
          ancestorSlugs: [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps the "home" slug to "/{locale}/" instead of a literal /home entry', async () => {
    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain('<loc>https://example.com/it/</loc>');
    expect(body).not.toContain('/home<');
  });

  it('renders every other slug under its locale prefix with a lastmod', async () => {
    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain('<loc>https://example.com/it/chi-siamo</loc>');
    expect(body).toContain('<lastmod>2026-01-02T00:00:00.000Z</lastmod>');
  });

  it('lists every group sibling as a self-referential hreflang alternate', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [
        {
          slug: 'chi-siamo',
          locale: 'it',
          groupId: 'group-about',
          ancestorSlugs: [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          slug: 'about-us',
          locale: 'en',
          groupId: 'group-about',
          ancestorSlugs: [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain(
      '<xhtml:link rel="alternate" hreflang="it" href="https://example.com/it/chi-siamo" />',
    );
    expect(body).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/about-us" />',
    );
  });

  it('lists the canonical nested path for a page with ancestors', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [
        {
          slug: 'idraulica',
          locale: 'it',
          groupId: 'group-idraulica',
          ancestorSlugs: ['servizi'],
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).toContain(
      '<loc>https://example.com/it/servizi/idraulica</loc>',
    );
    expect(body).not.toContain('<loc>https://example.com/it/idraulica</loc>');
  });

  it('queries the API by the request hostname', async () => {
    const url = new URL('https://mysite.example/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    await GET({ url });

    expect(api.listPublishedPagesForSitemap).toHaveBeenCalledWith(
      'mysite.example',
    );
  });

  it('serves valid XML with the right content type', async () => {
    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });

    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const body = await res.text();
    expect(body.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it('renders no <url> entries when the site has no published pages', async () => {
    vi.mocked(api.listPublishedPagesForSitemap).mockResolvedValue({
      items: [],
      searchEngineIndexingEnabled: true,
      defaultLocale: 'it',
    });

    const url = new URL('https://example.com/sitemap.xml');
    // @ts-expect-error -- only `url` is exercised by this handler
    const res = await GET({ url });
    const body = await res.text();

    expect(body).not.toContain('<url>');
  });
});
