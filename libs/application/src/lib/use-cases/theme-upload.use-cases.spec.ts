import { describe, expect, it, vi } from 'vitest';
import {
  ThemeUploadNotFoundError,
  ThemeUploadRejectedError,
} from '@kometio/domain-core';
import type { InspectedThemeArchive, ThemeUploadPort } from '@kometio/ports';
import type { ThemeUploadStatus } from '@kometio/shared-types';
import { getThemeUpload, uploadTheme } from './theme-upload.use-cases';

const queued: ThemeUploadStatus = {
  id: 'u1',
  name: 'portfolio',
  state: 'queued',
  failure: null,
  log: null,
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
};

function depsWith(inspected: InspectedThemeArchive) {
  const themeUploads: ThemeUploadPort = {
    inspect: vi.fn().mockResolvedValue(inspected),
    enqueue: vi.fn().mockResolvedValue(queued),
    status: vi.fn().mockResolvedValue(null),
  };
  const themeCatalog = {
    listAvailableThemes: vi.fn().mockResolvedValue([
      { name: 'classic', uploaded: false },
      { name: 'portfolio', uploaded: true },
    ]),
  };
  return { themeUploads, themeCatalog };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ThemeUploadRejectedError) return error.failure;
    throw error;
  }
  throw new Error('It was accepted.');
}

describe('uploadTheme', () => {
  it('queues an archive the site can take, a new version of an uploaded theme included', async () => {
    const deps = depsWith({ ok: true, name: 'portfolio' });

    expect(await uploadTheme(deps, { archivePath: '/tmp/a.zip' })).toBe(queued);
    expect(deps.themeUploads.enqueue).toHaveBeenCalledWith(
      '/tmp/a.zip',
      'portfolio',
    );
  });

  it('refuses what is wrong with the archive, with the reason', async () => {
    const deps = depsWith({ ok: false, failure: 'link' });

    expect(
      await rejection(uploadTheme(deps, { archivePath: '/tmp/a.zip' })),
    ).toBe('link');
    expect(deps.themeUploads.enqueue).not.toHaveBeenCalled();
  });

  it("refuses the name of one of Kometio's own themes", async () => {
    const deps = depsWith({ ok: true, name: 'classic' });

    expect(
      await rejection(uploadTheme(deps, { archivePath: '/tmp/a.zip' })),
    ).toBe('core-name');
    expect(deps.themeUploads.enqueue).not.toHaveBeenCalled();
  });
});

describe('getThemeUpload', () => {
  it('answers with the status, or not found', async () => {
    const deps = depsWith({ ok: true, name: 'portfolio' });
    await expect(getThemeUpload(deps, { id: 'nope' })).rejects.toBeInstanceOf(
      ThemeUploadNotFoundError,
    );

    vi.mocked(deps.themeUploads.status).mockResolvedValue(queued);
    expect(await getThemeUpload(deps, { id: 'u1' })).toBe(queued);
  });
});
