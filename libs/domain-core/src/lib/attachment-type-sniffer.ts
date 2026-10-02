import { UnsupportedAttachmentTypeError } from './errors';

export interface SniffedAttachmentType {
  mimeType: string;
  /** No leading dot, e.g. 'pdf'. */
  extension: string;
}

/**
 * Public form attachments (public-forms.controller.ts's uploadAttachment)
 * accept a real range of file types — CV/PDF, portfolio images, zipped
 * bundles, office documents — not just images like MediaStoragePort. The
 * endpoint is also unauthenticated, so the client-declared filename/MIME
 * type can't be trusted at all (security review 2026-08-25): this sniffs
 * the real bytes and only returns a match for something on the allowlist
 * below. Everything else — most dangerously anything that could render as
 * HTML/SVG in a browser (stored XSS) — is rejected outright rather than
 * guessed at.
 */

function bytesStartWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

function isLikelyPlainText(data: Uint8Array): boolean {
  const sample = data.subarray(0, 8000);
  if (sample.includes(0)) {
    return false; // NUL byte: not real text, some binary format we don't recognize.
  }
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  // Reject anything that could be interpreted as markup by a browser if it
  // ever ended up served/opened as text/html — belt-and-suspenders on top
  // of the forced Content-Disposition: attachment on this whole path.
  return !/<\s*(script|html|svg|iframe|body|img|object|embed)\b/i.test(decoded);
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const CFBF_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const OOXML_MIME_TO_EXTENSION: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
};

const LEGACY_OFFICE_MIME_TO_EXTENSION: Record<string, string> = {
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
};

const TEXT_MIME_TO_EXTENSION: Record<string, string> = {
  'text/csv': 'csv',
  'text/plain': 'txt',
};

interface SignatureRule {
  mimeType: string;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}

// Formats identifiable from their own bytes alone — the declared MIME type
// is ignored for these, the sniffed one always wins.
const SIGNATURE_RULES: SignatureRule[] = [
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    matches: (b) => bytesStartWith(b, [0x25, 0x50, 0x44, 0x46]),
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (b) =>
      bytesStartWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => bytesStartWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: 'image/gif',
    extension: 'gif',
    matches: (b) => bytesStartWith(b, [0x47, 0x49, 0x46, 0x38]),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      bytesStartWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/**
 * Sniffs `data`'s real content and returns the canonical (mimeType,
 * extension) to store it under — never trust `declaredMimeType`/the
 * client filename beyond using them to disambiguate a *container* format
 * (ZIP, CFBF) that genuinely can't be told apart from its own bytes.
 * Throws UnsupportedAttachmentTypeError for anything not on the
 * allowlist.
 */
export function sniffAttachmentType(
  data: Uint8Array,
  declaredMimeType: string,
): SniffedAttachmentType {
  const head = data.subarray(0, 16);

  for (const rule of SIGNATURE_RULES) {
    if (rule.matches(head)) {
      return { mimeType: rule.mimeType, extension: rule.extension };
    }
  }

  const normalizedDeclared = declaredMimeType.trim().toLowerCase();

  if (bytesStartWith(head, ZIP_SIGNATURE)) {
    const ooxmlExtension = OOXML_MIME_TO_EXTENSION[normalizedDeclared];
    if (ooxmlExtension) {
      return { mimeType: normalizedDeclared, extension: ooxmlExtension };
    }
    // A ZIP that isn't a recognized Office format — still safe to store
    // and serve (never rendered inline by a browser), just generic.
    return { mimeType: 'application/zip', extension: 'zip' };
  }

  if (bytesStartWith(head, CFBF_SIGNATURE)) {
    const legacyExtension = LEGACY_OFFICE_MIME_TO_EXTENSION[normalizedDeclared];
    if (legacyExtension) {
      return { mimeType: normalizedDeclared, extension: legacyExtension };
    }
    throw new UnsupportedAttachmentTypeError(declaredMimeType);
  }

  if (isLikelyPlainText(data)) {
    const textExtension = TEXT_MIME_TO_EXTENSION[normalizedDeclared] ?? 'txt';
    return {
      mimeType:
        normalizedDeclared in TEXT_MIME_TO_EXTENSION
          ? normalizedDeclared
          : 'text/plain',
      extension: textExtension,
    };
  }

  throw new UnsupportedAttachmentTypeError(declaredMimeType);
}
