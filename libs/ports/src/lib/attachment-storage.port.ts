export interface UploadAttachmentInput {
  /** The form it was uploaded for: an attachment lives under its form, so a submission can prove its file is one of that form's (see `urlPrefixFor`). */
  formId: string;
  filename: string;
  /** Must already be the sniffed, verified MIME type — see
   * sniffAttachmentType in @kometio/domain-core — never the raw
   * client-declared one. */
  mimeType: string;
  /** No leading dot. Must already be the sniffed, verified extension —
   * the storage key is built from this, never from `filename`, which is
   * client-controlled on this unauthenticated upload path. */
  extension: string;
  data: Uint8Array;
}

/** One file the store holds, and when it was written. */
export interface StoredAttachment {
  url: string;
  storedAt: Date;
}

export interface UploadAttachmentResult {
  url: string;
  filename: string;
}

/**
 * Implemented by @kometio/local-disk-attachment-storage and
 * @kometio/s3-attachment-storage — raw byte storage for a form's file-upload
 * field, no image processing of any kind (unlike MediaStoragePort, which
 * is dedicated to the curated media library and rejects non-image files
 * outright, see ADR-0013 — a CV/PDF attached to a contact form would be
 * rejected by that port, not just mishandled). Reuses the same
 * MEDIA_STORAGE_PROVIDER/S3_MEDIA_* config as MediaStoragePort (apps/api's
 * createAttachmentStorage) — same underlying storage infrastructure
 * choice per deployment, a different concern, stored under its own key
 * prefix so the two never mix.
 */
export interface AttachmentStoragePort {
  /** Stored as `<urlPrefixFor(formId)><random uuid>.<extension>`. */
  upload(input: UploadAttachmentInput): Promise<UploadAttachmentResult>;
  /**
   * Where this form's attachments are served from, ending in `/`. A
   * submission's file is accepted only under it: the url comes back from
   * the visitor's browser, and anything else there would be a link of
   * their choosing in the site owner's notification email.
   */
  urlPrefixFor(formId: string): string;
  /**
   * Every file the store holds, for the sweep that removes the ones no
   * submission names any more (sweepFormAttachments).
   */
  listStored(): AsyncIterable<StoredAttachment>;
  /** Removes one stored file by the url `upload` gave it; a url the store did not give is refused. */
  delete(url: string): Promise<void>;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STORED_NAME = new RegExp(`^${UUID}\\.[a-z0-9]{1,10}$`);
const STORED_PATH = new RegExp(`^(?:${UUID}/)?${UUID}\\.[a-z0-9]{1,10}$`);

/**
 * Whether this is the name `upload` gives a file: a uuid and the sniffed
 * extension, nothing a visitor chose. What follows a form's `urlPrefixFor`
 * in a submitted url has to be exactly this.
 */
export function isStoredAttachmentName(name: string): boolean {
  return STORED_NAME.test(name);
}

/**
 * Whether this is a path under the attachments root that `upload` could
 * have written: `<formId>/<name>`, or a bare `<name>` from before files
 * were kept per form. What an adapter deletes has to be one of these.
 */
export function isStoredAttachmentPath(path: string): boolean {
  return STORED_PATH.test(path);
}

/**
 * The stored path a file's url ends in — `<formId>/<name>`, or a bare
 * `<name>` — or null for a url that names no stored file. What identifies
 * a file across a change of address: every url either store gives has
 * this after its last `/attachments/`, whatever origin is in front of it.
 */
export function storedAttachmentPathOf(url: string): string | null {
  const marker = '/attachments/';
  const at = url.lastIndexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length);
  return isStoredAttachmentPath(path) ? path : null;
}
