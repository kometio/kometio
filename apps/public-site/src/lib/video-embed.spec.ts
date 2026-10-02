import { describe, expect, it } from 'vitest';
import { parseVideoEmbedUrl } from './video-embed';

describe('parseVideoEmbedUrl', () => {
  it('recognizes a standard youtube.com/watch URL', () => {
    const result = parseVideoEmbedUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
    );
    expect(result).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('recognizes a youtu.be short URL', () => {
    const result = parseVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('recognizes an already-embed youtube URL', () => {
    const result = parseVideoEmbedUrl(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
    expect(result).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('recognizes a mobile youtube URL', () => {
    const result = parseVideoEmbedUrl(
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(result).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
  });

  it('recognizes a vimeo.com URL', () => {
    const result = parseVideoEmbedUrl('https://vimeo.com/76979871');
    expect(result).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    });
  });

  it('recognizes an already-embed vimeo player URL', () => {
    const result = parseVideoEmbedUrl(
      'https://player.vimeo.com/video/76979871',
    );
    expect(result).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/76979871',
    });
  });

  it('returns null for a youtube URL without a video id', () => {
    expect(parseVideoEmbedUrl('https://www.youtube.com/')).toBeNull();
  });

  it('returns null for a vimeo URL without a numeric id', () => {
    expect(parseVideoEmbedUrl('https://vimeo.com/about')).toBeNull();
  });

  it('returns null for an unrecognized host', () => {
    expect(parseVideoEmbedUrl('https://example.com/video')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseVideoEmbedUrl('not a url')).toBeNull();
  });
});
