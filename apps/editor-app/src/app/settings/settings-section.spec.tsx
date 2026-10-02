import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { ApiError } from '../../lib/http-client';
import { TooltipProvider } from '../../components/ui/tooltip';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
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
  return {
    ...actual,
    updateGeneralSettings: vi.fn(),
  };
});

const site = buildSiteRecord({
  name: 'Forno Esempio',
  domain: 'forno.esempio.test',
  formSubmissionRetentionDays: null,
});

function renderInProviders(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>{ui}</ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// What every settings section does through useSiteSettingsForm,
// SettingsSection and SaveBar, seen through the general settings.
describe('a site settings section', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts from the site, with nothing to save and no bar', () => {
    renderInProviders(<GeneralSettingsSection site={site} />);

    expect(screen.getByLabelText('Nome sito')).toHaveProperty(
      'value',
      'Forno Esempio',
    );
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    expect(screen.queryByText('Modifiche non salvate')).toBeNull();
  });

  it('saves what changed, says so, and takes the bar away', async () => {
    vi.mocked(api.updateGeneralSettings).mockResolvedValue(
      buildSiteRecord({ ...site, name: 'Forno Nuovo', domain: null }),
    );

    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: '  Forno Nuovo  ' },
    });
    fireEvent.change(screen.getByLabelText('Dominio'), {
      target: { value: '' },
    });
    expect(await screen.findByText('Modifiche non salvate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    // Taking the domain away is asked about before it is saved.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Togli il dominio' }),
    );

    await waitFor(() =>
      expect(api.updateGeneralSettings).toHaveBeenCalledWith(site.id, {
        name: 'Forno Nuovo',
        domain: null,
      }),
    );
    expect(await screen.findByText('Salvato')).toBeTruthy();
    // What the server kept is what the form shows now, and it is saved.
    expect(screen.getByLabelText('Nome sito')).toHaveProperty(
      'value',
      'Forno Nuovo',
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull(),
    );
  });

  it("keeps the bar and shows the server's own sentence when the save is refused", async () => {
    vi.mocked(api.updateGeneralSettings).mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        message: 'Il dominio è già usato da un altro sito.',
      }),
    );

    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: 'Altro nome' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Il dominio è già usato da un altro sito.',
    );
    // Still something to save, so still the bar.
    expect(screen.getByRole('button', { name: 'Salva' })).toBeTruthy();
    expect(screen.queryByText('Salvato')).toBeNull();
  });

  it('says what was not saved, in words, when the failure has no sentence of its own', async () => {
    vi.mocked(api.updateGeneralSettings).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: 'Altro nome' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le impostazioni generali non sono state salvate. Riprova.',
    );
  });

  // The server says which field is wrong: the sentence goes under it, and
  // nothing is said at the foot of the form as well.
  it('puts what the server says about a field under that field', async () => {
    vi.mocked(api.updateGeneralSettings).mockRejectedValue(
      new ApiError(400, {
        formErrors: [],
        fieldErrors: { domain: ['Invalid hostname'] },
      }),
    );

    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Dominio'), {
      target: { value: 'gia-usato.esempio.test' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cambia dominio' }),
    );

    const error = await screen.findByText('Invalid hostname');
    const domain = screen.getByLabelText('Dominio');
    expect(domain.getAttribute('aria-invalid')).toBe('true');
    expect(domain.getAttribute('aria-describedby')).toContain(
      error.closest('[role="alert"]')?.id ?? 'no-alert',
    );
    // One place, not two.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('puts the saved values back on Cancel, and the last error with them', async () => {
    vi.mocked(api.updateGeneralSettings).mockRejectedValue(
      new ApiError(500, {}),
    );

    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: 'Mai salvato' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salva' }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(screen.getByLabelText('Nome sito')).toHaveProperty(
      'value',
      'Forno Esempio',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    expect(api.updateGeneralSettings).toHaveBeenCalledTimes(1);
  });

  it('cannot be saved while what it holds could not be sent', async () => {
    renderInProviders(<GeneralSettingsSection site={site} />);
    fireEvent.change(screen.getByLabelText('Nome sito'), {
      target: { value: '   ' },
    });

    // The bar stays — there is still something to lose — and waits.
    expect(await screen.findByRole('button', { name: 'Salva' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
