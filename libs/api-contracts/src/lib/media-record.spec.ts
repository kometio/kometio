import { describe, expect, it } from 'vitest';
import {
  mediaKindCountsSchema,
  mediaRecordSchema,
  paginatedMediaSchema,
} from './media-record';

const media = {
  id: 'm1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  filename: 'foto.webp',
  alt: '',
  storageKey: 'site-1/foto.webp',
  storageProvider: 'local',
  mimeType: 'image/webp',
  size: 2048,
  width: 800,
  height: 600,
  createdAt: '2026-01-01T00:00:00.000Z',
  url: '/uploads/foto.webp',
};

describe('mediaRecordSchema', () => {
  it('accepts an image, and a file with no dimensions', () => {
    expect(mediaRecordSchema.parse(media)).toEqual(media);
    expect(
      mediaRecordSchema.safeParse({ ...media, width: null, height: null })
        .success,
    ).toBe(true);
  });

  it('keeps the alternative text a person wrote, and requires the field to be there', () => {
    expect(mediaRecordSchema.parse({ ...media, alt: 'Una foto' }).alt).toBe(
      'Una foto',
    );
    expect(
      mediaRecordSchema.safeParse({ ...media, alt: undefined }).success,
    ).toBe(false);
  });

  it('refuses a storage provider the deployment does not have', () => {
    expect(
      mediaRecordSchema.safeParse({ ...media, storageProvider: 'ftp' }).success,
    ).toBe(false);
  });
});

describe('paginatedMediaSchema', () => {
  it('wraps the records with the total', () => {
    expect(paginatedMediaSchema.parse({ items: [media], total: 1 }).total).toBe(
      1,
    );
  });
});

describe('mediaKindCountsSchema', () => {
  it('counts each folder of the library by kind', () => {
    const counts = { image: 3, video: 0, audio: 0, document: 1, other: 0 };

    expect(mediaKindCountsSchema.parse(counts)).toEqual(counts);
  });

  it('refuses a folder that is not one of the kinds', () => {
    expect(
      mediaKindCountsSchema.safeParse({ image: 1, archive: 2 }).success,
    ).toBe(false);
  });
});
