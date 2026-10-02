import { describe, expect, it } from 'vitest';
import { sniffAttachmentType } from './attachment-type-sniffer';
import { UnsupportedAttachmentTypeError } from './errors';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('sniffAttachmentType', () => {
  it('recognizes a PDF from its magic bytes regardless of declared MIME type', () => {
    const data = new TextEncoder().encode('%PDF-1.4 fake pdf content');
    expect(sniffAttachmentType(data, 'application/octet-stream')).toEqual({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('recognizes PNG/JPEG/GIF/WEBP images', () => {
    expect(
      sniffAttachmentType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0),
        'image/png',
      ),
    ).toEqual({ mimeType: 'image/png', extension: 'png' });

    expect(
      sniffAttachmentType(bytes(0xff, 0xd8, 0xff, 0, 0, 0), 'image/jpeg'),
    ).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });

    expect(
      sniffAttachmentType(new TextEncoder().encode('GIF89a....'), 'image/gif'),
    ).toEqual({ mimeType: 'image/gif', extension: 'gif' });

    const webp = new Uint8Array(16);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBP'), 8);
    expect(sniffAttachmentType(webp, 'image/webp')).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
    });
  });

  it('recognizes a docx as a ZIP container only when the declared MIME type matches OOXML', () => {
    const zip = new Uint8Array(16);
    zip.set(bytes(0x50, 0x4b, 0x03, 0x04), 0);

    expect(
      sniffAttachmentType(
        zip,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toEqual({
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
    });
  });

  it('falls back to generic application/zip for a ZIP with no recognized declared type', () => {
    const zip = new Uint8Array(16);
    zip.set(bytes(0x50, 0x4b, 0x03, 0x04), 0);

    expect(sniffAttachmentType(zip, 'application/octet-stream')).toEqual({
      mimeType: 'application/zip',
      extension: 'zip',
    });
  });

  it('recognizes legacy MS Office (CFBF) only when the declared MIME type matches', () => {
    const cfbf = new Uint8Array(16);
    cfbf.set(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 0);

    expect(sniffAttachmentType(cfbf, 'application/msword')).toEqual({
      mimeType: 'application/msword',
      extension: 'doc',
    });
  });

  it('rejects a CFBF container with an unrecognized declared type', () => {
    const cfbf = new Uint8Array(16);
    cfbf.set(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 0);

    expect(() => sniffAttachmentType(cfbf, 'application/octet-stream')).toThrow(
      UnsupportedAttachmentTypeError,
    );
  });

  it('accepts plain text', () => {
    const data = new TextEncoder().encode('hello world, this is a CV note');
    expect(sniffAttachmentType(data, 'text/plain')).toEqual({
      mimeType: 'text/plain',
      extension: 'txt',
    });
  });

  it('accepts CSV, keeping the .csv extension', () => {
    const data = new TextEncoder().encode('name,email\nJane,jane@example.com');
    expect(sniffAttachmentType(data, 'text/csv')).toEqual({
      mimeType: 'text/csv',
      extension: 'csv',
    });
  });

  it('rejects an HTML file disguised as a .pdf/.txt upload — the core XSS vector', () => {
    const data = new TextEncoder().encode(
      '<html><body><script>alert(document.cookie)</script></body></html>',
    );
    expect(() => sniffAttachmentType(data, 'application/pdf')).toThrow(
      UnsupportedAttachmentTypeError,
    );
    expect(() => sniffAttachmentType(data, 'text/plain')).toThrow(
      UnsupportedAttachmentTypeError,
    );
  });

  it('rejects an SVG with an embedded script disguised as an image', () => {
    const data = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(() => sniffAttachmentType(data, 'image/svg+xml')).toThrow(
      UnsupportedAttachmentTypeError,
    );
  });

  it('rejects binary content with no recognized signature', () => {
    const data = bytes(0x00, 0x01, 0x02, 0x4d, 0x5a, 0x90, 0x00, 0x03);
    expect(() => sniffAttachmentType(data, 'application/x-msdownload')).toThrow(
      UnsupportedAttachmentTypeError,
    );
  });
});
