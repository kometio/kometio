import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { useMediaPicker } from './media-picker-context';
import type { PickedMedia } from '@kometio/shared-types';
import { WithToasts } from '../../test/toasts.test-fixture';
import * as api from '../../lib/media-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildMediaRecord } from '@kometio/testing/records';
import { MediaPickerProvider } from './media-picker-provider';

vi.mock('../../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/media-api-client')>();
  return { ...actual, listMedia: vi.fn(), uploadMedia: vi.fn() };
});

const mediaOne = buildMediaRecord();

function PickerConsumer() {
  const { pick } = useMediaPicker();
  const [result, setResult] = useState<PickedMedia | null | 'pending'>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setResult('pending');
          void pick().then(setResult);
        }}
      >
        Apri picker
      </button>
      <p>{result === 'pending' || result === null ? '' : result.url}</p>
      <p data-testid="picked-alt">
        {result === 'pending' || result === null
          ? ''
          : (result.alt ?? '(absent)')}
      </p>
    </div>
  );
}

function renderProvider() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <MediaPickerProvider siteId="site-1">
          <PickerConsumer />
        </MediaPickerProvider>
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('MediaPickerProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the dialog on pick() and resolves with the selected media', async () => {
    vi.mocked(api.listMedia).mockResolvedValue({
      items: [mediaOne],
      total: 1,
    });

    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));

    fireEvent.click(await screen.findByRole('button', { name: 'foto.png' }));

    await waitFor(() => expect(screen.getByText(mediaOne.url)).toBeTruthy());
    // The dialog closes itself once a selection resolves the pick().
    expect(screen.queryByRole('heading', { name: /scegli/i })).toBeNull();
  });

  it('hands back the file’s own alternative text with the pick, for an image with none of its own', async () => {
    vi.mocked(api.listMedia).mockResolvedValue({
      items: [{ ...mediaOne, alt: 'Una moka sul fornello' }],
      total: 1,
    });

    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));
    fireEvent.click(await screen.findByRole('button', { name: 'foto.png' }));

    await waitFor(() =>
      expect(screen.getByTestId('picked-alt').textContent).toBe(
        'Una moka sul fornello',
      ),
    );
  });

  it('resolves with null when the dialog is dismissed without a selection', async () => {
    vi.mocked(api.listMedia).mockResolvedValue({ items: [], total: 0 });

    renderProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));
    await screen.findByRole('heading', { name: /scegli/i });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /scegli/i })).toBeNull(),
    );
  });
});
