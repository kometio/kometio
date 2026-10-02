import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { LocaleSettingsSection } from './locale-settings-section';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateLocaleSettings: vi.fn() };
});

const site = buildSiteRecord({
  enabledLocales: ['it', 'en', 'fr'],
  defaultLocale: 'it',
  untranslatedPageFallback: 'redirect-to-default',
});

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <LocaleSettingsSection site={site} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('LocaleSettingsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks before a language is taken away, and says nothing is deleted', async () => {
    vi.mocked(api.updateLocaleSettings).mockResolvedValue({
      ...site,
      enabledLocales: ['it', 'en'],
    });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /^rimuovi francese/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Togliere questa lingua?');
    expect(dialog.textContent).toContain('Le pagine in francese');
    expect(dialog.textContent).toContain('selettore di lingua');
    expect(dialog.textContent).toContain('Nessun testo viene cancellato');
    expect(api.updateLocaleSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Togli la lingua' }));

    await waitFor(() =>
      expect(api.updateLocaleSettings).toHaveBeenCalledWith('site-1', {
        enabledLocales: ['it', 'en'],
        defaultLocale: 'it',
        untranslatedPageFallback: 'redirect-to-default',
      }),
    );
  });

  it('names every language when several go at once', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /^rimuovi francese/i }));
    fireEvent.click(screen.getByRole('button', { name: /^rimuovi inglese/i }));
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Togliere queste lingue?');
    expect(dialog.textContent).toContain('inglese');
    expect(dialog.textContent).toContain('francese');
    expect(
      screen.getByRole('button', { name: 'Togli le lingue' }),
    ).toBeTruthy();
  });

  it('adding a language, or changing the default, asks nothing', async () => {
    vi.mocked(api.updateLocaleSettings).mockResolvedValue({
      ...site,
      defaultLocale: 'en',
    });
    renderSection();

    fireEvent.click(
      screen.getByRole('button', {
        name: /^imposta inglese.* come predefinita/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateLocaleSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ defaultLocale: 'en' }),
      ),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers the two things an untranslated page can do as two options, each with its sentence', () => {
    renderSection();

    const redirect = screen.getByRole('radio', {
      name: 'Porta a un’altra lingua',
    });
    const notAvailable = screen.getByRole('radio', {
      name: 'Mostra “non disponibile”',
    });
    expect(redirect.getAttribute('aria-checked')).toBe('true');
    expect(notAvailable.getAttribute('aria-checked')).toBe('false');
    // Each option carries its own sentence, tied to it.
    expect(
      document.getElementById(
        redirect.getAttribute('aria-describedby') ?? 'none',
      )?.textContent,
    ).toMatch(/prima quella predefinita/);
  });

  it('saves the other option', async () => {
    vi.mocked(api.updateLocaleSettings).mockResolvedValue({
      ...site,
      untranslatedPageFallback: 'not-available',
    });
    renderSection();

    fireEvent.click(
      screen.getByRole('radio', { name: 'Mostra “non disponibile”' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateLocaleSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ untranslatedPageFallback: 'not-available' }),
      ),
    );
  });
});
