import { UnsupportedMediaTypeError } from './errors';

/**
 * The three kinds a browser renders in a page — and so the only three a
 * sniffer ever vouches for. Not `MediaKind` from shared-types, which also
 * has documents and everything else: those are never served inline, so
 * there is nothing for their bytes to prove.
 */
export type InlineMediaKind = 'image' | 'video' | 'audio';

export interface SniffedMediaType {
  mimeType: string;
  kind: InlineMediaKind;
  /** No leading dot, e.g. 'mp4'. */
  extension: string;
}

/**
 * What a media upload really is, decided from its own bytes (ADR-0054).
 *
 * Images never needed this and still do not: the storage adapters put
 * every one of them through sharp, which re-encodes to WebP — a file that
 * is not really an image fails to decode, and one that is comes out as
 * raster pixels with nothing executable left in it. That re-encoding is a
 * stronger defence than any allow-list.
 *
 * Video and audio cannot be re-encoded that way — sharp does not read
 * them, and transcoding is a different kind of program — so they are
 * stored exactly as uploaded and served INLINE. For those the bytes are
 * the only check there will ever be, which is what this file is for.
 *
 * The allow-list is deliberately short and contains no format that can
 * execute anything: raster images, the two video containers and the three
 * audio containers browsers actually play. SVG is absent on purpose.
 *
 * Declared MIME types are ignored entirely. A caller can rename a file
 * and set any header it likes; the bytes are the only thing it cannot
 * fake.
 */
function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((byte, i) => bytes[offset + i] === byte);
}

/** ASCII helper — every container below identifies itself with plain letters. */
function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

interface MediaSignature {
  mimeType: string;
  kind: InlineMediaKind;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}

const RIFF = ascii('RIFF');

const SIGNATURES: MediaSignature[] = [
  {
    mimeType: 'image/png',
    kind: 'image',
    extension: 'png',
    matches: (b) =>
      startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: 'image/jpeg',
    kind: 'image',
    extension: 'jpg',
    matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: 'image/gif',
    kind: 'image',
    extension: 'gif',
    matches: (b) => startsWith(b, ascii('GIF8')),
  },
  {
    // RIFF containers name their real format at byte 8 — the same four
    // bytes distinguish a WebP image from a WAV sound.
    mimeType: 'image/webp',
    kind: 'image',
    extension: 'webp',
    matches: (b) => startsWith(b, RIFF) && startsWith(b, ascii('WEBP'), 8),
  },
  {
    mimeType: 'audio/wav',
    kind: 'audio',
    extension: 'wav',
    matches: (b) => startsWith(b, RIFF) && startsWith(b, ascii('WAVE'), 8),
  },
  {
    // ISO base media: the brand at byte 8 says which. AVIF is an image in
    // the same container family as MP4, which is why they are neighbours
    // here rather than in separate groups.
    mimeType: 'image/avif',
    kind: 'image',
    extension: 'avif',
    matches: (b) =>
      startsWith(b, ascii('ftyp'), 4) && startsWith(b, ascii('avif'), 8),
  },
  {
    mimeType: 'video/mp4',
    kind: 'video',
    extension: 'mp4',
    matches: (b) =>
      startsWith(b, ascii('ftyp'), 4) &&
      // The brands browsers actually play. `isom` and `mp42` are the
      // common ones; `M4V ` is what some cameras and Apple tools write.
      (startsWith(b, ascii('isom'), 8) ||
        startsWith(b, ascii('mp42'), 8) ||
        startsWith(b, ascii('mp41'), 8) ||
        startsWith(b, ascii('M4V '), 8)),
  },
  {
    // Matroska, which is both .webm video and .weba audio — the container
    // does not say which, so it is treated as video: an <audio> element
    // plays a video container's audio track quite happily, where a
    // <video> given an audio file shows a black rectangle.
    mimeType: 'video/webm',
    kind: 'video',
    extension: 'webm',
    matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  },
  {
    mimeType: 'audio/mpeg',
    kind: 'audio',
    extension: 'mp3',
    matches: (b) =>
      // An ID3 tag, or a bare frame header: both are MP3 in the wild, and
      // a file written by a tagging tool starts with the tag.
      startsWith(b, ascii('ID3')) ||
      (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  },
  {
    mimeType: 'audio/ogg',
    kind: 'audio',
    extension: 'ogg',
    matches: (b) => startsWith(b, ascii('OggS')),
  },
];

/**
 * @throws UnsupportedMediaTypeError when the bytes are not one of the
 * allowed formats — including when they are a perfectly valid file of
 * some other kind. Refusing is the whole job.
 */
export function sniffMediaType(data: Uint8Array): SniffedMediaType {
  // 16 bytes covers every signature above; the longest looks at byte 11.
  const head = data.subarray(0, 16);
  for (const signature of SIGNATURES) {
    if (signature.matches(head)) {
      return {
        mimeType: signature.mimeType,
        kind: signature.kind,
        extension: signature.extension,
      };
    }
  }
  throw new UnsupportedMediaTypeError();
}
