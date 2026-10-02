import { describe, expect, it } from 'vitest';
import {
  classifyUpload,
  extensionOf,
  safeDownloadName,
} from './upload-classification';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const text = (value: string) => new TextEncoder().encode(value);

describe('classifyUpload', () => {
  it('trusts the bytes for a file on the allow-list, whatever it is called', () => {
    expect(classifyUpload(PNG, 'not-really.pdf')).toEqual({
      mimeType: 'image/png',
      kind: 'image',
      extension: 'png',
      inline: true,
    });
  });

  it('takes a PDF it cannot vouch for, as a document served for download', () => {
    expect(classifyUpload(text('%PDF-1.7 ...'), 'Listino 2026.PDF')).toEqual({
      mimeType: 'application/pdf',
      kind: 'document',
      extension: 'pdf',
      inline: false,
    });
  });

  it('never lets an HTML file be opened in place, even though it is text', () => {
    const result = classifyUpload(
      text('<script>alert(1)</script>'),
      'page.html',
    );
    expect(result.kind).toBe('document');
    expect(result.inline).toBe(false);
  });

  it('keeps an SVG with the images, and still never inline', () => {
    const result = classifyUpload(
      text('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'logo.svg',
    );
    expect(result).toMatchObject({ kind: 'image', inline: false });
  });

  it('files a name it does not know under "other" rather than refusing it', () => {
    expect(classifyUpload(text('whatever'), 'archive.xyz')).toEqual({
      mimeType: 'application/octet-stream',
      kind: 'other',
      extension: 'xyz',
      inline: false,
    });
  });

  it('accepts a file with no extension at all', () => {
    expect(classifyUpload(text('whatever'), 'README')).toMatchObject({
      kind: 'other',
      extension: '',
      inline: false,
    });
  });
});

describe('extensionOf', () => {
  it.each([
    ['report.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['no-extension', ''],
    ['trailing.', ''],
    ['weird.thisistoolong', ''],
  ])('%s -> "%s"', (name, extension) => {
    expect(extensionOf(name)).toBe(extension);
  });
});

describe('safeDownloadName', () => {
  it('keeps a plain name as it is', () => {
    expect(safeDownloadName('listino-2026.pdf')).toBe('listino-2026.pdf');
  });

  it('turns spaces and accents into something a URL and a header can carry', () => {
    expect(safeDownloadName('Menù della settimana (v2).pdf')).toBe(
      'Menu-della-settimana-v2.pdf',
    );
  });

  it('cannot climb out of its directory', () => {
    expect(safeDownloadName('../../etc/passwd')).toBe('passwd');
    expect(safeDownloadName('..\\..\\boot.ini')).toBe('boot.ini');
  });

  it('never produces a hidden or empty name', () => {
    expect(safeDownloadName('.htaccess')).toBe('htaccess');
    expect(safeDownloadName('   ')).toBe('file');
    expect(safeDownloadName('???')).toBe('file');
  });
});
