import { describe, expect, it } from 'vitest';
import { mediaKindOfMime } from './media-kind';

describe('mediaKindOfMime', () => {
  it.each([
    ['image/webp', 'image'],
    ['image/svg+xml', 'image'],
    ['video/mp4', 'video'],
    ['video/quicktime', 'video'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'document'],
    ['text/plain', 'document'],
    ['text/csv', 'document'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'document',
    ],
    ['application/zip', 'other'],
    ['application/octet-stream', 'other'],
    ['font/woff2', 'other'],
  ])('%s is %s', (mimeType, kind) => {
    expect(mediaKindOfMime(mimeType)).toBe(kind);
  });

  it('does not care how the type is capitalised', () => {
    expect(mediaKindOfMime('Application/PDF')).toBe('document');
  });
});
