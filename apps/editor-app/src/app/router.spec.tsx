import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { chooseOption } from '../test/select.test-fixture';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router';
import { TooltipProvider } from '../components/ui/tooltip';
import i18n from '../i18n';
import * as accountApi from '../lib/account-api-client';
import * as authApi from '../lib/auth-api-client';
import * as collectionsApi from '../lib/collections-api-client';
import * as previewTokenApi from '../lib/preview-token-api-client';
import * as sectionsListApi from '../lib/reusable-sections-api-client';
import * as dashboardApi from '../lib/dashboard-api-client';
import * as deploymentApi from '../lib/deployment-api-client';
import * as setupApi from '../lib/setup-api-client';
import * as formsApi from '../lib/forms-api-client';
import * as mediaApi from '../lib/media-api-client';
import * as pageGroupsApi from '../lib/page-groups-api-client';
import * as sectionsApi from '../lib/site-layout-sections-api-client';
import * as sitesApi from '../lib/sites-api-client';
import * as usersApi from '../lib/users-api-client';
import { ApiError } from '../lib/http-client';
import type { SiteLayoutSectionRecord } from '../lib/site-layout-sections-api-client';
import {
  buildFormRecord,
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildPageGroupRecord,
  buildPageTranslationRecord,
  buildSiteLayoutSectionRecord,
  buildSiteRecord,
  buildUserRecord,
} from '@kometio/testing/records';
import { routeTree } from '../routeTree.gen';
import { deploymentRecord } from '../test/deployment.test-fixture';
import { createTestQueryClient } from '../test/query-client.test-fixture';
import { ToastProvider } from './shell/toast-provider';

// The login route asks whether this deployment has been set up before it
// will render a form (a fresh install has no account to log into, so it
// sends people to the wizard instead). Every test in this file is about an
// installation that exists.
vi.mock('../lib/setup-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/setup-api-client')>();
  return {
    ...actual,
    fetchSetupStatus: vi.fn(),
    bootstrapDeployment: vi.fn(),
  };
});

// What the server can do: the wizard offers to open an archive only where it can.
vi.mock('../lib/deployment-api-client', () => ({ getDeployment: vi.fn() }));

vi.mock('../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/auth-api-client')>();
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn(),
    verifyEmail: vi.fn(),
    confirmEmailChange: vi.fn(),
    acceptInvite: vi.fn(),
    currentSession: vi.fn(),
  };
});

// Mocked for the same reason as the session above: left real, the shell
// asked the API running on this machine for them, and a 401 landing after
// its test had finished failed whichever test happened to be running.
vi.mock('../lib/collections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/collections-api-client')>();
  return { ...actual, listCollections: vi.fn() };
});

// The canvas the editor test opens asks for these three: a preview token,
// the templates beside the blocks, and the themes a site can use.
vi.mock('../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/preview-token-api-client')>();
  return { ...actual, createTranslationPreviewToken: vi.fn() };
});

vi.mock('../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../lib/reusable-sections-api-client')
    >();
  return { ...actual, listReusableSections: vi.fn() };
});

vi.mock('../lib/account-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/account-api-client')>();
  return {
    ...actual,
    getAccountProfile: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'editor@example.com',
      role: 'admin',
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {},
      avatarUrl: null,
    }),
  };
});

vi.mock('../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroups: vi.fn(),
    getPageGroup: vi.fn(),
    listPageGroupTranslations: vi.fn(),
    createPageGroup: vi.fn(),
    createPageGroupTranslation: vi.fn(),
    deletePageGroup: vi.fn(),
  };
});

vi.mock('../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/media-api-client')>();
  return { ...actual, listMedia: vi.fn(), countMediaByKind: vi.fn() };
});

vi.mock('../lib/dashboard-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/dashboard-api-client')>();
  return { ...actual, getDashboardStats: vi.fn() };
});

vi.mock('../lib/forms-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/forms-api-client')>();
  return {
    ...actual,
    listForms: vi.fn(),
    getForm: vi.fn(),
    listFormSubmissions: vi.fn(),
  };
});

vi.mock('../lib/users-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/users-api-client')>();
  return { ...actual, listUsers: vi.fn() };
});

vi.mock('../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/sites-api-client')>();
  return { ...actual, getCurrentSite: vi.fn(), listAvailableThemes: vi.fn() };
});

vi.mock('../lib/site-layout-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../lib/site-layout-sections-api-client')
    >();
  return { ...actual, getOrCreateSiteLayoutSection: vi.fn() };
});

const sampleSite = buildSiteRecord();

const samplePageGroupListItem = buildPageGroupListItemRecord({
  translations: [
    buildPageGroupListItemTranslation({ title: 'home', status: 'published' }),
  ],
});

const samplePageGroup = buildPageGroupRecord();

const samplePageGroupTranslation = buildPageTranslationRecord({
  status: 'published',
  publishedSnapshot: [],
});

const sampleHeaderSection = buildSiteLayoutSectionRecord();

const sampleFooterSection: SiteLayoutSectionRecord = {
  ...sampleHeaderSection,
  id: 'section-2',
  kind: 'footer',
};

const sampleForm = buildFormRecord({ name: 'Contact form' });

const sampleUser = buildUserRecord({
  email: 'editor@example.com',
  displayName: 'Editor',
  role: 'editor',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
});

/** `route` and every route under it. */
function everyRoute(route: AnyRoute): AnyRoute[] {
  const children: AnyRoute[] = Object.values(route.children ?? {});
  return [route, ...children.flatMap(everyRoute)];
}

function renderApp(initialPath: string) {
  const queryClient = createTestQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('router', () => {
  // Each route's component is its own chunk (autoCodeSplitting), imported
  // the first time something opens that route. Left to the tests, the
  // first one to open the page editor paid for importing the whole canvas
  // inside its one-second `findBy`, and failed whenever the machine was
  // busy. Loaded once here, outside any test's clock.
  beforeAll(async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: createTestQueryClient() },
    });
    await Promise.all(
      everyRoute(routeTree).map((route) => router.loadRouteChunk(route)),
    );
  }, 30_000);

  beforeEach(() => {
    vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(sampleSite);
    vi.mocked(authApi.currentSession).mockResolvedValue({
      userId: 'user-1',
      email: 'admin@example.test',
      role: 'admin',
    });
    vi.mocked(collectionsApi.listCollections).mockResolvedValue([]);
    // The dashboard counts the site's forms; most tests never look at them.
    vi.mocked(formsApi.listForms).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'preview-token',
      expiresAt: new Date().toISOString(),
    });
    vi.mocked(sectionsListApi.listReusableSections).mockResolvedValue([]);
    vi.mocked(sitesApi.listAvailableThemes).mockResolvedValue([]);
    // Reset per test rather than once in the mock factory: the one test
    // that flips it to false would otherwise leave every test after it
    // looking at a wizard instead of a login form.
    vi.mocked(setupApi.fetchSetupStatus).mockResolvedValue({
      hasBeenSetUp: true,
      importFailure: null,
    });
    vi.mocked(deploymentApi.getDeployment).mockResolvedValue(
      deploymentRecord(),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects an unauthenticated visitor from / to /login', async () => {
    vi.mocked(dashboardApi.getDashboardStats).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
  });

  it('sends a visitor to the wizard when nothing has been set up yet', async () => {
    // The state a self-hoster is in seconds after `docker compose up`:
    // there is no account, so the login form would be a door with no key.
    vi.mocked(setupApi.fetchSetupStatus).mockResolvedValue({
      hasBeenSetUp: false,
      importFailure: null,
    });
    vi.mocked(dashboardApi.getDashboardStats).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );

    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Benvenuto in Kometio' }),
    ).toBeTruthy();
  });

  describe('the wizard, on a server that can open a site archive (docs/adr/0106)', () => {
    beforeEach(() => {
      vi.mocked(setupApi.fetchSetupStatus).mockResolvedValue({
        hasBeenSetUp: false,
        importFailure: null,
      });
    });

    it('offers a site from another installation, and only on a server that can open one', async () => {
      vi.mocked(deploymentApi.getDeployment).mockResolvedValue(
        deploymentRecord({ siteArchive: true }),
      );

      renderApp('/setup');

      expect(
        await screen.findByRole('button', {
          name: 'Ho già un sito di un’altra installazione',
        }),
      ).toBeTruthy();
    });

    it('does not offer it where the server cannot', async () => {
      renderApp('/setup');

      await screen.findByRole('heading', { name: 'Benvenuto in Kometio' });
      await waitFor(() =>
        expect(deploymentApi.getDeployment).toHaveBeenCalled(),
      );
      expect(
        screen.queryByRole('button', {
          name: 'Ho già un sito di un’altra installazione',
        }),
      ).toBeNull();
    });

    it('goes to the file and the token, and back to a new site', async () => {
      vi.mocked(deploymentApi.getDeployment).mockResolvedValue(
        deploymentRecord({ siteArchive: true }),
      );
      renderApp('/setup');

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Ho già un sito di un’altra installazione',
        }),
      );
      expect(
        await screen.findByRole('heading', {
          name: 'Apri un sito di un’altra installazione',
        }),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: 'Crea invece un sito nuovo' }),
      );

      expect(
        await screen.findByRole('heading', { name: 'Benvenuto in Kometio' }),
      ).toBeTruthy();
    });
  });

  it('says on the login that the site came from an archive, when the wizard has just opened one', async () => {
    renderApp('/login?imported=true');

    expect(
      await screen.findByText(/Il sito è qui\. Accedi con l’account che avevi/),
    ).toBeTruthy();
  });

  it('says nothing of it on an ordinary login', async () => {
    renderApp('/login');

    await screen.findByRole('heading', { name: 'Accedi' });
    expect(screen.queryByText(/Il sito è qui/)).toBeNull();
  });

  it('sends a visitor away from the wizard once setup has happened', async () => {
    // The other half of the pair: the route stops existing in practice the
    // moment it has done its job, so a bookmarked /setup cannot be used to
    // reopen it.
    renderApp('/setup');

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
  });

  it('renders the pages list inside the shell when authenticated', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [samplePageGroupListItem],
      total: 1,
    });

    renderApp('/pages');

    expect(await screen.findByRole('link', { name: 'Pagine' })).toBeTruthy();
    expect(screen.getByText('home')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
  });

  /*
   * The filters live in the address: a filtered list survives a reload and
   * the back button, and a link to "the drafts" can be sent to someone.
   */
  it('restores the pages list filters from the address, and writes a change back to it', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [samplePageGroupListItem],
      total: 1,
    });

    const { router } = renderApp('/pages?search=chi&status=draft');

    const field = await screen.findByLabelText('Cerca per titolo');
    expect((field as HTMLInputElement).value).toBe('chi');
    // The search text reaches the server, not only the input.
    await waitFor(() =>
      expect(pageGroupsApi.listPageGroups).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ search: 'chi' }),
      ),
    );

    // Open already: a filter is on, and one that is on is never hidden.
    expect(screen.getByLabelText('Stato').textContent).toContain('Bozza');
    chooseOption(screen.getByLabelText('Stato'), 'Pubblicata');

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        search: 'chi',
        status: 'published',
        page: 1,
      }),
    );
  });

  it('renders the media library inside the shell when authenticated', async () => {
    vi.mocked(mediaApi.listMedia).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(mediaApi.countMediaByKind).mockResolvedValue({
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      other: 0,
    });

    renderApp('/media');

    expect(await screen.findByRole('heading', { name: 'Media' })).toBeTruthy();
    // It opens onto the folders, which is the screen the loader had to
    // fetch the counts for.
    expect(screen.getByRole('navigation', { name: 'Cartelle' })).toBeTruthy();
  });

  it('redirects to /login when opening a page group editor while unauthenticated', async () => {
    vi.mocked(pageGroupsApi.getPageGroup).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );

    renderApp('/page-groups/group-1');

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
  });

  /*
   * A page with no language — what a New page refused for its address used
   * to leave behind — opened the editor onto "Something went wrong". It
   * says what it is now (docs/adr/0072).
   */
  it('opens a page with no language onto an explanation instead of crashing', async () => {
    vi.mocked(pageGroupsApi.getPageGroup).mockResolvedValue(samplePageGroup);
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([]);

    renderApp('/page-groups/group-1');

    expect(
      await screen.findByRole('heading', {
        name: 'Questa pagina non ha nessuna lingua',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Torna alle pagine' }),
    ).toBeTruthy();
  });

  /*
   * The saved language is applied by whatever surface the person lands on.
   * The canvas screens are not inside the shell, so a reload of a page in
   * the editor used to open it in English for someone who had chosen
   * Italian (docs/adr/0100). The tests run in Italian: a person who saved
   * English is the one a wrong screen would show.
   */
  describe('a screen outside the shell opens in the language the person saved', () => {
    const savedEnglish = {
      id: 'user-1',
      email: 'editor@example.com',
      role: 'admin' as const,
      displayName: null,
      slug: null,
      bio: {},
      avatarUrl: null,
      language: 'en' as const,
    };

    beforeEach(() => {
      vi.mocked(accountApi.getAccountProfile).mockResolvedValueOnce(
        savedEnglish,
      );
    });

    afterEach(async () => {
      await i18n.changeLanguage('it');
    });

    it('the canvas of a page', async () => {
      vi.mocked(pageGroupsApi.getPageGroup).mockResolvedValue(samplePageGroup);
      vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([
        samplePageGroupTranslation,
      ]);

      renderApp('/page-groups/group-1');

      expect(
        await screen.findByRole('button', { name: 'Publish' }),
      ).toBeTruthy();
    });

    it('a page with no language', async () => {
      vi.mocked(pageGroupsApi.getPageGroup).mockResolvedValue(samplePageGroup);
      vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([]);

      renderApp('/page-groups/group-1');

      expect(
        await screen.findByRole('heading', {
          name: 'This page has no language',
        }),
      ).toBeTruthy();
    });
  });

  it('navigates from the pages list to the editor and back', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [samplePageGroupListItem],
      total: 1,
    });
    vi.mocked(pageGroupsApi.getPageGroup).mockResolvedValue(samplePageGroup);
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([
      samplePageGroupTranslation,
    ]);

    renderApp('/pages');
    // The title of a page is a link that opens it.
    fireEvent.click(await screen.findByRole('link', { name: /home/i }));

    expect(await screen.findByRole('link', { name: /pagine/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /pagine/i }));
    expect(await screen.findByText('home')).toBeTruthy();
  });

  it('renders the reset-password form with the token from the URL', async () => {
    renderApp('/reset-password?resetToken=abc123');

    expect(
      await screen.findByRole('heading', { name: 'Reimposta la password' }),
    ).toBeTruthy();
  });

  it('renders the verify-email view with the token from the URL', async () => {
    vi.mocked(authApi.verifyEmail).mockReturnValue(
      new Promise(() => undefined),
    );

    renderApp('/verify-email?verifyToken=xyz789');

    expect(
      await screen.findByRole('heading', { name: 'Verifica email' }),
    ).toBeTruthy();
    expect(authApi.verifyEmail).toHaveBeenCalledWith('xyz789');
  });

  it('renders the confirm-email-change view with the token from the URL, with no session', async () => {
    vi.mocked(authApi.confirmEmailChange).mockReturnValue(
      new Promise(() => undefined),
    );

    renderApp('/confirm-email-change?changeToken=abc123');

    expect(
      await screen.findByRole('heading', { name: 'Conferma la nuova email' }),
    ).toBeTruthy();
    expect(authApi.confirmEmailChange).toHaveBeenCalledWith('abc123');
  });

  it('logs in and lands on the pages list', async () => {
    vi.mocked(authApi.login).mockResolvedValue(undefined);
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderApp('/login');

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'lele@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^accedi$/i }));

    expect(await screen.findByRole('link', { name: 'Pagine' })).toBeTruthy();
    expect(authApi.login).toHaveBeenCalledWith(
      'lele@example.com',
      'correct-horse',
      'fake-turnstile-token-for-tests',
    );
  });

  it('navigates from Layout to the Header editor and back', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [samplePageGroupListItem],
      total: 1,
    });
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([
      samplePageGroupTranslation,
    ]);
    vi.mocked(sectionsApi.getOrCreateSiteLayoutSection).mockResolvedValue(
      sampleHeaderSection,
    );

    renderApp('/layout');
    expect(
      await screen.findByRole('heading', { name: 'Header e footer' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /modifica header/i }));

    // The editor's own way back, and not the sidebar's "Header e footer"
    // link, which is still there until the editor has replaced the list.
    const back = await screen.findByRole('link', {
      name: '← Header e footer',
    });
    expect(sectionsApi.getOrCreateSiteLayoutSection).toHaveBeenCalledWith(
      expect.any(String),
      'it',
      'header',
    );

    fireEvent.click(back);
    expect(
      await screen.findByRole('heading', { name: 'Header e footer' }),
    ).toBeTruthy();
  });

  it('navigates to the dedicated Stile page from the sidebar', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderApp('/pages');
    expect(await screen.findByRole('heading', { name: 'Pagine' })).toBeTruthy();

    // Awaited: the site's own screens are offered once the role is known.
    fireEvent.click(await screen.findByRole('link', { name: /^stile$/i }));

    expect(
      await screen.findByRole('heading', { name: /stile del sito/i }),
    ).toBeTruthy();
  });

  it('logs out from the shell and returns to /login', async () => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    renderApp('/pages');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Account: Giulia Rossi' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^esci$/i }));

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
    expect(authApi.logout).toHaveBeenCalled();
  });

  it('renders the forms list inside the shell when authenticated', async () => {
    vi.mocked(formsApi.listForms).mockResolvedValue({
      items: [sampleForm],
      total: 1,
    });

    renderApp('/forms');

    expect(await screen.findByRole('heading', { name: 'Moduli' })).toBeTruthy();
    expect(screen.getByText('Contact form')).toBeTruthy();
  });

  it('redirects to /login when opening the forms list while unauthenticated', async () => {
    vi.mocked(formsApi.listForms).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );

    renderApp('/forms');

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
  });

  it('renders the form editor for a given formId when authenticated', async () => {
    vi.mocked(formsApi.getForm).mockResolvedValue(sampleForm);

    renderApp('/forms/form-1');

    expect(await screen.findByLabelText('Nome modulo')).toHaveProperty(
      'value',
      'Contact form',
    );
  });

  /*
   * The form editor holds unsaved work and asks before a link takes it
   * away. Changing the tab, or the page of answers, is not a link that
   * takes it away — the form stays where it is — and the question in front
   * of it was "you will lose your changes" for a click that loses none.
   */
  it('lets the tab change with unsaved work, and asks only when the screen is left', async () => {
    vi.mocked(formsApi.getForm).mockResolvedValue(sampleForm);
    vi.mocked(formsApi.listFormSubmissions).mockResolvedValue({
      items: [],
      total: 0,
      fields: [],
      pages: [],
    });
    const { router } = renderApp('/forms/form-1');
    fireEvent.change(await screen.findByLabelText('Nome modulo'), {
      target: { value: 'Contatti 2' },
    });

    fireEvent.click(screen.getByRole('tab', { name: /risposte/i }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        tab: 'submissions',
      }),
    );
    expect(screen.queryByText('Uscire senza salvare?')).toBeNull();

    // Leaving for another screen is still asked about.
    fireEvent.click(await screen.findByRole('link', { name: /^moduli$/i }));
    expect(await screen.findByText('Uscire senza salvare?')).toBeTruthy();
  });

  it('opens on the answers when the address says so', async () => {
    vi.mocked(formsApi.getForm).mockResolvedValue(sampleForm);
    vi.mocked(formsApi.listFormSubmissions).mockResolvedValue({
      items: [],
      total: 0,
      fields: [],
      pages: [],
    });

    renderApp('/forms/form-1?tab=submissions');

    expect(await screen.findByText(/compariranno qui/i)).toBeTruthy();
    expect(screen.queryByLabelText('Nome modulo')).toBeNull();
  });

  it('redirects to /login when opening a form editor while unauthenticated', async () => {
    vi.mocked(formsApi.getForm).mockRejectedValue(
      new ApiError(401, { message: 'Unauthorized' }),
    );

    renderApp('/forms/form-1');

    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
  });

  it('renders the users list inside the shell when authenticated', async () => {
    vi.mocked(usersApi.listUsers).mockResolvedValue({
      items: [sampleUser],
      total: 1,
    });

    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'Utenti' })).toBeTruthy();
    expect(screen.getByText('editor@example.com')).toBeTruthy();
  });

  describe('the settings area', () => {
    it('opens on its first section, with the menu beside it', async () => {
      const { router } = renderApp('/settings');

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Generali' }),
      ).toBeTruthy();
      expect(router.state.location.pathname).toBe('/settings/general');
      expect(
        screen.getByRole('navigation', { name: 'Sezioni delle impostazioni' }),
      ).toBeTruthy();
    });

    it('opens on the collections for a publisher, the one section that is theirs', async () => {
      vi.mocked(authApi.currentSession).mockResolvedValue({
        userId: 'user-3',
        email: 'publisher@example.test',
        role: 'publisher',
      });

      const { router } = renderApp('/settings');

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Collezioni' }),
      ).toBeTruthy();
      expect(router.state.location.pathname).toBe('/settings/collections');
      // The menu offers what the role may open, and nothing else.
      const menu = screen.getByRole('navigation', {
        name: 'Sezioni delle impostazioni',
      });
      expect(menu.querySelectorAll('a')).toHaveLength(1);
    });

    it("takes a publisher who types an admin's section back to the dashboard", async () => {
      vi.mocked(authApi.currentSession).mockResolvedValue({
        userId: 'user-3',
        email: 'publisher@example.test',
        role: 'publisher',
      });
      vi.mocked(dashboardApi.getDashboardStats).mockResolvedValue({
        pages: { publishedCount: 0, draftCount: 0 },
        media: { count: 0, totalSizeBytes: 0 },
        forms: { totalCount: 0, recentCount: 0, recent: [] },
        recentActivity: [],
      });

      renderApp('/settings/general');

      expect(
        await screen.findByRole('heading', { name: 'Dashboard' }),
      ).toBeTruthy();
    });

    it('takes a publisher who types the address of the legal documents wizard back to the dashboard, like the screen it is opened from', async () => {
      vi.mocked(authApi.currentSession).mockResolvedValue({
        userId: 'user-3',
        email: 'publisher@example.test',
        role: 'publisher',
      });
      vi.mocked(dashboardApi.getDashboardStats).mockResolvedValue({
        pages: { publishedCount: 0, draftCount: 0 },
        media: { count: 0, totalSizeBytes: 0 },
        forms: { totalCount: 0, recentCount: 0, recent: [] },
        recentActivity: [],
      });

      renderApp('/settings/cookies/legal-documents');

      expect(
        await screen.findByRole('heading', { name: 'Dashboard' }),
      ).toBeTruthy();
    });

    // Bookmarks and links somebody sent must keep opening the screen.
    it.each([
      ['/integrations', '/settings/integrations', 'Integrazioni'],
      ['/cookies', '/settings/cookies', 'Cookie e privacy'],
      [
        '/cookies/legal-documents',
        '/settings/cookies/legal-documents',
        'Generatore documenti legali',
      ],
      ['/users', '/settings/users', 'Utenti'],
    ])('keeps %s working, at its new address', async (from, to, heading) => {
      vi.mocked(usersApi.listUsers).mockResolvedValue({
        items: [sampleUser],
        total: 1,
      });

      const { router } = renderApp(from);

      expect(
        await screen.findByRole('heading', { level: 2, name: heading }),
      ).toBeTruthy();
      expect(router.state.location.pathname).toBe(to);
    });

    // What the shell's search starts: the dialog is one parameter away,
    // and the parameter is dropped so a reload does not ask again.
    it('opens the New form dialog from ?new=true, and drops the parameter', async () => {
      vi.mocked(formsApi.listForms).mockResolvedValue({ items: [], total: 0 });

      const { router } = renderApp('/forms?new=true');

      expect(
        await screen.findByRole('dialog', { name: 'Nuovo modulo' }),
      ).toBeTruthy();
      await waitFor(() =>
        expect(router.state.location.search).not.toHaveProperty('new'),
      );
    });

    it('opens the Invite user dialog from ?invite=true, and drops the parameter', async () => {
      vi.mocked(usersApi.listUsers).mockResolvedValue({
        items: [sampleUser],
        total: 1,
      });

      const { router } = renderApp('/settings/users?invite=true');

      expect(
        await screen.findByRole('dialog', { name: 'Invita utente' }),
      ).toBeTruthy();
      await waitFor(() =>
        expect(router.state.location.search).not.toHaveProperty('invite'),
      );
    });

    it('keeps the page of the users list when it redirects', async () => {
      vi.mocked(usersApi.listUsers).mockResolvedValue({
        items: [sampleUser],
        total: 60,
      });

      const { router } = renderApp('/users?page=2');

      await screen.findByRole('heading', { level: 2, name: 'Utenti' });
      expect(router.state.location.pathname).toBe('/settings/users');
      expect(router.state.location.search).toEqual({ page: 2 });
    });
  });

  /*
   * The sidebar does not offer the site's own screens to anybody but an
   * admin; an address typed by hand used to open on the API's refusal as
   * a generic error page. Now it lands on the dashboard before the screen
   * loads anything (docs/roles.md).
   */
  it.each(['/users', '/style', '/integrations', '/cookies', '/taxonomies'])(
    'takes an editor who types %s back to the dashboard',
    async (path) => {
      vi.mocked(authApi.currentSession).mockResolvedValue({
        userId: 'user-2',
        email: 'editor@example.test',
        role: 'editor',
      });
      vi.mocked(dashboardApi.getDashboardStats).mockResolvedValue({
        pages: { publishedCount: 0, draftCount: 0 },
        media: { count: 0, totalSizeBytes: 0 },
        forms: { totalCount: 0, recentCount: 0, recent: [] },
        recentActivity: [],
      });

      renderApp(path);

      expect(
        await screen.findByRole('heading', { name: 'Dashboard' }),
      ).toBeTruthy();
      expect(usersApi.listUsers).not.toHaveBeenCalled();
    },
  );

  it('renders the style settings page on direct navigation when authenticated', async () => {
    renderApp('/style');

    expect(
      await screen.findByRole('heading', { name: /stile del sito/i }),
    ).toBeTruthy();
  });

  it('renders the integrations page on direct navigation when authenticated', async () => {
    renderApp('/integrations');

    expect(
      await screen.findByRole('heading', { name: /integrazioni/i }),
    ).toBeTruthy();
  });

  it('renders the footer editor with the site default locale', async () => {
    // No representative page mocked (listPageGroups resolves undefined via
    // the unconfigured vi.fn()) — this test deliberately exercises the
    // "no page to preview yet" empty state, not the real canvas, so the
    // section label ("Modifica Footer") only needs to show up interpolated
    // into that fallback message.
    vi.mocked(sectionsApi.getOrCreateSiteLayoutSection).mockResolvedValue(
      sampleFooterSection,
    );

    renderApp('/layout/footer');

    expect(await screen.findByText(/Modifica Footer/)).toBeTruthy();
    expect(sectionsApi.getOrCreateSiteLayoutSection).toHaveBeenCalledWith(
      expect.any(String),
      'it',
      'footer',
    );
  });

  it('renders the accept-invite form with the token from the URL', async () => {
    vi.mocked(authApi.acceptInvite).mockResolvedValue(undefined);

    renderApp('/accept-invite?inviteToken=invite-abc');

    expect(
      await screen.findByRole('heading', { name: 'Completa la registrazione' }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Completa la registrazione' }),
    );

    expect(
      await screen.findByText('Password impostata. Puoi accedere ora.'),
    ).toBeTruthy();
    expect(authApi.acceptInvite).toHaveBeenCalledWith(
      'invite-abc',
      'a-new-password',
    );
  });
});
