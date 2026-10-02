import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { SiteRecord } from '@kometio/api-contracts';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import * as themeApi from '../../lib/theme-api-client';
import * as mediaApi from '../../lib/media-api-client';
import { buildMediaRecord } from '@kometio/testing/records';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { StyleView } from './style-view';

// The save bar asks before a link throws unsaved work away, which needs a
// router; nothing is being left here.
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
    updateThemeSettings: vi.fn(),
    listAvailableThemes: vi.fn().mockResolvedValue([
      { name: 'classic', uploaded: false },
      { name: 'docs-showcase', uploaded: false },
    ]),
  };
});

// The upload panel asks whether uploads are on; these tests are about the
// rest, so they are off here (theme-upload-panel.spec.tsx).
vi.mock('../../lib/theme-uploads-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/theme-uploads-api-client')
  >()),
  getThemeUploadSettings: vi.fn().mockResolvedValue({ enabled: false }),
}));

vi.mock('../../lib/media-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/media-api-client')>()),
  listMedia: vi.fn(),
}));

// No resolved defaults in these tests — without a mock the query would make
// a real network fetch, dependent on what is running on the machine.
vi.mock('../../lib/theme-api-client', () => ({
  fetchBlockStyleDefaults: vi.fn().mockResolvedValue({}),
  fetchThemeStyleProperties: vi.fn().mockResolvedValue({}),
  fetchThemeIcons: vi.fn().mockResolvedValue([]),
  fetchThemeForegroundTokens: vi.fn().mockResolvedValue({
    primaryForeground: '#ffffff',
    secondaryForeground: '#000000',
  }),
  fetchThemeCapabilities: vi.fn().mockResolvedValue({
    allowStyleOverrides: true,
  }),
  fetchThemeBaseTokens: vi.fn().mockResolvedValue({}),
}));

const site = buildSiteRecord();

function renderView(overrides: Partial<SiteRecord> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <StyleView site={{ ...site, ...overrides }} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('StyleView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title and current overrides-enabled state', () => {
    renderView();

    expect(screen.getByText('Stile del sito')).toBeTruthy();
    const toggle = screen.getByRole('switch', {
      name: /applica queste impostazioni/i,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('pre-fills the primary color toggle from an existing site value', () => {
    renderView({ themePrimaryColor: '#123456' });

    expect(screen.getByDisplayValue('#123456')).toBeTruthy();
  });

  it('shows a contrast warning when the enabled primary color is too close to the theme foreground', async () => {
    // Mocked theme foreground is #ffffff — a white primary color has zero
    // contrast against it.
    renderView({ themePrimaryColor: '#ffffff' });

    expect(await screen.findByText(/Contrasto basso/)).toBeTruthy();
  });

  it('shows no contrast warning when no color is enabled', () => {
    renderView();

    expect(screen.queryByText(/Contrasto basso/)).toBeNull();
  });

  it('saves theme settings and shows a confirmation', async () => {
    vi.mocked(api.updateThemeSettings).mockResolvedValue({
      ...site,
      themeOverridesEnabled: true,
      themeAllowedTrackerDomains: [],
      formSubmissionRetentionDays: null,
    });

    renderView();
    // Nothing to save until something changes.
    expect(screen.queryByRole('button', { name: /^salva$/i })).toBeNull();
    fireEvent.click(
      screen.getByRole('switch', { name: /applica queste impostazioni/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateThemeSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ overridesEnabled: false }),
      ),
    );
    expect(await screen.findByText('Salvato')).toBeTruthy();
  });

  // The canvas's Global styles did this and this page did not: turned on
  // without a pick, a colour saved a grey the site never showed.
  it("saves the theme's own colour when the override is turned on without picking one", async () => {
    vi.mocked(themeApi.fetchThemeBaseTokens).mockResolvedValueOnce({
      primary: '#5b9bd5',
      secondary: '#151b23',
      fontSansValue: 'Sora, sans-serif',
      radius: '1rem',
    });
    vi.mocked(api.updateThemeSettings).mockResolvedValue(site);

    renderView();
    await screen.findAllByText(/Valore di base del tema attivo/);
    fireEvent.click(
      screen.getByRole('switch', { name: /colore primario.*personalizza/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    await waitFor(() =>
      expect(api.updateThemeSettings).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          primaryColor: '#5b9bd5',
          secondaryColor: null,
        }),
      ),
    );
  });

  it('shows an error message when saving fails', async () => {
    vi.mocked(api.updateThemeSettings).mockRejectedValue(
      new Error('network down'),
    );

    renderView();
    fireEvent.click(
      screen.getByRole('switch', { name: /applica queste impostazioni/i }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('StyleView — the page, section by section', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * The canvas had a second, smaller copy of the colours and the theme in a
   * panel, and the two had started to disagree. This page is the one home,
   * and its parts come in an order somebody can follow.
   */
  it('has its sections in order: theme, colours, typography, width, block styles, icon, advanced', () => {
    renderView();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      'Tema',
      'Colori',
      'Tipografia',
      'Larghezza del contenuto',
      'Stile per blocco',
      'Icona del sito (favicon)',
      'Avanzate',
    ]);
  });

  it('says the switch is off in one sentence, and keeps the long account behind a visible "How it works"', () => {
    renderView();

    expect(
      screen.getByText('Spento: il sito usa solo i valori del tema.'),
    ).toBeTruthy();
    expect(screen.getByText('Come funziona')).toBeTruthy();
  });

  describe('the content width', () => {
    it('refuses a value that is not a length, under the field, and does not save', async () => {
      renderView();

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Larghezza del contenuto' }),
        {
          target: { value: 'banana' },
        },
      );
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      expect(
        await screen.findByText(
          'Serve una misura CSS valida, come 64rem o 1100px.',
        ),
      ).toBeTruthy();
      expect(api.updateThemeSettings).not.toHaveBeenCalled();
    });

    it('takes a length, and sends it', async () => {
      vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
      renderView();

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Larghezza del contenuto' }),
        {
          target: { value: '72rem' },
        },
      );
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateThemeSettings).toHaveBeenCalledWith(
          'site-1',
          expect.objectContaining({ contentWidth: '72rem' }),
        ),
      );
    });

    it('leaves it to the theme when it is empty', async () => {
      vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
      renderView({ themeContentWidth: '60rem' });

      fireEvent.change(
        screen.getByRole('textbox', { name: 'Larghezza del contenuto' }),
        {
          target: { value: '' },
        },
      );
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateThemeSettings).toHaveBeenCalledWith(
          'site-1',
          expect.objectContaining({ contentWidth: null }),
        ),
      );
    });
  });

  describe('the icon', () => {
    it('is chosen from the library, and saved with the rest', async () => {
      vi.mocked(mediaApi.listMedia).mockResolvedValue({
        items: [
          buildMediaRecord({
            filename: 'logo.png',
            url: 'http://localhost/uploads/logo.webp',
          }),
        ],
        total: 1,
      });
      vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
      renderView();

      fireEvent.click(
        screen.getByRole('button', { name: 'Scegli dalla libreria' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'logo.png' }));
      // Shown at once, at the size a tab draws it.
      expect(
        (await screen.findByAltText('Anteprima dell’icona')).getAttribute(
          'src',
        ),
      ).toBe('http://localhost/uploads/logo.webp');
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateThemeSettings).toHaveBeenCalledWith(
          'site-1',
          expect.objectContaining({
            faviconUrl: 'http://localhost/uploads/logo.webp',
          }),
        ),
      );
    });

    it('can be taken away', async () => {
      vi.mocked(api.updateThemeSettings).mockResolvedValue(site);
      renderView({ themeFaviconUrl: 'http://localhost/uploads/old.webp' });

      fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));
      fireEvent.click(await screen.findByRole('button', { name: /^salva$/i }));

      await waitFor(() =>
        expect(api.updateThemeSettings).toHaveBeenCalledWith(
          'site-1',
          expect.objectContaining({ faviconUrl: null }),
        ),
      );
    });
  });

  it('warns, in Advanced, that the CSS applies to every page', () => {
    renderView();

    expect(
      screen.getByText(
        'Si applica a tutte le pagine: un errore può rompere l’aspetto del sito.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('CSS personalizzato')).toBeTruthy();
  });

  // Nothing is saved yet, and the preview already shows it.
  it('draws the preview with the colour the form holds now, saved or not', () => {
    renderView({ themePrimaryColor: '#123456' });

    const button = screen.getByText('Un pulsante');
    expect(button.style.backgroundColor).toBe('rgb(18, 52, 86)');
  });
});

/**
 * A theme may refuse to be dressed at all (docs/adr/0021). This page used
 * to be unable to tell: its own switch said "the active theme can also
 * lock this off entirely — see its own documentation", which is an
 * admission that the editor did not know. Now it does.
 */
describe('StyleView under a theme that refuses styling', () => {
  it('says so, and turns the fields off whatever the site switch says', async () => {
    vi.mocked(themeApi.fetchThemeCapabilities).mockResolvedValue({
      allowStyleOverrides: false,
    });

    const { container } = renderView({ themeOverridesEnabled: true });

    expect(
      await screen.findByText(
        /tema attivo non permette a un sito di stilarlo/i,
      ),
    ).toBeTruthy();
    // `inert` is what actually stops the fields being usable — asserting
    // on the greyed-out class would pass on a page that still accepts
    // input.
    await waitFor(() => {
      expect(container.querySelector('[inert]')).not.toBeNull();
    });
  });

  it('leaves the fields alone when the theme allows it', async () => {
    vi.mocked(themeApi.fetchThemeCapabilities).mockResolvedValue({
      allowStyleOverrides: true,
    });

    const { container } = renderView({ themeOverridesEnabled: true });

    await waitFor(() => {
      expect(container.querySelector('[inert]')).toBeNull();
    });
  });
});
