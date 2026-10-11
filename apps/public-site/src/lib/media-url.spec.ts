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

  // The URL parser drops tabs and newlines anywhere in an address and
  // whitespace and control characters before it, so `ht\ttps://…` is a remote
  // address to the code that fetches it, and a plain path to a pattern that
  // looks for `scheme:` at the start of the text. The guard has to read the
  // address the way the fetch does.
  it('reads an address as the fetch does: whitespace and control characters do not make a remote one local', () => {
    for (const href of [
      ' https://127.0.0.1:3000/api/pages',
      'ht\ttps://127.0.0.1:3000/api/pages',
      'https://127.0.0.1:3000/\napi/pages',
      '\u0000https://169.254.169.254/latest/meta-data/',
      '\thttp://169.254.169.254/latest/meta-data/',
      '\n//evil.test/x.png',
      '/\\evil.test/x.png',
      'java\nscript:alert(1)',
    ]) {
      expect(
        refusedImageSource(at(href), bases)?.status,
        JSON.stringify(href),
      ).toBe(403);
    }
  });

  it('still lets a local path through, a space in it or not', () => {
    for (const href of ['/_astro/logo.png', '/images/my photo.jpg']) {
      expect(refusedImageSource(at(href), bases), href).toBeNull();
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
