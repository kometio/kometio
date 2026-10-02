import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { chooseOption, optionNames } from '../../test/select.test-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { ISO_COUNTRY_CODES } from '@kometio/shared-types';
import { TooltipProvider } from '../../components/ui/tooltip';
import * as api from '../../lib/sites-api-client';
import { buildSiteRecord } from '@kometio/testing/records';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ToastProvider } from '../shell/toast-provider';
import { BusinessInfoSection } from './business-info-section';

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
  return { ...actual, updateBusinessInfo: vi.fn() };
});

const sampleSite = buildSiteRecord({
  businessAddress: {
    street: 'Via Roma 1',
    postalCode: '20121',
    city: 'Milano',
    country: 'IT',
  },
  businessPhone: '+39 02 1234567',
  businessType: 'Restaurant',
});

function renderSection(site = sampleSite) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <BusinessInfoSection site={site} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('BusinessInfoSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills the form with the site business info', () => {
    renderSection();

    expect(screen.getByDisplayValue('Via Roma 1')).toBeTruthy();
    expect(screen.getByDisplayValue('20121')).toBeTruthy();
    expect(screen.getByDisplayValue('Milano')).toBeTruthy();
    // The stored `IT` selects the country, shown under the name the
    // platform gives it rather than one from a table of ours.
    expect(screen.getByLabelText('Paese').textContent).toContain('Italia');
    expect(screen.getByDisplayValue('+39 02 1234567')).toBeTruthy();
    // The type is written as what it is; the value stored is the schema.org one.
    expect(screen.getByLabelText('Tipo di attività').textContent).toContain(
      'Ristorante',
    );
  });

  it("offers the countries named in the editor's own language", () => {
    renderSection();

    const country = screen.getByLabelText('Paese');
    const [none, ...names] = optionNames(country);
    expect(none).toBe('— Nessuno —');
    expect(names).toHaveLength(ISO_COUNTRY_CODES.length);
    expect(names).toContain('Italia');
    // Sorted by the name as it reads in this language, not by the code.
    expect(names).toEqual([...names].sort(new Intl.Collator('it').compare));
  });

  it('saves the edited business info', async () => {
    vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);

    renderSection();
    fireEvent.change(screen.getByLabelText('Via e numero'), {
      target: { value: 'Via Milano 2' },
    });
    fireEvent.change(screen.getByLabelText('CAP'), {
      target: { value: '00184' },
    });
    fireEvent.change(screen.getByLabelText('Città'), {
      target: { value: 'Roma' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateBusinessInfo).toHaveBeenCalledWith(
        sampleSite.id,
        expect.objectContaining({
          businessAddress: {
            street: 'Via Milano 2',
            postalCode: '00184',
            city: 'Roma',
            country: 'IT',
          },
        }),
      ),
    );
  });

  it('saves the email, and says so under the field when it is not one', async () => {
    vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);

    renderSection();
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'non-una-email' } });
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    expect(
      await screen.findByText('Questo non sembra un indirizzo email.'),
    ).toBeTruthy();
    expect(api.updateBusinessInfo).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: ' ciao@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateBusinessInfo).toHaveBeenCalledWith(
        sampleSite.id,
        expect.objectContaining({ businessEmail: 'ciao@example.com' }),
      ),
    );
  });

  it('sends null for blank optional fields, not empty strings', async () => {
    vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);

    renderSection();
    // Emptying what was there is a change like any other.
    for (const label of ['Via e numero', 'CAP', 'Città', 'Telefono']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    }
    chooseOption(screen.getByLabelText('Paese'), '— Nessuno —');
    chooseOption(screen.getByLabelText('Tipo di attività'), 'Non indicato');
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateBusinessInfo).toHaveBeenCalledWith(sampleSite.id, {
        businessAddress: null,
        businessPhone: null,
        businessEmail: null,
        businessType: null,
        openingHours: null,
      }),
    );
  });

  describe('the type of business', () => {
    it('lists the kinds of business by name, with "Other" last', () => {
      renderSection();

      const names = optionNames(screen.getByLabelText('Tipo di attività'));

      expect(names[0]).toBe('Non indicato');
      expect(names).toContain('Ristorante');
      expect(names).toContain('Studio legale');
      expect(names.at(-1)).toBe('Altro');
      // Not the schema.org names, which mean nothing to the person choosing.
      expect(names).not.toContain('Restaurant');
    });

    it('saves the schema.org type the choice stands for', async () => {
      vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);
      renderSection();

      chooseOption(screen.getByLabelText('Tipo di attività'), 'Studio legale');
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateBusinessInfo).toHaveBeenCalledWith(
          sampleSite.id,
          expect.objectContaining({ businessType: 'LegalService' }),
        ),
      );
    });

    it('keeps a value saved before this was a list, and shows it as it is', () => {
      renderSection({ ...sampleSite, businessType: 'Spaceship' });

      expect(screen.getByLabelText('Tipo di attività').textContent).toContain(
        'Spaceship (personalizzato)',
      );
    });
  });

  it('does not talk about schema.org in the description', () => {
    renderSection();

    expect(screen.queryByText(/schema\.org/i)).toBeNull();
    expect(
      screen.getByText(
        /serve a google per mostrare indirizzo, orari e contatti/i,
      ),
    ).toBeTruthy();
  });

  it('will not save hours that close when they open, and says which', async () => {
    vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);
    renderSection();

    fireEvent.click(
      screen.getAllByRole('button', { name: /aggiungi fascia/i })[0],
    );
    fireEvent.change(screen.getByLabelText('Chiusura, Lunedì'), {
      target: { value: '09:00' },
    });

    expect(
      await screen.findByText(
        'L’apertura e la chiusura non possono essere alla stessa ora.',
      ),
    ).toBeTruthy();
    const save = await screen.findByRole('button', { name: /^salva$/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Chiusura, Lunedì'), {
      target: { value: '18:00' },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^salva$/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it('saves hours that run past midnight, and says how they are read', async () => {
    vi.mocked(api.updateBusinessInfo).mockResolvedValue(sampleSite);
    renderSection();

    fireEvent.click(
      screen.getAllByRole('button', { name: /aggiungi fascia/i })[0],
    );
    fireEvent.change(screen.getByLabelText('Apertura, Lunedì'), {
      target: { value: '18:00' },
    });
    fireEvent.change(screen.getByLabelText('Chiusura, Lunedì'), {
      target: { value: '02:00' },
    });

    expect(
      await screen.findByText(
        'Chiude dopo la mezzanotte: alle 02:00 del giorno dopo.',
      ),
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateBusinessInfo).toHaveBeenCalledWith(
        sampleSite.id,
        expect.objectContaining({
          openingHours: expect.arrayContaining([
            {
              dayOfWeek: 'monday',
              ranges: [{ opens: '18:00', closes: '02:00' }],
            },
          ]),
        }),
      ),
    );
  });
});
