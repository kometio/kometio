import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { GeneralSettingsSection } from './general-settings-section';

// The save bar asks before an in-app link throws work away, which needs a
// router; here nothing is being left.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateGeneralSettings: vi.fn() };
});

const site = buildSiteRecord({ name: 'Il mio sito', domain: 'www.vecchio.it' });

function renderSection(overrides = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <GeneralSettingsSection site={{ ...site, ...overrides }} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const domain = () => screen.getByLabelText('Dominio') as HTMLInputElement;

describe('GeneralSettingsSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('takes the scheme and the path out of an address pasted into the domain, and says so', () => {
    renderSection();

    fireEvent.change(domain(), {
      target: { value: 'HTTPS://www.Nuovo.it/chi-siamo' },
    });

    expect(domain().value).toBe('www.nuovo.it');
    expect(
      screen.getByText(
        'Ho tolto “https://”, “/chi-siamo”: qui serve solo il dominio.',
      ),
    ).toBeTruthy();
  });

  it('says a domain is not one once the field is left, and sends nothing', async () => {
    renderSection();

    fireEvent.change(domain(), { target: { value: 'non un dominio' } });
    fireEvent.blur(domain());

    const message = await screen.findByText(/non sembra un dominio/i);
    expect(domain().getAttribute('aria-invalid')).toBe('true');
    expect(domain().getAttribute('aria-describedby')).toContain(message.id);
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));
    await waitFor(() =>
      expect(api.updateGeneralSettings).not.toHaveBeenCalled(),
    );
  });

  it('does not judge a domain while it is still being typed', () => {
    renderSection();

    fireEvent.change(domain(), { target: { value: 'www.' } });

    expect(screen.queryByText(/non sembra un dominio/i)).toBeNull();
  });

  it('asks before moving the site to another domain, and says what stops working', async () => {
    vi.mocked(api.updateGeneralSettings).mockResolvedValue({
      ...site,
      domain: 'www.nuovo.it',
    });
    renderSection();

    fireEvent.change(domain(), { target: { value: 'www.nuovo.it' } });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('solo su www.nuovo.it');
    expect(dialog.textContent).toContain(
      'www.vecchio.it, smetterà di funzionare',
    );
    expect(api.updateGeneralSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cambia dominio' }));

    await waitFor(() =>
      expect(api.updateGeneralSettings).toHaveBeenCalledWith('site-1', {
        name: 'Il mio sito',
        domain: 'www.nuovo.it',
      }),
    );
    expect(await screen.findByText('Salvato')).toBeTruthy();
  });

  it('leaves everything as it was when the question is answered No', async () => {
    renderSection();

    fireEvent.change(domain(), { target: { value: 'www.nuovo.it' } });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.updateGeneralSettings).not.toHaveBeenCalled();
    // Still there to be changed, or saved, or put back.
    expect(domain().value).toBe('www.nuovo.it');
  });

  it('asks a different question when the domain is taken away', async () => {
    renderSection();

    fireEvent.change(domain(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Togliere il dominio?');
    expect(dialog.textContent).toContain('www.vecchio.it');
  });

  it('saves a change of name at once, with no question', async () => {
    vi.mocked(api.updateGeneralSettings).mockResolvedValue({
      ...site,
      name: 'Nuovo nome',
    });
    renderSection();

    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: 'Nuovo nome' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateGeneralSettings).toHaveBeenCalledWith('site-1', {
        name: 'Nuovo nome',
        domain: 'www.vecchio.it',
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
