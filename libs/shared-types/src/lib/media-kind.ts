/**
 * The kinds of file the library groups by — and the one place that says
 * which MIME type belongs to which.
 *
 * Five and not three since the library stopped refusing files it did not
 * recognise (ADR-0070): a PDF, a spreadsheet or a zip is a file somebody
 * uploads on purpose, and it needs a home the moment it is there.
 *
 * Shared, because three different programs ask the same question and must
 * not answer it three ways: the API filtering a list, the database query
 * behind it, and the editor drawing a thumbnail. An editor that thought a
 * `.docx` was an image drew a broken picture for it.
 */
export const MEDIA_KINDS = [
  'image',
  'video',
  'audio',
  'document',
  'other',
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * What counts as a document: something a person reads rather than
 * watches or listens to.
 *
 * Every `text/*` type is one too — see `mediaKindOfMime` — so this list is
 * only the `application/*` types that are really documents in disguise.
 */
export const DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/rtf',
  'application/json',
  'application/xml',
  'application/epub+zip',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
];

export function mediaKindOfMime(mimeType: string): MediaKind {
  const type = mimeType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || DOCUMENT_MIME_TYPES.includes(type)) {
    return 'document';
  }
  return 'other';
}
