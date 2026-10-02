import { describe, expect, it } from 'vitest';
import { InvalidMediaFilenameError } from '../errors';
import { Media } from './media';

describe('Media entity', () => {
  const baseInput = {
    id: 'media-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    filename: 'hero.jpg',
    storageKey: 'tenant-1/site-1/hero.jpg',
    storageProvider: 'local' as const,
    mimeType: 'image/jpeg',
    size: 12345,
    width: 1200,
    height: 630,
  };

  it('defaults createdAt to now when not provided', () => {
    const before = new Date();
    const media = Media.create(baseInput);
    const after = new Date();

    expect(media.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(media.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('exposes every prop via its getters', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const media = Media.create({ ...baseInput, now });

    expect(media.id).toBe('media-1');
    expect(media.tenantId).toBe('tenant-1');
    expect(media.siteId).toBe('site-1');
    expect(media.filename).toBe('hero.jpg');
    expect(media.storageKey).toBe('tenant-1/site-1/hero.jpg');
    expect(media.storageProvider).toBe('local');
    expect(media.mimeType).toBe('image/jpeg');
    expect(media.size).toBe(12345);
    expect(media.width).toBe(1200);
    expect(media.height).toBe(630);
    expect(media.createdAt).toEqual(now);
  });

  it('allows null width/height (e.g. non-image files)', () => {
    const media = Media.create({
      ...baseInput,
      width: null,
      height: null,
      mimeType: 'application/pdf',
    });

    expect(media.width).toBeNull();
    expect(media.height).toBeNull();
  });

  it('fromProps/toProps round-trip without loss', () => {
    const props = {
      ...baseInput,
      alt: 'A view of the lake',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    const media = Media.fromProps(props);

    expect(media.toProps()).toEqual(props);
  });

  describe('what a person writes about it', () => {
    it('starts with no alternative text', () => {
      expect(Media.create(baseInput).alt).toBe('');
    });

    it('takes the alternative text it is created with', () => {
      expect(Media.create({ ...baseInput, alt: 'A lake' }).alt).toBe('A lake');
    });

    it('is renamed, without the spaces around the name', () => {
      const media = Media.create(baseInput);

      media.rename('  lago di como.jpg ');

      expect(media.filename).toBe('lago di como.jpg');
      // The stored file keeps the key it was written under.
      expect(media.storageKey).toBe(baseInput.storageKey);
    });

    it.each([
      ['empty', '   ', /empty/],
      ['a path', 'foto/../segreto.jpg', /slash/],
      ['a windows path', 'cartella\\foto.jpg', /slash/],
      ['with a control character', 'foto\u0000.jpg', /control/],
      ['too long', 'a'.repeat(256), /longer/],
    ])('refuses a name that is %s', (_label, name, reason) => {
      const media = Media.create(baseInput);

      expect(() => media.rename(name)).toThrow(InvalidMediaFilenameError);
      expect(() => media.rename(name)).toThrow(reason);
      expect(media.filename).toBe('hero.jpg');
    });

    it('keeps the alternative text as typed, apart from the spaces around it, and can clear it', () => {
      const media = Media.create({ ...baseInput, alt: 'old' });

      media.changeAlt('  A lake at dawn  ');
      expect(media.alt).toBe('A lake at dawn');

      media.changeAlt('');
      expect(media.alt).toBe('');
    });
  });
});
