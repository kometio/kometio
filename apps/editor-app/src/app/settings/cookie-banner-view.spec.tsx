import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { SiteRecord } from '@kometio/api-contracts';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import {
  buildPageTranslationRecord,
  buildSiteRecord,
} from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import * as pagesApi from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { CookieBannerView } from './cookie-banner-view';

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, updateCookieBannerSettings: vi.fn() };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return { ...actual, listPageGroupTranslations: vi.fn() };
});

// Same mock as admin-shell.spec.tsx: `Link` needs a real router context to
// resolve `useLinkProps`, which this component-only render doesn't provide.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    // The save bar asks before a link throws unsaved work away; nothing is
    // being left here.
    useBlocker: () => ({ status: 'idle' as const }),
  };
});

const site = buildSiteRecord({ enabledLocales: ['it', 'en'] });

function renderView(overrides: Partial<SiteRecord> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <CookieBannerView site={{ ...site, ...overrides }} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('CookieBannerView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, disabled by default', () => {
    renderView();

    expect(screen.getByText('Cookie e privacy')).toBeTruthy();
    expect(screen.queryByText('Posizione')).toBeNull();
  });

  it('reveals the config once the banner is enabled', () => {
    renderView({
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
      },
    });

    expect(screen.getByText('Posizione')).toBeTruthy();
    expect(screen.getByText('Lato del bottone di accettazione')).toBeTruthy();
  });

  it('shows the reopen tab position only when the reopen tab is on', () => {
    renderView({
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
        showReopenTab: false,
      },
    });

    expect(
      screen.queryByText('Posizione della linguetta di riapertura'),
    ).toBeNull();
  });

  it('saves the enabled toggle, round-tripping the rest of the settings unchanged', async () => {
    vi.mocked(api.updateCookieBannerSettings).mockResolvedValue(site);
    renderView();

    fireEvent.click(
      screen.getByRole('switch', { name: /mostra il cookie banner/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateCookieBannerSettings).toHaveBeenCalledWith('site-1', {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
      }),
    );
    expect(await screen.findByText('Salvato')).toBeTruthy();
  });

  it('shows an error message when saving fails', async () => {
    vi.mocked(api.updateCookieBannerSettings).mockRejectedValue(
      new Error('network down'),
    );

    renderView();
    fireEvent.click(
      screen.getByRole('switch', { name: /mostra il cookie banner/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('offers nothing to save until something has changed', () => {
    renderView();

    expect(screen.queryByRole('button', { name: /^salva$/i })).toBeNull();
  });

  it('puts the settings back on Cancel, and hides the config again', async () => {
    renderView();

    fireEvent.click(
      screen.getByRole('switch', { name: /mostra il cookie banner/i }),
    );
    expect(await screen.findByText('Posizione')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    await waitFor(() => expect(screen.queryByText('Posizione')).toBeNull());
    expect(screen.queryByRole('button', { name: /^salva$/i })).toBeNull();
  });

  it('counts a text written for one language as a change, and sends it', async () => {
    vi.mocked(api.updateCookieBannerSettings).mockResolvedValue(site);
    renderView({
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
      },
    });

    // The accordion opens on the language's name, not its code.
    fireEvent.click(screen.getByRole('button', { name: 'italiano' }));
    fireEvent.change(await screen.findByLabelText('Titolo'), {
      target: { value: 'Rispettiamo la tua privacy' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateCookieBannerSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          copyOverrides: expect.objectContaining({
            it: expect.objectContaining({
              title: 'Rispettiamo la tua privacy',
            }),
          }),
        }),
      ),
    );
  });

  it('renders one copy-override section per enabled locale', () => {
    renderView({
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: true,
      },
    });

    expect(screen.getByRole('button', { name: 'italiano' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'inglese' })).toBeTruthy();
  });

  describe('preview', () => {
    const enabled = { ...DEFAULT_COOKIE_BANNER_SETTINGS, enabled: true };

    it('draws the banner with the built-in wording until a text is written', () => {
      renderView({ cookieBannerSettings: enabled });

      const preview = screen.getByRole('img', {
        name: 'Anteprima del banner cookie',
      });
      expect(
        within(preview).getByText('Rispettiamo la tua privacy'),
      ).toBeTruthy();
      expect(within(preview).getByText('Accetta tutti')).toBeTruthy();
    });

    it('opens on the site’s own language, and on the one chosen after that', () => {
      const copy = {
        title: '',
        body: '',
        acceptAll: '',
        rejectAll: '',
        customize: '',
      };
      renderView({
        defaultLocale: 'en',
        cookieBannerSettings: {
          ...enabled,
          copyOverrides: {
            it: { ...copy, title: 'Titolo italiano' },
            en: { ...copy, title: 'English title' },
          },
        },
      });
      const preview = screen.getByRole('img', {
        name: 'Anteprima del banner cookie',
      });
      expect(within(preview).getByText('English title')).toBeTruthy();

      chooseOption(
        screen.getByRole('combobox', { name: 'Lingua dell’anteprima' }),
        'italiano',
      );

      expect(within(preview).getByText('Titolo italiano')).toBeTruthy();
    });

    it('shows a text as it is typed, before anything is saved', async () => {
      renderView({ cookieBannerSettings: enabled });

      fireEvent.click(screen.getByRole('button', { name: 'italiano' }));
      fireEvent.change(await screen.findByLabelText('Titolo'), {
        target: { value: 'Due parole sui cookie' },
      });

      const preview = screen.getByRole('img', {
        name: 'Anteprima del banner cookie',
      });
      expect(within(preview).getByText('Due parole sui cookie')).toBeTruthy();
    });

    it('says there is no way back to the banner when the tab is off', () => {
      renderView({
        cookieBannerSettings: { ...enabled, showReopenTab: false },
      });

      fireEvent.click(screen.getByRole('tab', { name: 'Dopo la scelta' }));

      expect(screen.getByText(/il banner non si può riaprire/i)).toBeTruthy();
    });
  });

  describe('policy pages', () => {
    it('names the page that is chosen, not just that one is', async () => {
      vi.mocked(pagesApi.listPageGroupTranslations).mockResolvedValue([
        buildPageTranslationRecord({
          pageGroupId: 'group-privacy',
          locale: 'it',
          seoMeta: { title: 'Informativa sulla privacy', description: '' },
        }),
      ]);
      renderView({
        cookieBannerSettings: {
          ...DEFAULT_COOKIE_BANNER_SETTINGS,
          enabled: true,
          privacyPolicyPageGroupId: 'group-privacy',
        },
      });

      expect(
        await screen.findByRole('button', {
          name: 'Informativa sulla privacy',
        }),
      ).toBeTruthy();
    });

    it('takes the page away with a written button, and offers to choose again', async () => {
      vi.mocked(pagesApi.listPageGroupTranslations).mockResolvedValue([]);
      renderView({
        cookieBannerSettings: {
          ...DEFAULT_COOKIE_BANNER_SETTINGS,
          enabled: true,
          privacyPolicyPageGroupId: 'group-privacy',
        },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

      expect(screen.queryByRole('button', { name: 'Rimuovi' })).toBeNull();
      expect(
        screen.getAllByRole('button', { name: 'Seleziona una pagina' }).length,
      ).toBe(2);
    });
  });

  // Scripts that ask for consent from a banner that is off never run: said
  // here too, next to the switch that turns it on, without a link to itself.
  it('warns that scripts are waiting for the banner, and says to turn it on below', () => {
    renderView({
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: false,
      },
      themeTrackerScripts: [
        {
          id: 's1',
          label: 'Google Analytics',
          category: 'measurement',
          placement: 'head',
          html: '<script></script>',
        },
      ],
    });

    expect(
      screen.getByText(/1 script aspetta il consenso.*Attivalo qui sotto\./),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Attiva il banner' })).toBeNull();
  });
});
