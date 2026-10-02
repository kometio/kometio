import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { SiteRecord } from '@kometio/api-contracts';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { IntegrationsView } from './integrations-view';

// The save bar asks before a link throws unsaved work away, which needs a
// router; nothing is being left here.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useBlocker: () => ({ status: 'idle' as const }),
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateThemeSettings: vi.fn() };
});

const site = buildSiteRecord({ themePrimaryColor: '#18181b' });

function renderView(overrides: Partial<SiteRecord> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <IntegrationsView site={{ ...site, ...overrides }} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('IntegrationsView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and pre-fills existing head/body scripts', () => {
    renderView({
      themeHeadScript: '<script>head</script>',
      themeBodyScript: '<script>body</script>',
    });

    expect(screen.getByText('Integrazioni')).toBeTruthy();
    expect(screen.getByDisplayValue('<script>head</script>')).toBeTruthy();
    expect(screen.getByDisplayValue('<script>body</script>')).toBeTruthy();
  });

  it('pre-fills existing tracker domains', () => {
    renderView({
      themeAllowedTrackerDomains: [
        { label: 'Hotjar', domain: 'static.hotjar.com' },
      ],
    });

    expect(screen.getByText('Hotjar')).toBeTruthy();
    expect(screen.getByText('static.hotjar.com')).toBeTruthy();
  });

  it('adds a tracker domain and saves it, round-tripping the fields this page does not own', async () => {
    vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
    renderView();

    fireEvent.change(screen.getByLabelText('Nome del servizio'), {
      target: { value: 'Hotjar' },
    });
    fireEvent.change(screen.getByLabelText('Dominio'), {
      target: { value: 'static.hotjar.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /aggiungi dominio/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateThemeSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          primaryColor: '#18181b',
          allowedTrackerDomains: [
            { label: 'Hotjar', domain: 'static.hotjar.com' },
          ],
        }),
      ),
    );
    expect(await screen.findByText('Salvato')).toBeTruthy();
  });

  it('rejects a domain with a scheme or path instead of silently accepting it', () => {
    renderView();

    fireEvent.change(screen.getByLabelText('Nome del servizio'), {
      target: { value: 'Bad' },
    });
    fireEvent.change(screen.getByLabelText('Dominio'), {
      target: { value: 'https://static.hotjar.com/x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /aggiungi dominio/i }));

    const error = screen.getByRole('alert');
    const domain = screen.getByLabelText('Dominio');
    expect(domain.getAttribute('aria-invalid')).toBe('true');
    expect(domain.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.queryByText('Bad')).toBeNull();
  });

  it('removes a tracker domain', () => {
    renderView({
      themeAllowedTrackerDomains: [
        { label: 'Hotjar', domain: 'static.hotjar.com' },
      ],
    });

    fireEvent.click(
      screen.getByRole('button', { name: /rimuovi il dominio “Hotjar”/i }),
    );

    expect(screen.queryByText('Hotjar')).toBeNull();
  });

  it('shows an error message when saving fails', async () => {
    vi.mocked(api.updateThemeSettings).mockRejectedValue(
      new Error('network down'),
    );

    renderView();
    fireEvent.change(screen.getByLabelText('Codice in cima a ogni pagina'), {
      target: { value: '<script>x</script>' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('offers nothing to save until something has changed', () => {
    renderView();

    expect(screen.queryByRole('button', { name: /^salva$/i })).toBeNull();
  });

  // The icon that removes a row sits inside the form: it must remove the
  // row, and not save the form on its way.
  it('removes a domain without saving the form', () => {
    renderView({
      themeAllowedTrackerDomains: [
        { label: 'Hotjar', domain: 'static.hotjar.com' },
      ],
    });

    fireEvent.click(
      screen.getByRole('button', { name: /rimuovi il dominio “Hotjar”/i }),
    );

    expect(api.updateThemeSettings).not.toHaveBeenCalled();
  });

  it('takes what the server kept, not what was sent, as the saved state', async () => {
    // A known vendor pasted into the head is recognised on the way in and
    // leaves the field: the form must not keep showing it.
    vi.mocked(api.updateThemeSettings).mockResolvedValue(
      buildSiteRecord({ themeHeadScript: null }),
    );
    renderView();

    const head = screen.getByLabelText('Codice in cima a ogni pagina');
    fireEvent.change(head, { target: { value: '<script>known</script>' } });
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() => expect(head).toHaveProperty('value', ''));
  });
});

const consentScript = {
  id: 'ga',
  label: 'Google Analytics',
  category: 'measurement' as const,
  placement: 'head' as const,
  html: '<script>ga()</script>',
};

describe('IntegrationsView — what each field is for', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // "Custom script — <head>" told nobody what to put in it. Each field
  // has a name in words a person who does not write HTML understands, and
  // one line on what it is for.
  it('names each code field for what it does, with an example of what goes in it', () => {
    renderView();

    expect(screen.getByLabelText('Codice in cima a ogni pagina')).toBeTruthy();
    expect(
      screen.getByText(
        'Per esempio la verifica di Google Search Console. Va nel <head>.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Codice in fondo a ogni pagina')).toBeTruthy();
    expect(
      screen.getByText(
        'Per esempio un widget di chat. Va prima della chiusura del <body>.',
      ),
    ).toBeTruthy();
    // The warning stays under the two code fields.
    expect(
      screen.getByText(/Incolla solo codice da fonti di cui ti fidi/),
    ).toBeTruthy();
  });

  it('says what the two lists are for, under their own headings', () => {
    renderView();

    expect(
      screen.getByRole('heading', {
        name: 'Servizi a cui i tuoi script si collegano',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/aggiungilo qui, altrimenti il browser lo blocca/),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Script che chiedono il consenso' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Partono solo dopo che il visitatore ha accettato/),
    ).toBeTruthy();
  });

  // Saving already recognises the known services in what was pasted, so a
  // button to "detect again" that saved everything was the same button as
  // Save with another name.
  it('has no "Detect again", which was Save under another name', () => {
    renderView();

    expect(
      screen.queryByRole('button', { name: /rileva di nuovo/i }),
    ).toBeNull();
  });

  describe('the scripts that ask for consent', () => {
    it('shows each with its category and where it goes, and lets its code be opened and corrected', async () => {
      vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
      renderView({ themeTrackerScripts: [consentScript] });

      expect(screen.getByText('Google Analytics')).toBeTruthy();
      const edit = screen.getByRole('button', {
        name: 'Modifica il codice di “Google Analytics”',
      });
      expect(edit.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(edit);
      expect(edit.getAttribute('aria-expanded')).toBe('true');

      const code = screen.getByLabelText('Codice di Google Analytics');
      expect((code as HTMLTextAreaElement).value).toBe('<script>ga()</script>');
      fireEvent.change(code, { target: { value: '<script>ga2()</script>' } });
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateThemeSettings).toHaveBeenCalledWith(
          'site-1',
          expect.objectContaining({
            trackerScripts: [
              { ...consentScript, html: '<script>ga2()</script>' },
            ],
          }),
        ),
      );
    });

    it('deletes one by a button that says so and names it, without saving the form', () => {
      renderView({ themeTrackerScripts: [consentScript] });

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Elimina lo script “Google Analytics”',
        }),
      );

      expect(screen.queryByText('Google Analytics')).toBeNull();
      expect(api.updateThemeSettings).not.toHaveBeenCalled();
    });
  });

  describe('scripts waiting for a banner that is off', () => {
    const bannerOff = {
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: false,
      },
    };

    it('says so first, above every field, with the way to turn the banner on', () => {
      renderView({ ...bannerOff, themeTrackerScripts: [consentScript] });

      expect(
        screen.getByText(
          /1 script aspetta il consenso, ma il banner cookie è spento: non partirà mai\./,
        ),
      ).toBeTruthy();
      expect(
        screen
          .getByRole('link', { name: 'Attiva il banner' })
          .getAttribute('href'),
      ).toBe('/settings/cookies');
    });

    it('counts them, and says "will never run" in the plural', () => {
      renderView({
        ...bannerOff,
        themeTrackerScripts: [consentScript, { ...consentScript, id: 'fb' }],
      });

      expect(screen.getByText(/2 script aspettano il consenso/)).toBeTruthy();
    });

    it('is silent when the banner is on', () => {
      renderView({
        cookieBannerSettings: {
          ...DEFAULT_COOKIE_BANNER_SETTINGS,
          enabled: true,
        },
        themeTrackerScripts: [consentScript],
      });

      expect(screen.queryByText(/aspett(a|ano) il consenso/)).toBeNull();
    });

    // Necessary scripts are not gated by consent: nothing waits for them.
    it('is silent for a script that needs no consent', () => {
      renderView({
        ...bannerOff,
        themeTrackerScripts: [{ ...consentScript, category: 'necessary' }],
      });

      expect(screen.queryByText(/aspett(a|ano) il consenso/)).toBeNull();
    });
  });
});
