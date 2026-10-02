import { describe, expect, it } from 'vitest';
import { sniffMediaType } from './media-type-sniffer';
import { UnsupportedMediaTypeError } from './errors';

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );

const pad = (n: number) => new Array(n).fill(0);

describe('sniffMediaType', () => {
  it.each([
    [
      'png',
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
      'image',
    ],
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg', 'image'],
    ['gif', bytes('GIF89a'), 'image/gif', 'image'],
    ['webp', bytes('RIFF', pad(4), 'WEBP'), 'image/webp', 'image'],
    ['avif', bytes(pad(4), 'ftypavif'), 'image/avif', 'image'],
    ['mp4', bytes(pad(4), 'ftypisom'), 'video/mp4', 'video'],
    ['webm', bytes([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm', 'video'],
    ['wav', bytes('RIFF', pad(4), 'WAVE'), 'audio/wav', 'audio'],
    ['mp3 with an ID3 tag', bytes('ID3', [0x03, 0x00]), 'audio/mpeg', 'audio'],
    ['mp3 as a bare frame', bytes([0xff, 0xfb, 0x90]), 'audio/mpeg', 'audio'],
    ['ogg', bytes('OggS'), 'audio/ogg', 'audio'],
  ])('recognises %s from its bytes', (_name, data, mimeType, kind) => {
    const sniffed = sniffMediaType(data);
    expect(sniffed.mimeType).toBe(mimeType);
    expect(sniffed.kind).toBe(kind);
  });

  it('tells a WebP image from a WAV sound, which share their first four bytes', () => {
    // Both are RIFF containers; only byte 8 says which. Getting this
    // wrong would file a sound as an image and hand it to <img>.
    expect(sniffMediaType(bytes('RIFF', pad(4), 'WEBP')).kind).toBe('image');
    expect(sniffMediaType(bytes('RIFF', pad(4), 'WAVE')).kind).toBe('audio');
  });

  it('refuses an SVG, which is the reason this exists', () => {
    // Media is served inline, so an SVG carrying a <script> would execute
    // on the API's own origin. `accept="image/*"` on an <input> counts it
    // as an image and is not a check.
    const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>');
    expect(() => sniffMediaType(svg)).toThrow(UnsupportedMediaTypeError);
  });

  it.each([
    ['HTML', bytes('<!DOCTYPE html>')],
    ['a PDF', bytes('%PDF-1.7')],
    ['a ZIP', bytes([0x50, 0x4b, 0x03, 0x04])],
    ['an empty file', new Uint8Array()],
  ])('refuses %s', (_name, data) => {
    expect(() => sniffMediaType(data)).toThrow(UnsupportedMediaTypeError);
  });

  it('ignores what the upload claims to be, since only the bytes cannot be faked', () => {
    // The declared type is not an argument at all — this is the assertion
    // that keeps it that way.
    expect(sniffMediaType.length).toBe(1);
  });
});
