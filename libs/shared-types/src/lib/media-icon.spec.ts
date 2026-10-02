import { describe, expect, it } from 'vitest';
import { mediaIconSvg, mediaIconValue, parseMediaIcon } from './media-icon';

describe('media icons', () => {
  it('reads back what it writes, the URL keeping its own colons', () => {
    const value = mediaIconValue({
      mediaId: 'media-1',
      url: 'https://api.example.com/api/uploads/linkedin.png',
    });

    expect(parseMediaIcon(value)).toEqual({
      mediaId: 'media-1',
      url: 'https://api.example.com/api/uploads/linkedin.png',
    });
  });

  it('is nothing for an icon from a set', () => {
    expect(parseMediaIcon('star')).toBeNull();
    expect(parseMediaIcon('brand:github')).toBeNull();
  });

  /*
   * The URL ends up in an `href` in the page's markup: only an image
   * address may get there, never a script.
   */
  it('refuses an address that is not a web or site-relative one', () => {
    expect(parseMediaIcon('media:media-1:javascript:alert(1)')).toBeNull();
    expect(
      parseMediaIcon('media:media-1:data:image/svg+xml,<svg/>'),
    ).toBeNull();
    expect(parseMediaIcon('media::https://example.com/a.png')).toBeNull();
  });

  it('escapes the address inside the markup', () => {
    const svg = mediaIconSvg('https://example.com/a.png?x="><script>');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&quot;&gt;&lt;script&gt;');
  });
});
