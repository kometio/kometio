import { mediaKindOfMime, type MediaKind } from '@kometio/shared-types';
import { UnsupportedMediaTypeError } from './errors';
import { sniffMediaType } from './media-type-sniffer';

export interface ClassifiedUpload {
  mimeType: string;
  kind: MediaKind;
  /** No leading dot, lower case; empty when the name has none. */
  extension: string;
  /**
   * Whether this file may be served for a browser to open in place.
   *
   * True ONLY when the bytes matched the sniffer's allow-list — raster
   * images, and the video and audio containers browsers play. Everything
   * else is served as a download (ADR-0070), because its type came from a
   * name the uploader chose, and a `.html` or `.svg` opened in place runs
   * its scripts with the session of whoever clicked it.
   */
  inline: boolean;
}

/**
 * The type a file's name claims, for the files whose bytes nobody checks.
 *
 * Only ever used for a file that is served as a DOWNLOAD, so getting it
 * wrong costs a wrong icon and a wrong folder, never a script running: the
 * header that decides what a browser does with it is
 * `Content-Disposition: attachment`, not this.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  // The allow-listed formats too, for a real file the sniffer did not
  // recognise — an MP4 from an unusual camera brand, say. It lands in the
  // folder its name says, and is still only ever a download.
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  // documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  rtf: 'application/rtf',
  json: 'application/json',
  xml: 'application/xml',
  epub: 'application/epub+zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  // images a browser could render but the sniffer does not vouch for
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  psd: 'image/vnd.adobe.photoshop',
  // video and audio outside the containers browsers play
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  opus: 'audio/opus',
  wma: 'audio/x-ms-wma',
  mid: 'audio/midi',
  midi: 'audio/midi',
  // everything else a site keeps
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** The part after the last dot, if it looks like an extension at all. */
export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * What an upload is, and whether a browser may open it in place.
 *
 * The bytes are asked first, exactly as before (ADR-0054): a file that
 * matches the allow-list is what its bytes say, whatever it is called. A
 * file that does not is no longer refused — the library takes any file
 * (ADR-0070) — but it is taken on its name alone, and served as a
 * download.
 */
export function classifyUpload(
  data: Uint8Array,
  filename: string,
): ClassifiedUpload {
  try {
    const sniffed = sniffMediaType(data);
    return {
      mimeType: sniffed.mimeType,
      kind: sniffed.kind,
      extension: sniffed.extension,
      inline: true,
    };
  } catch (error) {
    if (!(error instanceof UnsupportedMediaTypeError)) throw error;
  }
  const extension = extensionOf(filename);
  const mimeType = MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  return {
    mimeType,
    kind: mediaKindOfMime(mimeType),
    extension,
    inline: false,
  };
}

/**
 * A name that is safe as the last segment of a URL and of a path on disk,
 * and still recognisably the one the person uploaded.
 *
 * A downloaded file is saved under the last segment of its address, so
 * keeping the name there is what makes "listino-2026.pdf" arrive as
 * "listino-2026.pdf" rather than as a UUID. Anything outside a small safe
 * set becomes a dash: no slashes to climb out of the directory, no
 * quotes or spaces to break a header, no dot-files.
 */
export function safeDownloadName(filename: string): string {
  const base = filename.trim().split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    // "(v2).pdf" would otherwise end as "v2-.pdf".
    .replace(/-+\./g, '.')
    .replace(/^[.-]+/, '')
    .slice(-120);
  return cleaned === '' || cleaned.startsWith('.') ? 'file' : cleaned;
}
