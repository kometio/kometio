import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import * as setupApi from '../../lib/setup-api-client';
import { SetupImportForm } from './setup-import-form';

vi.mock('../../lib/setup-api-client', () => ({
  fetchSetupStatus: vi.fn(),
  importSiteArchive: vi.fn(),
}));

// The suite runs pinned to Italian (test-setup.ts), so the queries below
// match the Italian copy — same convention as every other form spec here.
const archive = new File(['the archive'], 'site.tar.gz', {
  type: 'application/gzip',
});

function renderForm(onImported = vi.fn(), onBack = vi.fn()) {
  render(<SetupImportForm onImported={onImported} onBack={onBack} />);
  return { onImported, onBack };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/token di installazione/i), {
    target: { value: 'the-real-token' },
  });
  fireEvent.change(screen.getByLabelText(/archivio del sito/i), {
    target: { files: [archive] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apri il sito' }));
}

describe('SetupImportForm', () => {
  const upload = vi.mocked(setupApi.importSiteArchive);

  beforeEach(() => {
    upload.mockResolvedValue(undefined);
    vi.mocked(setupApi.fetchSetupStatus).mockResolvedValue({
      hasBeenSetUp: false,
      importFailure: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is a page of its own, with the same gate as the wizard and one file', () => {
    renderForm();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Apri un sito di un’altra installazione',
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/token di installazione/i)).toBeTruthy();
    expect(screen.getByLabelText(/archivio del sito/i)).toBeTruthy();
    // No account to make: the accounts are in the archive.
    expect(screen.queryByLabelText(/la tua email/i)).toBeNull();
  });

  it('sends the file and the token', async () => {
    renderForm();

    fillAndSubmit();

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ file: archive, setupToken: 'the-real-token' }),
    );
  });

  it('says it is waiting for the server, which goes away and comes back', async () => {
    renderForm();

    fillAndSubmit();

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(
      /si ferma e riparte/i,
    );
  });

  it('holds the form still while it works: the file is not sent twice', async () => {
    renderForm();

    fillAndSubmit();

    await screen.findByRole('status');
    expect(
      screen
        .getByRole('button', { name: 'Apro il sito...' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'Crea invece un sito nuovo' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('shows how much of the file has gone', async () => {
    upload.mockImplementation(async ({ onProgress }) => {
      onProgress(512, 1024);
      await new Promise(() => undefined);
    });
    renderForm();

    fillAndSubmit();

    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toBe('512 B di 1.0 KB');
  });

  it('says what is wrong with the archive, under the form, and lets it be tried again', async () => {
    upload.mockRejectedValue(
      new ApiError(400, { message: 'this is not a Kometio site archive' }),
    );
    renderForm();

    fillAndSubmit();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'This is not a Kometio site archive.',
    );
    expect(
      screen
        .getByRole('button', { name: 'Apri il sito' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('says the server prints a new token after a failed attempt, and only then', async () => {
    upload.mockRejectedValueOnce(
      new ApiError(400, { message: 'this is not a Kometio site archive' }),
    );
    renderForm();
    fillAndSubmit();
    await screen.findByRole('alert');
    // Refused before the server did anything: it is the same server, with the same token.
    expect(screen.queryByText(/nuovo token di installazione/i)).toBeNull();

    upload.mockResolvedValue(undefined);
    vi.mocked(setupApi.fetchSetupStatus).mockResolvedValue({
      hasBeenSetUp: false,
      importFailure: 'there is not enough room on the volume',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apri il sito' }));

    expect(
      await screen.findByText(/nuovo token di installazione/i, undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy();
  }, 15_000);

  it('says so under the file when Open is pressed with no file, and sends nothing', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/token di installazione/i), {
      target: { value: 'the-real-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apri il sito' }));

    expect(
      screen.getByText('Scegli prima il file dell’archivio.'),
    ).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('goes back to a new site when asked', () => {
    const { onBack } = renderForm();

    fireEvent.click(
      screen.getByRole('button', { name: 'Crea invece un sito nuovo' }),
    );

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
