import { describe, expect, it } from 'vitest';
import {
  InvalidMediaFilenameError,
  Media,
  MediaNotFoundError,
} from '@kometio/domain-core';
import {
  FakeMediaUsagePort,
  InMemoryMediaRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';
import { getMedia } from './get-media.use-case';
import { updateMedia } from './update-media.use-case';
import { getMediaUsages } from './get-media-usages.use-case';

const tenantId = 'tenant-1';

async function setup(usage = new FakeMediaUsagePort()) {
  const mediaRepository = new InMemoryMediaRepository();
  const media = Media.create({
    id: 'media-1',
    tenantId,
    siteId: 'site-1',
    filename: 'foto.jpg',
    storageKey: 'abc.webp',
    storageProvider: 'local',
    mimeType: 'image/webp',
    size: 100,
    width: 10,
    height: 10,
  });
  await mediaRepository.add(media);
  return {
    mediaRepository,
    mediaUsage: usage,
    siteRepository: new InMemorySiteRepository(
      buildSite({ defaultLocale: 'it', enabledLocales: ['it', 'en'] }),
    ),
  };
}

describe('getMedia', () => {
  it('finds a file by its id', async () => {
    const deps = await setup();

    const media = await getMedia(deps, { tenantId, mediaId: 'media-1' });

    expect(media.filename).toBe('foto.jpg');
  });

  it('does not find another tenant’s file, or one that is not there', async () => {
    const deps = await setup();

    await expect(
      getMedia(deps, { tenantId: 'tenant-2', mediaId: 'media-1' }),
    ).rejects.toThrow(MediaNotFoundError);
    await expect(getMedia(deps, { tenantId, mediaId: 'nope' })).rejects.toThrow(
      MediaNotFoundError,
    );
  });
});

describe('updateMedia', () => {
  it('renames a file and writes its alternative text, and both stay', async () => {
    const deps = await setup();

    const updated = await updateMedia(deps, {
      tenantId,
      mediaId: 'media-1',
      filename: 'lago.jpg',
      alt: 'Il lago all’alba',
    });

    expect(updated.filename).toBe('lago.jpg');
    const stored = await deps.mediaRepository.findById(tenantId, 'media-1');
    expect(stored?.filename).toBe('lago.jpg');
    expect(stored?.alt).toBe('Il lago all’alba');
  });

  it('changes only what it is given', async () => {
    const deps = await setup();
    await updateMedia(deps, { tenantId, mediaId: 'media-1', alt: 'Un lago' });

    await updateMedia(deps, {
      tenantId,
      mediaId: 'media-1',
      filename: 'lago.jpg',
    });

    const stored = await deps.mediaRepository.findById(tenantId, 'media-1');
    expect([stored?.filename, stored?.alt]).toEqual(['lago.jpg', 'Un lago']);
  });

  it('clears the alternative text with an empty one', async () => {
    const deps = await setup();
    await updateMedia(deps, { tenantId, mediaId: 'media-1', alt: 'Un lago' });

    await updateMedia(deps, { tenantId, mediaId: 'media-1', alt: '' });

    expect(
      (await deps.mediaRepository.findById(tenantId, 'media-1'))?.alt,
    ).toBe('');
  });

  it('refuses a name that is not one, and changes nothing — not even the alternative text sent with it', async () => {
    const deps = await setup();

    await expect(
      updateMedia(deps, {
        tenantId,
        mediaId: 'media-1',
        filename: '../x',
        alt: 'Non salvato',
      }),
    ).rejects.toThrow(InvalidMediaFilenameError);

    const stored = await deps.mediaRepository.findById(tenantId, 'media-1');
    expect([stored?.filename, stored?.alt]).toEqual(['foto.jpg', '']);
  });

  it('does not touch another tenant’s file', async () => {
    const deps = await setup();

    await expect(
      updateMedia(deps, {
        tenantId: 'tenant-2',
        mediaId: 'media-1',
        filename: 'x.jpg',
      }),
    ).rejects.toThrow(MediaNotFoundError);
  });
});

describe('getMediaUsages', () => {
  it('asks about the file’s own site, and answers nothing for a file used nowhere', async () => {
    const usage = new FakeMediaUsagePort();
    const deps = await setup(usage);

    const result = await getMediaUsages(deps, { tenantId, mediaId: 'media-1' });

    expect(result).toEqual({ pages: [], sections: [], layout: [] });
    expect(usage.asked).toEqual([
      { tenantId, siteId: 'site-1', mediaId: 'media-1' },
    ]);
  });

  it('makes a page one entry however many of its languages hold the file, named in the site’s default language', async () => {
    const deps = await setup(
      new FakeMediaUsagePort({
        pages: [
          { pageGroupId: 'g1', locale: 'en', slug: 'about', title: 'About us' },
          {
            pageGroupId: 'g1',
            locale: 'it',
            slug: 'chi-siamo',
            title: 'Chi siamo',
          },
          { pageGroupId: 'g2', locale: 'en', slug: 'contacts', title: null },
        ],
        sections: [],
        layout: [],
      }),
    );

    const { pages } = await getMediaUsages(deps, {
      tenantId,
      mediaId: 'media-1',
    });

    // Sorted by how each is called; a page with no title is called by its address.
    expect(pages).toEqual([
      { pageGroupId: 'g1', title: 'Chi siamo', locales: ['en', 'it'] },
      { pageGroupId: 'g2', title: 'contacts', locales: ['en'] },
    ]);
  });

  it('falls back to the first language when the default one does not hold the file', async () => {
    const deps = await setup(
      new FakeMediaUsagePort({
        pages: [
          { pageGroupId: 'g1', locale: 'en', slug: 'about', title: 'About us' },
        ],
        sections: [],
        layout: [],
      }),
    );

    const { pages } = await getMediaUsages(deps, {
      tenantId,
      mediaId: 'media-1',
    });

    expect(pages[0]?.title).toBe('About us');
  });

  it('lists shared sections and the header and footer as they are', async () => {
    const deps = await setup(
      new FakeMediaUsagePort({
        pages: [],
        sections: [
          { sectionId: 's2', name: 'Zeta', kind: 'template' },
          { sectionId: 's1', name: 'Alfa', kind: 'shared' },
        ],
        layout: [{ kind: 'header', locale: 'it' }],
      }),
    );

    const result = await getMediaUsages(deps, { tenantId, mediaId: 'media-1' });

    expect(result.sections.map((section) => section.name)).toEqual([
      'Alfa',
      'Zeta',
    ]);
    expect(result.layout).toEqual([{ kind: 'header', locale: 'it' }]);
  });

  it('is not found for a file that is not there', async () => {
    const deps = await setup();

    await expect(
      getMediaUsages(deps, { tenantId, mediaId: 'nope' }),
    ).rejects.toThrow(MediaNotFoundError);
  });
});
