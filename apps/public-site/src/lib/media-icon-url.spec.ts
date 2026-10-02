import { describe, expect, it } from 'vitest';
import { siteIconImageUrl } from './media-icon-url';

describe('siteIconImageUrl', () => {
  /*
   * The CSP lets the site's own origin in everywhere; the API's origin is
   * refused in development. An icon that only shows in production is the
   * worst kind to debug.
   */
  it('points at the site itself, with the media URL as its source', () => {
    const url = siteIconImageUrl(
      'http://localhost:3000/api/uploads/linkedin.png',
    );

    expect(url.startsWith('/_image?')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('href')).toBe(
      'http://localhost:3000/api/uploads/linkedin.png',
    );
  });

  it('asks for a small picture, not the uploaded one', () => {
    const params = new URLSearchParams(
      siteIconImageUrl('https://api.example.com/a.png').split('?')[1],
    );
    expect(params.get('w')).toBe('96');
  });
});
