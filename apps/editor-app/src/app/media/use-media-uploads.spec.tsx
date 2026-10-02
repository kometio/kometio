import type { ReactNode } from 'react';
import {
  act,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildMediaRecord } from '@kometio/testing/records';
import * as api from '../../lib/media-api-client';
import { ApiError } from '../../lib/http-client';
import { WithToasts } from '../../test/toasts.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useMediaUploads } from './use-media-uploads';

vi.mock('../../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/media-api-client')>();
  return { ...actual, uploadMedia: vi.fn() };
});

const image = (name: string) => new File(['x'], name, { type: 'image/png' });

const imageRecord = (filename: string) =>
  buildMediaRecord({ filename, mimeType: 'image/webp' });

function setup(options: Parameters<typeof useMediaUploads>[0]) {
  const queryClient: QueryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WithToasts>{children}</WithToasts>
      </QueryClientProvider>
    );
  }
  return {
    invalidate,
    ...renderHook(() => useMediaUploads(options), { wrapper }),
  };
}

describe('useMediaUploads', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * Twenty photos at once are twenty re-encodes competing for one machine,
   * so they go up one after another, each with a line of its own.
   */
  it('uploads the files one after another, a line for each, and says where they went', async () => {
    vi.mocked(api.uploadMedia)
      .mockResolvedValueOnce(imageRecord('a.webp'))
      .mockResolvedValueOnce(imageRecord('b.webp'));
    const onSee = vi.fn();
    const { result } = setup({ siteId: 'site-1', onSee });

    await act(async () => {
      await result.current.upload([image('a.png'), image('b.png')]);
    });

    expect(api.uploadMedia).toHaveBeenCalledTimes(2);
    expect(result.current.entries.map((entry) => entry.status)).toEqual([
      'done',
      'done',
    ]);
    expect(await screen.findByText('2 file caricati in Immagini')).toBeTruthy();
    // Taking the action goes to the folder the files landed in.
    fireEvent.click(screen.getByRole('button', { name: 'Vedi' }));
    expect(onSee).toHaveBeenCalledWith('image');
  });

  it('shows a file as waiting until its turn, then as on its way', async () => {
    let release: (media: api.MediaRecord) => void = () => undefined;
    vi.mocked(api.uploadMedia)
      .mockImplementationOnce(
        () => new Promise<api.MediaRecord>((resolve) => (release = resolve)),
      )
      .mockResolvedValueOnce(imageRecord('b.webp'));
    const { result } = setup({ siteId: 'site-1' });

    let finished: Promise<void> = Promise.resolve();
    act(() => {
      finished = result.current.upload([image('a.png'), image('b.png')]);
    });

    expect(result.current.isUploading).toBe(true);
    expect(result.current.entries.map((entry) => entry.status)).toEqual([
      'uploading',
      'waiting',
    ]);

    await act(async () => {
      release(imageRecord('a.webp'));
      await finished;
    });
    expect(result.current.isUploading).toBe(false);
  });

  it('says why a file did not go up, on its own line, and goes on with the ones behind it', async () => {
    vi.mocked(api.uploadMedia)
      .mockRejectedValueOnce(new ApiError(413, { message: 'File too large' }))
      .mockResolvedValueOnce(imageRecord('b.webp'));
    const { result } = setup({ siteId: 'site-1' });

    await act(async () => {
      await result.current.upload([image('a.png'), image('b.png')]);
    });

    expect(result.current.entries).toEqual([
      expect.objectContaining({ status: 'failed', error: 'File too large' }),
      expect.objectContaining({ status: 'done' }),
    ]);
    expect(await screen.findByText('Caricati 1 su 2 file')).toBeTruthy();
  });

  it('says so when nothing went up', async () => {
    vi.mocked(api.uploadMedia).mockRejectedValue(new Error('boom'));
    const { result } = setup({ siteId: 'site-1' });

    await act(async () => {
      await result.current.upload([image('a.png')]);
    });

    expect(
      await screen.findByText('Nessun file è stato caricato'),
    ).toBeTruthy();
  });

  it('names no folder when the files went to several, and offers the folders', async () => {
    vi.mocked(api.uploadMedia)
      .mockResolvedValueOnce(imageRecord('a.webp'))
      .mockResolvedValueOnce(
        buildMediaRecord({ filename: 'b.pdf', mimeType: 'application/pdf' }),
      );
    const onSee = vi.fn();
    const { result } = setup({ siteId: 'site-1', onSee });

    await act(async () => {
      await result.current.upload([image('a.png'), image('b.pdf')]);
    });

    expect(await screen.findByText('2 file caricati')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vedi' }));
    expect(onSee).toHaveBeenCalledWith(null);
  });

  it('does not offer to see a folder somebody is already looking at, or anywhere in a picker', async () => {
    vi.mocked(api.uploadMedia).mockResolvedValue(imageRecord('a.webp'));

    const inFolder = setup({
      siteId: 'site-1',
      currentKind: 'image',
      onSee: vi.fn(),
    });
    await act(async () => {
      await inFolder.result.current.upload([image('a.png')]);
    });
    expect(await screen.findByText('1 file caricato in Immagini')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vedi' })).toBeNull();
  });

  it('refreshes the library once at the end, not after every file', async () => {
    vi.mocked(api.uploadMedia).mockResolvedValue(imageRecord('a.webp'));
    const { result, invalidate } = setup({ siteId: 'site-1' });

    await act(async () => {
      await result.current.upload([
        image('a.png'),
        image('b.png'),
        image('c.png'),
      ]);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['media', 'site-1'] });
  });

  it('ignores a second batch while the first is still going', async () => {
    let release: (media: api.MediaRecord) => void = () => undefined;
    vi.mocked(api.uploadMedia).mockImplementationOnce(
      () => new Promise<api.MediaRecord>((resolve) => (release = resolve)),
    );
    const { result } = setup({ siteId: 'site-1' });

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.upload([image('a.png')]);
    });
    await act(async () => {
      await result.current.upload([image('b.png')]);
    });
    await act(async () => {
      release(imageRecord('a.webp'));
      await first;
    });

    expect(api.uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('clears the lines when dismissed', async () => {
    vi.mocked(api.uploadMedia).mockResolvedValue(imageRecord('a.webp'));
    const { result } = setup({ siteId: 'site-1' });

    await act(async () => {
      await result.current.upload([image('a.png')]);
    });
    act(() => result.current.dismiss());

    expect(result.current.entries).toEqual([]);
  });
});
