import { describe, expect, it } from 'vitest';
import { isMediaUrl, mediaBaseUrls, refusedImageSource } from './media-url';

const bases = mediaBaseUrls({
  API_PUBLIC_URL: 'https://api.example.com/api/',
  S3_MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com/media',
});

describe('mediaBaseUrls', () => {
  it('builds the bases the API builds media URLs against', () => {
    expect(bases).toEqual([
      'https://api.example.com/api/uploads/',
      'https://cdn.example.com/media/',
    ]);
    expect(mediaBaseUrls({})).toEqual([]);
  });
});

describe('isMediaUrl', () => {
  it('accepts this site’s media, on disk or on S3', () => {
    expect(
      isMediaUrl('https://api.example.com/api/uploads/2026/09/pane.jpg', bases),
    ).toBe(true);
    expect(isMediaUrl('https://cdn.example.com/media/pane.webp', bases)).toBe(
      true,
    );
  });

  it('refuses anything else, however it is dressed up', () => {
    for (const url of [
      'http://127.0.0.1:5432/',
      'http://169.254.169.254/latest/meta-data/',
      'http://api:3000/api/uploads/x.png',
      'https://api.example.com/api/pages',
      'https://api.example.com/api/uploads/../pages',
      'https://api.example.com/api/uploads/%2e%2e/pages',
      'https://api.example.com.evil.test/api/uploads/x.png',
      'https://user:pass@api.example.com/api/uploads/x.png',
      'https://cdn.example.com/mediafake/x.png',
      'not a url',
    ]) {
      expect(isMediaUrl(url, bases), url).toBe(false);
    }
  });
});

describe('refusedImageSource', () => {
  const at = (href: string) =>
    new URL(
      `https://www.example.com/_image?href=${encodeURIComponent(href)}&w=10&f=webp`,
    );

  it('refuses a remote source that is not media, before anything is fetched', () => {
    for (const href of [
      'http://127.0.0.1:47123/x.png',
      '//evil.test/x.png',
      'https://example.org/x.png',
    ]) {
      expect(refusedImageSource(at(href), bases)?.status, href).toBe(403);
    }
  });

  it('lets media, and the site’s own local files, through to Astro', () => {
    expect(
      refusedImageSource(
        at('https://api.example.com/api/uploads/pane.jpg'),
        bases,
      ),
    ).toBeNull();
    expect(refusedImageSource(at('/_astro/logo.png'), bases)).toBeNull();
    expect(
      refusedImageSource(new URL('https://www.example.com/_image'), bases),
    ).toBeNull();
  });
});
