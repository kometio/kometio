import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PickedMedia } from '@kometio/shared-types';
import * as themeApi from '../../lib/theme-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useIconList } from './icon-list-context';
import { IconListProvider } from './icon-list-provider';
import { MediaPickerContext } from '../media/media-picker-context';

vi.mock('./use-active-theme-name', () => ({
  useActiveThemeName: () => 'classic',
}));

vi.mock('../../lib/theme-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/theme-api-client')>();
  return { ...actual, fetchThemeIcons: vi.fn() };
});

const linkedin: PickedMedia = {
  mediaId: 'media-1',
  url: 'http://localhost:3000/api/uploads/linkedin.png',
  width: 64,
  height: 64,
};

function PickButton() {
  const { pick } = useIconList();
  const [picked, setPicked] = useState<string | null | 'pending'>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setPicked('pending');
          void pick().then(setPicked);
        }}
      >
        Pick an icon
      </button>
      <output data-testid="picked">{String(picked)}</output>
    </div>
  );
}

function renderProvider(mediaPick = vi.fn().mockResolvedValue(linkedin)) {
  vi.mocked(themeApi.fetchThemeIcons).mockResolvedValue([
    { name: 'brand:github', svg: '<svg />' },
  ]);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MediaPickerContext.Provider value={{ pick: mediaPick }}>
        <IconListProvider>
          <PickButton />
        </IconListProvider>
      </MediaPickerContext.Provider>
    </QueryClientProvider>,
  );
  return { mediaPick };
}

describe('IconListProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * LinkedIn is in no set — simple-icons removed it at its owner's
   * request — so the only way to put it on a page is an image of it.
   */
  it('turns an image from the library into the icon', async () => {
    const { mediaPick } = renderProvider();

    fireEvent.click(screen.getByText('Pick an icon'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Immagine' }));
    fireEvent.click(
      screen.getByRole('button', { name: /scegli dalla libreria/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('picked').textContent).toBe(
        'media:media-1:http://localhost:3000/api/uploads/linkedin.png',
      ),
    );
    expect(mediaPick).toHaveBeenCalledWith({ kind: 'image' });
  });

  it('settles with nothing when the library is closed without a choice', async () => {
    renderProvider(vi.fn().mockResolvedValue(null));

    fireEvent.click(screen.getByText('Pick an icon'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Immagine' }));
    fireEvent.click(
      screen.getByRole('button', { name: /scegli dalla libreria/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('picked').textContent).toBe('null'),
    );
  });

  /*
   * The logos serialise to 5.2MB. The tab asks the server for the ones
   * matching the search, never for the whole set.
   */
  it('searches the logos on the server instead of downloading them all', async () => {
    renderProvider();

    fireEvent.click(screen.getByText('Pick an icon'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Marchi' }));
    fireEvent.change(screen.getByPlaceholderText('Cerca icona…'), {
      target: { value: 'git' },
    });

    await waitFor(() =>
      expect(themeApi.fetchThemeIcons).toHaveBeenCalledWith(
        'classic',
        'brand',
        { search: 'git', limit: 120 },
      ),
    );
    expect(themeApi.fetchThemeIcons).not.toHaveBeenCalledWith(
      'classic',
      'brand',
    );
  });
});
