import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { UserRole } from '@kometio/shared-types';
import {
  buildCollectionRecord,
  buildFormRecord,
  buildMediaRecord,
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildSiteRecord,
} from '@kometio/testing/records';
import i18n from '../../i18n';
import * as collectionsApi from '../../lib/collections-api-client';
import * as deploymentApi from '../../lib/deployment-api-client';
import * as formsApi from '../../lib/forms-api-client';
import * as mediaApi from '../../lib/media-api-client';
import * as pagesApi from '../../lib/page-groups-api-client';
import * as sitesApi from '../../lib/sites-api-client';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { sessionAs } from '../../test/current-session.test-fixture';
import { deploymentRecord } from '../../test/deployment.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { GlobalSearch } from './global-search';
import { ToastProvider } from './toast-provider';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ history: { push } }),
}));
vi.mock('../../lib/sites-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sites-api-client')>()),
  getCurrentSite: vi.fn(),
}));
vi.mock('../../lib/deployment-api-client', () => ({ getDeployment: vi.fn() }));
vi.mock('../../lib/collections-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/collections-api-client')
  >()),
  listCollections: vi.fn(),
}));
vi.mock('../../lib/page-groups-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/page-groups-api-client')
  >()),
  listPageGroups: vi.fn(),
}));
vi.mock('../../lib/media-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/media-api-client')>()),
  listMedia: vi.fn(),
}));
vi.mock('../../lib/forms-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/forms-api-client')>()),
  listForms: vi.fn(),
}));

const chiSiamo = buildPageGroupListItemRecord({
  id: 'group-chi-siamo',
  translations: [
    buildPageGroupListItemTranslation({
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
      status: 'published',
    }),
  ],
});

function renderSearch(role: UserRole = 'admin', onOpenChange = vi.fn()) {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs(role));
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <GlobalSearch open onOpenChange={onOpenChange} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return {
    field: screen.getByRole('combobox', { name: 'Cerca nell’editor' }),
    onOpenChange,
  };
}

function optionNames(): string[] {
  return screen
    .queryAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    localStorage.removeItem('kometio-theme');
    document.documentElement.classList.remove('dark');
    vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(
      buildSiteRecord({ defaultLocale: 'it' }),
    );
    vi.mocked(deploymentApi.getDeployment).mockResolvedValue(
      deploymentRecord(),
    );
    vi.mocked(collectionsApi.listCollections).mockResolvedValue([
      buildCollectionRecord({ id: 'news', name: 'Notizie' }),
    ]);
    vi.mocked(pagesApi.listPageGroups).mockResolvedValue({
      items: [chiSiamo],
      total: 1,
    });
    vi.mocked(mediaApi.listMedia).mockResolvedValue({
      items: [buildMediaRecord({ id: 'file-1', filename: 'logo-forno.png' })],
      total: 1,
    });
    vi.mocked(formsApi.listForms).mockResolvedValue({
      items: [
        buildFormRecord({ id: 'form-1', name: 'Contatti' }),
        buildFormRecord({ id: 'form-2', name: 'Prenotazioni' }),
      ],
      total: 2,
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('it');
  });

  it('lists where to go, what to do and what to change, before anything is typed', async () => {
    renderSearch();

    // A section of the settings, and a collection of the site once the
    // server has said which it has.
    expect(await screen.findByRole('option', { name: /SEO/ })).toBeTruthy();
    expect(await screen.findByRole('option', { name: /Notizie/ })).toBeTruthy();
    const names = optionNames();
    expect(names.some((name) => name.startsWith('Dashboard'))).toBe(true);
    expect(names).toContain('Nuova pagina');
    expect(names).toContain('Tema scuro');
    expect(screen.getByText('Vai a')).toBeTruthy();
    expect(screen.getByText('Azioni')).toBeTruthy();
    expect(screen.getByText('Preferenze')).toBeTruthy();
  });

  it('finds SEO among the places to go, and Enter opens it', async () => {
    const { field, onOpenChange } = renderSearch();

    fireEvent.change(field, { target: { value: 'seo' } });
    await screen.findByRole('option', { name: /SEO/ });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/settings/seo');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // The export is the one section that depends on the server and not on the
  // role: the menu and the search read the same list, so they cannot disagree.
  it('offers the export only where the server can make it', async () => {
    renderSearch();
    await screen.findByRole('option', { name: /SEO/ });
    expect(optionNames().some((name) => name.startsWith('Esporta'))).toBe(
      false,
    );
  });

  it('offers the export on a server that says it can', async () => {
    vi.mocked(deploymentApi.getDeployment).mockResolvedValue(
      deploymentRecord({ siteArchive: true }),
    );

    renderSearch();

    expect(await screen.findByRole('option', { name: /Esporta/ })).toBeTruthy();
  });

  it('asks the server for pages once two characters are typed and the typing pauses, and opens one in the canvas', async () => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'c' } });
    // One character is a guess.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pagesApi.listPageGroups).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: 'chi' } });
    const page = await screen.findByRole('option', { name: /Chi siamo/ });

    expect(pagesApi.listPageGroups).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.any(Number),
      expect.objectContaining({ search: 'chi' }),
    );
    // Its address and its state, beside its name.
    expect(page.textContent).toContain('/chi-siamo');
    expect(page.textContent).toContain('Pubblicata');
    fireEvent.click(page);
    expect(push).toHaveBeenCalledWith('/page-groups/group-chi-siamo');
  });

  it('says it is searching while the answer is on its way, not "no results"', async () => {
    vi.mocked(pagesApi.listPageGroups).mockReturnValue(
      new Promise(() => undefined),
    );
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'zzz' } });

    expect(await screen.findByText('Ricerca…')).toBeTruthy();
    expect(screen.queryByText(/Nessun risultato/)).toBeNull();
  });

  it('finds a file by name and opens the library narrowed to it', async () => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'logo' } });
    fireEvent.click(await screen.findByRole('option', { name: /logo-forno/ }));

    expect(mediaApi.listMedia).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.any(Number),
      expect.objectContaining({ search: 'logo' }),
    );
    expect(push).toHaveBeenCalledWith('/media?page=1&search=logo-forno.png');
  });

  it('filters the forms by name here, and opens the one chosen', async () => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'conta' } });
    fireEvent.click(await screen.findByRole('option', { name: /Contatti/ }));

    expect(screen.queryByRole('option', { name: /Prenotazioni/ })).toBeNull();
    expect(push).toHaveBeenCalledWith('/forms/form-1');
  });

  it('changes the theme from a preference', async () => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'scuro' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Tema scuro' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('kometio-theme')).toBe('dark');
  });

  it('changes the language of the editor from a preference, and offers only the other one', async () => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'lingua' } });
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    fireEvent.click(options[0] as HTMLElement);

    await waitFor(() => expect(i18n.language).toBe('en'));
  });

  it.each([
    ['nuova pagina', 'Nuova pagina', '/pages?page=1&new=true'],
    ['carica', 'Carica un file', '/media'],
    ['nuovo modulo', 'Nuovo modulo', '/forms?page=1&new=true'],
    ['invita', 'Invita utente', '/settings/users?page=1&invite=true'],
  ])('starts "%s" where its dialog opens', async (typed, name, path) => {
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: typed } });
    fireEvent.click(await screen.findByRole('option', { name }));

    expect(push).toHaveBeenCalledWith(path);
  });

  it('opens the public site in another tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { field } = renderSearch();

    fireEvent.change(field, { target: { value: 'apri il sito' } });
    fireEvent.click(
      await screen.findByRole('option', { name: 'Apri il sito' }),
    );

    expect(open).toHaveBeenCalledWith(
      PUBLIC_SITE_URL,
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('does not offer a role what it may not do', async () => {
    const { field } = renderSearch('editor');

    fireEvent.change(field, { target: { value: 'ut' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // No Users, no Invite, no Style: an editor may open none of them.
    expect(screen.queryByRole('option', { name: /Utenti/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /Invita/ })).toBeNull();
    fireEvent.change(field, { target: { value: 'stile' } });
    expect(screen.queryByRole('option', { name: /Stile/ })).toBeNull();
    fireEvent.change(field, { target: { value: 'nuovo modulo' } });
    expect(screen.queryByRole('option', { name: /Nuovo modulo/ })).toBeNull();
  });

  it('offers an admin Users and Invite', async () => {
    const { field } = renderSearch('admin');

    fireEvent.change(field, { target: { value: 'utent' } });

    expect(await screen.findByRole('option', { name: /Utenti/ })).toBeTruthy();
    fireEvent.change(field, { target: { value: 'invita' } });
    expect(
      await screen.findByRole('option', { name: 'Invita utente' }),
    ).toBeTruthy();
  });

  it('asks the server for nothing while it is closed', async () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <GlobalSearch open={false} onOpenChange={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sitesApi.getCurrentSite).not.toHaveBeenCalled();
    expect(pagesApi.listPageGroups).not.toHaveBeenCalled();
    expect(mediaApi.listMedia).not.toHaveBeenCalled();
  });
});
