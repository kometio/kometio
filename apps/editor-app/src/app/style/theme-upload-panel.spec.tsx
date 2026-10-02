import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeUploadStatus } from '@kometio/shared-types';
import { ApiError } from '../../lib/http-client';
import * as uploadsApi from '../../lib/theme-uploads-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ThemeUploadPanel } from './theme-upload-panel';

vi.mock('../../lib/theme-uploads-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/theme-uploads-api-client')>();
  return {
    ...actual,
    getThemeUploadSettings: vi.fn(),
    uploadTheme: vi.fn(),
    getThemeUpload: vi.fn(),
  };
});

const status = (change: Partial<ThemeUploadStatus>): ThemeUploadStatus => ({
  id: '0b1c2d3e-4f50-4617-8899-aabbccddeeff',
  name: 'portfolio',
  state: 'queued',
  failure: null,
  log: null,
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  ...change,
});

function renderPanel(onUse = vi.fn()) {
  const utils = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ThemeUploadPanel onUse={onUse} />
    </QueryClientProvider>,
  );
  return { ...utils, onUse };
}

async function choose(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No file input');
  const file = new File(['zip'], 'theme.zip', { type: 'application/zip' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('ThemeUploadPanel', () => {
  beforeEach(() => {
    vi.mocked(uploadsApi.getThemeUploadSettings).mockResolvedValue({
      enabled: true,
    });
  });

  it('is not there where uploads are off, or for somebody who is not an admin', async () => {
    vi.mocked(uploadsApi.getThemeUploadSettings).mockResolvedValue({
      enabled: false,
    });
    const { container } = renderPanel();

    await waitFor(() =>
      expect(uploadsApi.getThemeUploadSettings).toHaveBeenCalled(),
    );
    expect(container.innerHTML).toBe('');
  });

  it('follows an upload until the site can use it, and uses it on request', async () => {
    vi.mocked(uploadsApi.uploadTheme).mockResolvedValue(status({}));
    vi.mocked(uploadsApi.getThemeUpload)
      .mockResolvedValueOnce(status({ state: 'building' }))
      .mockResolvedValue(status({ state: 'published' }));
    const { container, onUse } = renderPanel();

    await screen.findByRole('button', { name: 'Carica un tema' });
    await choose(container);

    expect(
      await screen.findByText(/Costruzione del sito con «portfolio»/),
    ).toBeTruthy();
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Usa «portfolio» per questo sito' },
        { timeout: 4000 },
      ),
    );
    expect(onUse).toHaveBeenCalledWith('portfolio');
  });

  it('says why the API refused the file, in words', async () => {
    vi.mocked(uploadsApi.uploadTheme).mockRejectedValue(
      new ApiError(400, { message: 'bad-name', statusCode: 400 }),
    );
    const { container } = renderPanel();

    await screen.findByRole('button', { name: 'Carica un tema' });
    await choose(container);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'theme.json ha bisogno di un "name"',
    );
  });

  it('shows why a build failed, with its output', async () => {
    vi.mocked(uploadsApi.uploadTheme).mockResolvedValue(status({}));
    vi.mocked(uploadsApi.getThemeUpload).mockResolvedValue(
      status({
        state: 'failed',
        failure: 'build-failed',
        log: 'error: Header.astro: unexpected token',
      }),
    );
    const { container } = renderPanel();

    await screen.findByRole('button', { name: 'Carica un tema' });
    await choose(container);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Il sito non si è costruito');
    expect(alert.textContent).toContain('Header.astro: unexpected token');
  });
});
