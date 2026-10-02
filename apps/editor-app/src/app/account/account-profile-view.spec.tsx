import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AccountProfile } from '@kometio/api-contracts';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import * as accountApi from '../../lib/account-api-client';
import { ApiError } from '../../lib/http-client';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { AccountProfileView } from './account-profile-view';

// The save bar asks before a link throws unsaved work away, which needs a
// router; nothing is being left here.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/account-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/account-api-client')>();
  return {
    ...actual,
    updateAccountProfile: vi.fn(),
    uploadAccountAvatar: vi.fn(),
    removeAccountAvatar: vi.fn(),
    changePassword: vi.fn(),
    requestEmailChange: vi.fn(),
  };
});

const profile: AccountProfile = {
  id: 'user-1',
  email: 'giulia@example.com',
  role: 'editor',
  displayName: 'Giulia Rossi',
  slug: 'giulia-rossi',
  // French is not a language the site publishes any more.
  bio: { it: 'Scrive di caffè.', fr: 'Écrit sur le café.' },
  avatarUrl: 'https://cdn.test/giulia.webp',
  language: null,
};

function renderView(overrides: Partial<AccountProfile> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <AccountProfileView
            profile={{ ...profile, ...overrides }}
            locales={['it', 'en']}
          />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('AccountProfileView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks for a bio in each language the site publishes, and shows email and role without editing them', () => {
    renderView();

    expect(
      (screen.getByLabelText('italiano') as HTMLTextAreaElement).value,
    ).toBe('Scrive di caffè.');
    expect(
      (screen.getByLabelText('inglese') as HTMLTextAreaElement).value,
    ).toBe('');
    expect(screen.queryByLabelText('francese')).toBeNull();
    expect(screen.getByText('giulia@example.com').tagName).toBe('DD');
    expect(screen.getByText('Editor').tagName).toBe('DD');
  });

  it('opens each change in a dialog of its own, from the Accesso section', async () => {
    renderView();

    const section = screen.getByRole('region', { name: 'Accesso' });
    expect(section.textContent).toContain('giulia@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
    expect(
      await screen.findByRole('heading', { name: 'Cambia la tua password' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Cambia la tua password' }),
      ).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cambia email' }));
    expect(
      await screen.findByRole('heading', { name: 'Cambia la tua email' }),
    ).toBeTruthy();
  });

  it('does not save the profile when a dialog is submitted: the two forms are separate', async () => {
    vi.mocked(accountApi.changePassword).mockResolvedValue(undefined);
    renderView();
    // Something to save, so a stray submit of the profile would go through.
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Giulia Bianchi' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
    fireEvent.change(await screen.findByLabelText('Password attuale'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('Nuova password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.change(screen.getByLabelText('Ripeti la nuova password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.submit(
      screen
        .getByLabelText('Nuova password')
        .closest('form') as HTMLFormElement,
    );

    await waitFor(() => expect(accountApi.changePassword).toHaveBeenCalled());
    expect(accountApi.updateAccountProfile).not.toHaveBeenCalled();
  });

  it('shows the author page address in each language, under that language’s word', () => {
    renderView();

    expect(
      screen.getByText(`${PUBLIC_SITE_URL}/it/autore/giulia-rossi`),
    ).toBeTruthy();
    expect(
      screen.getByText(`${PUBLIC_SITE_URL}/en/author/giulia-rossi`),
    ).toBeTruthy();
  });

  it('makes the addresses the site has into links that open in a new tab', () => {
    renderView();

    const link = screen.getByRole('link', {
      name: /\/it\/autore\/giulia-rossi/,
    });
    expect(link.getAttribute('href')).toBe(
      `${PUBLIC_SITE_URL}/it/autore/giulia-rossi`,
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // Said to a screen reader too, not only by the browser's behaviour.
    expect(link.textContent).toContain('si apre in una nuova scheda');
  });

  it('leaves an address that is only typed as plain text, until it is saved', () => {
    renderView();

    fireEvent.change(screen.getByLabelText('Indirizzo della pagina autore'), {
      target: { value: 'giulia-nuova' },
    });

    expect(
      screen.getByText(`${PUBLIC_SITE_URL}/it/autore/giulia-nuova`),
    ).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says under the picture that it is saved at once, unlike the rest', () => {
    renderView();

    expect(
      screen.getByText('La foto si salva subito, senza aspettare Salva.'),
    ).toBeTruthy();
  });

  it('previews the address made from the name for someone who has none yet', () => {
    renderView({ displayName: null, slug: null });

    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Luca Verdì' },
    });

    expect(
      screen.getByText(`${PUBLIC_SITE_URL}/it/autore/luca-verdi`),
    ).toBeTruthy();
  });

  it('saves the name, the address and the bio — keeping what was written in a language switched off', async () => {
    vi.mocked(accountApi.updateAccountProfile).mockResolvedValue(profile);
    renderView();

    fireEvent.change(screen.getByLabelText('inglese'), {
      target: { value: 'Writes about coffee.' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect(await screen.findByText('Salvato')).toBeTruthy();
    expect(accountApi.updateAccountProfile).toHaveBeenCalledWith({
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {
        it: 'Scrive di caffè.',
        en: 'Writes about coffee.',
        fr: 'Écrit sur le café.',
      },
    });
  });

  it('writes a typed address the way an address is written, on leaving the field', () => {
    renderView();
    const field = screen.getByLabelText('Indirizzo della pagina autore');

    fireEvent.change(field, { target: { value: 'Giulia Rossì Blog' } });
    fireEvent.blur(field);

    expect((field as HTMLInputElement).value).toBe('giulia-rossi-blog');
  });

  it('writes the address the way an address is written when saved straight after typing', async () => {
    vi.mocked(accountApi.updateAccountProfile).mockResolvedValue(profile);
    renderView();

    fireEvent.change(screen.getByLabelText('Indirizzo della pagina autore'), {
      target: { value: 'Giulia Rossì Blog' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect(await screen.findByText('Salvato')).toBeTruthy();
    expect(accountApi.updateAccountProfile).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'giulia-rossi-blog' }),
    );
  });

  it('offers nothing to save until something has changed, and puts the profile back on Cancel', async () => {
    renderView();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();

    const name = screen.getByLabelText('Nome');
    fireEvent.change(name, { target: { value: 'Giulia R.' } });
    expect(await screen.findByText('Modifiche non salvate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect((name as HTMLInputElement).value).toBe('Giulia Rossi');
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });

  it('previews the address they keep when the field is emptied', () => {
    renderView();

    fireEvent.change(screen.getByLabelText('Indirizzo della pagina autore'), {
      target: { value: '' },
    });

    expect(
      screen.getByText(`${PUBLIC_SITE_URL}/it/autore/giulia-rossi`),
    ).toBeTruthy();
  });

  it('says so when someone else already has the address', async () => {
    vi.mocked(accountApi.updateAccountProfile).mockRejectedValue(
      new ApiError(409, { message: 'taken' }),
    );
    renderView();

    fireEvent.change(screen.getByLabelText('inglese'), {
      target: { value: 'Writes about coffee.' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect(
      await screen.findByText(
        'Questo indirizzo è già usato da un’altra persona. Scegline un altro.',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText('Indirizzo della pagina autore')
        .getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('explains a file that is not a picture, and removes the picture on request', async () => {
    vi.mocked(accountApi.uploadAccountAvatar).mockRejectedValue(
      new ApiError(400, { message: 'not an image' }),
    );
    vi.mocked(accountApi.removeAccountAvatar).mockResolvedValue({
      ...profile,
      avatarUrl: null,
    });
    const { container } = renderView();
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('no file input');

    fireEvent.change(input, {
      target: {
        files: [new File(['<svg/>'], 'me.svg', { type: 'image/svg+xml' })],
      },
    });
    expect(
      await screen.findByText(
        'Questo file non è un’immagine. Scegli un JPG, PNG, WebP, GIF o AVIF.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));
    await waitFor(() =>
      expect(accountApi.removeAccountAvatar).toHaveBeenCalled(),
    );
    // It saves at once, with no bar: a line says it did.
    expect(await screen.findByText('Foto rimossa')).toBeTruthy();
  });

  it('says the picture was updated once it is saved', async () => {
    vi.mocked(accountApi.uploadAccountAvatar).mockResolvedValue(profile);
    const { container } = renderView();
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error('no file input');

    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'me.png', { type: 'image/png' })],
      },
    });

    expect(await screen.findByText('Foto aggiornata')).toBeTruthy();
  });
});
