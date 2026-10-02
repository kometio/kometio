import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/legal-documents-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { LegalDocumentsWizard } from './legal-documents-wizard';
import { TooltipProvider } from '../../components/ui/tooltip';

vi.mock('../../lib/legal-documents-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/legal-documents-api-client')
    >();
  return {
    ...actual,
    previewLegalDocuments: vi.fn(),
    generateLegalDocuments: vi.fn(),
  };
});

// Same mock as cookie-banner-view.spec.tsx: `Link` needs a real router
// context to resolve `useLinkProps`, which this component-only render
// doesn't provide.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

const site = buildSiteRecord({
  name: 'Il mio sito',
  enabledLocales: ['it', 'en'],
  businessAddress: {
    street: 'Via Roma 1',
    postalCode: '20121',
    city: 'Milano',
    country: 'IT',
  },
  businessPhone: '+39 02 1234567',
  businessEmail: 'privacy@example.com',
  themeAllowedTrackerDomains: [
    { label: 'Hotjar', domain: 'static.hotjar.com' },
  ],
  formSubmissionRetentionDays: 90,
  themeTrackerScripts: [
    {
      id: 't1',
      label: 'Google Analytics',
      category: 'measurement',
      placement: 'head',
      html: '',
    },
  ],
});

function renderWizard(forSite: typeof site = site) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <LegalDocumentsWizard siteId="site-1" site={forSite} />
    </QueryClientProvider>,
    { wrapper: TooltipProvider },
  );
}

/** Fills the first three steps as the flow test does, and stops on the review. */
async function walkToReview() {
  renderWizard();

  // Step 1: identity
  fireEvent.change(screen.getByLabelText(/email di contatto privacy/i), {
    target: { value: 'privacy@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

  // Step 2: usage — accept the pre-filled defaults
  await screen.findByText('Google Analytics');
  fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

  // Step 3: documents — all three start ticked; keep the Privacy Policy
  // only, keep both locales
  await screen.findByText('Quali documenti generare');
  fireEvent.click(screen.getByRole('checkbox', { name: /cookie policy/i }));
  fireEvent.click(
    screen.getByRole('checkbox', { name: /termini e condizioni/i }),
  );
  chooseOption(screen.getByLabelText(/giurisdizione competente/i), 'Italia');
  fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
}

/** Fills the first two steps and stops on the third, the one with the documents. */
async function walkToDocuments() {
  renderWizard();
  fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
  await screen.findByText('Google Analytics');
  fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
  await screen.findByText('Quali documenti generare');
}

describe('LegalDocumentsWizard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills identity fields from the site and business info', () => {
    renderWizard();

    expect(screen.getByDisplayValue('Il mio sito')).toBeTruthy();
    expect(screen.getByDisplayValue('example.com')).toBeTruthy();
    // On one line, because a legal document writes it into prose rather
    // than onto an envelope — and in the site's own language.
    expect(
      screen.getByDisplayValue('Via Roma 1, 20121 Milano, Italia'),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('+39 02 1234567')).toBeTruthy();
    // The one identity field it used to ask for from scratch every time.
    expect(screen.getByDisplayValue('privacy@example.com')).toBeTruthy();
  });

  it('blocks moving to the next step when a required field is empty', async () => {
    renderWizard();
    // Emptied by hand: it arrives prefilled from Business info now, and
    // what this checks is the rule for a required field left blank.
    fireEvent.change(screen.getByDisplayValue('privacy@example.com'), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    // Still on step 1 — contactEmail is required and was left blank, so the
    // step-2-only field never renders.
    await waitFor(() => {
      expect(screen.queryByText('Dati raccolti')).toBeNull();
    });
    expect(screen.getByDisplayValue('Il mio sito')).toBeTruthy();
  });

  it('says what is missing on each field, marks them, and puts the focus on the first', async () => {
    renderWizard();
    const email = screen.getByLabelText(/email di contatto privacy/i);
    const domain = screen.getByLabelText(/dominio del sito/i);
    fireEvent.change(email, { target: { value: '' } });
    fireEvent.change(domain, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    const emailMessage = await screen.findByText(
      /scrivi l’email a cui scrivere/i,
    );
    const domainMessage = screen.getByText(/scrivi il dominio del sito/i);
    for (const [field, message] of [
      [email, emailMessage],
      [domain, domainMessage],
    ] as const) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      // Tied to the field, not just drawn under it.
      expect(field.getAttribute('aria-describedby')).toBe(message.id);
    }
    await waitFor(() => expect(document.activeElement).toBe(email));
    // A field that is fine says nothing.
    expect(
      screen.getByLabelText(/ragione sociale/i).getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('says an address without a domain is not an email, and takes it back once it is one', async () => {
    renderWizard();
    const email = screen.getByLabelText(/email di contatto privacy/i);
    fireEvent.change(email, { target: { value: 'privacy@' } });

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    expect(await screen.findByText(/non sembra un’email/i)).toBeTruthy();

    // At the keystroke that makes it right, without leaving the field.
    fireEvent.change(email, { target: { value: 'privacy@example.com' } });
    await waitFor(() =>
      expect(screen.queryByText(/non sembra un’email/i)).toBeNull(),
    );
    expect(email.getAttribute('aria-invalid')).toBeNull();
  });

  it('takes Enter in a field for "next", and never for "generate"', async () => {
    renderWizard();
    // What makes Enter mean "next" in a browser: a form with several text
    // fields and no submit button does nothing when it is pressed. jsdom
    // does not do the implicit submission, so the submit that follows is
    // sent by hand.
    expect(
      screen.getByRole('button', { name: /avanti/i }).getAttribute('type'),
    ).toBe('submit');

    fireEvent.submit(screen.getByLabelText(/ragione sociale/i));

    expect(await screen.findByText('Google Analytics')).toBeTruthy();
    expect(api.generateLegalDocuments).not.toHaveBeenCalled();
  });

  it('asks for a whole number of days, or nothing', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    await screen.findByText('Google Analytics');
    const days = screen.getByLabelText(/conservazione moduli inviati/i);
    fireEvent.change(days, { target: { value: '1.5' } });

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    expect(await screen.findByText(/numero intero di giorni/i)).toBeTruthy();
    expect(screen.queryByText('Quali documenti generare')).toBeNull();
    fireEvent.change(days, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    expect(await screen.findByText('Quali documenti generare')).toBeTruthy();
  });

  it('removes a service with a written button that names the service', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    await screen.findByText('Hotjar');

    const remove = screen.getByRole('button', { name: 'Rimuovi Hotjar' });
    expect(remove.textContent).toBe('Rimuovi');
    fireEvent.click(remove);

    expect(screen.queryByText('Hotjar')).toBeNull();
  });

  it('stops adding services at the most the API takes, and says why', async () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    await screen.findByText('Hotjar');
    const name = screen.getByLabelText(/nome del servizio/i);
    const add = screen.getByRole('button', { name: /aggiungi/i });

    // The two from the site's trackers, then eighteen more: twenty.
    for (let i = 3; i <= 20; i += 1) {
      fireEvent.change(name, { target: { value: `Servizio ${i}` } });
      fireEvent.click(add);
    }
    expect(screen.getByText('Servizio 20')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(name, { target: { value: 'Servizio 21' } });
    fireEvent.click(add);

    expect(await screen.findByText(/al massimo 20 servizi/i)).toBeTruthy();
    expect(screen.queryByText('Servizio 21')).toBeNull();
  });

  it('does not go on with a list longer than the API takes, which the site’s own trackers can make', async () => {
    renderWizard({
      ...site,
      themeTrackerScripts: Array.from({ length: 21 }, (_, i) => ({
        id: `t${i}`,
        label: `Tracker ${i}`,
        category: 'measurement' as const,
        placement: 'head' as const,
        html: '',
      })),
    });
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    await screen.findByText('Tracker 0');

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    expect(await screen.findByText(/al massimo 20 servizi/i)).toBeTruthy();
    expect(screen.queryByText('Quali documenti generare')).toBeNull();
    // Taking enough away clears it, and the step goes on.
    for (const number of [0, 1, 2, 3]) {
      fireEvent.click(
        screen.getByRole('button', { name: `Rimuovi Tracker ${number}` }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));
    expect(await screen.findByText('Quali documenti generare')).toBeTruthy();
  });

  it('has a way back to Cookie e privacy above the form', () => {
    renderWizard();

    const back = screen.getByRole('link', { name: 'Cookie e privacy' });
    expect(back.getAttribute('href')).toBe('/settings/cookies');
  });

  it('starts with the three documents ticked, and the languages by name', async () => {
    await walkToDocuments();

    for (const name of [
      /privacy policy/i,
      /cookie policy/i,
      /termini e condizioni/i,
    ]) {
      expect(
        screen.getByRole('checkbox', { name }).getAttribute('aria-checked'),
      ).toBe('true');
    }
    expect(screen.getByRole('checkbox', { name: 'italiano' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'inglese' })).toBeTruthy();
  });

  it('says what is missing when the documents step is left without a document', async () => {
    await walkToDocuments();
    for (const name of [
      /privacy policy/i,
      /cookie policy/i,
      /termini e condizioni/i,
    ]) {
      fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    chooseOption(screen.getByLabelText(/giurisdizione competente/i), 'Italia');

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    // Still on the step, the reason is on it, and the focus is on the
    // first box of the group it is about.
    expect(await screen.findByText('Scegli almeno un documento.')).toBeTruthy();
    expect(screen.getByText('Quali documenti generare')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('checkbox', { name: /privacy policy/i }),
      ),
    );

    // Ticking one takes the sentence away.
    fireEvent.click(screen.getByRole('checkbox', { name: /privacy policy/i }));
    await waitFor(() =>
      expect(screen.queryByText('Scegli almeno un documento.')).toBeNull(),
    );
  });

  it('asks for a country, and marks the field until one is chosen', async () => {
    await walkToDocuments();
    const country = screen.getByLabelText(/giurisdizione competente/i);

    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    const message = await screen.findByText(
      /scegli il paese la cui legge regola/i,
    );
    expect(country.getAttribute('aria-invalid')).toBe('true');
    expect(country.getAttribute('aria-describedby')).toContain(message.id);
    await waitFor(() => expect(document.activeElement).toBe(country));

    chooseOption(country, 'Italia');
    await waitFor(() =>
      expect(
        screen.queryByText(/scegli il paese la cui legge regola/i),
      ).toBeNull(),
    );
  });

  it('pre-fills third-party services from the tracker list and allowed domains', async () => {
    renderWizard();

    fireEvent.change(screen.getByLabelText(/email di contatto privacy/i), {
      target: { value: 'privacy@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /avanti/i }));

    expect(await screen.findByText('Google Analytics')).toBeTruthy();
    expect(screen.getByText('Hotjar')).toBeTruthy();
    expect(screen.getByDisplayValue('90')).toBeTruthy();
  });

  it('walks the whole flow and creates drafts, linking to each one', async () => {
    vi.mocked(api.previewLegalDocuments).mockResolvedValue({
      documents: [
        {
          kind: 'privacy-policy',
          locales: {
            it: {
              title: 'Privacy Policy',
              sections: [{ heading: 'Titolare', paragraphs: ['Testo.'] }],
            },
          },
        },
      ],
    });
    vi.mocked(api.generateLegalDocuments).mockResolvedValue({
      documents: [
        {
          kind: 'privacy-policy',
          pageGroupId: 'group-1',
          translations: [
            { locale: 'it', translationId: 'tr-1', slug: 'privacy-policy' },
          ],
        },
      ],
    });
    await walkToReview();

    // Step 4: review — preview loads, confirm, generate
    await waitFor(() => {
      expect(api.previewLegalDocuments).toHaveBeenCalledWith('site-1', {
        documents: ['privacy-policy'],
        locales: ['it', 'en'],
        answers: expect.objectContaining({
          contactEmail: 'privacy@example.com',
          jurisdictionCountry: 'IT',
        }),
      });
    });
    expect(
      await screen.findByRole('button', { name: /privacy policy — it/i }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('checkbox', { name: /ho capito che sono bozze/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /genera bozze/i }));

    expect(await screen.findByText(/bozze create/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /apri bozza/i })).toBeTruthy();
    // And the way back to where it started.
    expect(
      screen
        .getByRole('link', { name: 'Cookie e privacy' })
        .getAttribute('href'),
    ).toBe('/settings/cookies');
  });

  it("says the server's own sentence when the documents cannot be generated", async () => {
    vi.mocked(api.previewLegalDocuments).mockResolvedValue({ documents: [] });
    vi.mocked(api.generateLegalDocuments).mockRejectedValue(
      new ApiError(409, { message: 'A page with that address already exists' }),
    );
    await walkToReview();

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: /ho capito che sono bozze/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /genera bozze/i }));

    expect(
      await screen.findByText('A page with that address already exists'),
    ).toBeTruthy();
    // Never the exception as it prints: status and raw body.
    expect(screen.queryByText(/API 409/)).toBeNull();
  });

  it('says a sentence of its own when the preview fails without one from the server', async () => {
    vi.mocked(api.previewLegalDocuments).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );
    await walkToReview();

    expect(
      await screen.findByText(/non è stato possibile generare l'anteprima/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});
