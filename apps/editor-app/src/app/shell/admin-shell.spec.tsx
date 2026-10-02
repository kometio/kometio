import type { ReactNode } from 'react';
import type { UserRole } from '@kometio/shared-types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import {
  buildCollectionRecord,
  buildSiteRecord,
} from '@kometio/testing/records';
import { TooltipProvider } from '../../components/ui/tooltip';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import * as auth from '../../lib/auth-api-client';
import * as collectionsApi from '../../lib/collections-api-client';
import * as sitesApi from '../../lib/sites-api-client';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { AdminShell } from './admin-shell';
import { ToastProvider } from './toast-provider';

interface FakeMatch {
  staticData: { titleKey?: string };
}

const routeMatches = vi.hoisted(() => {
  const matches: { current: FakeMatch[] } = { current: [] };
  return matches;
});

vi.mock('../../lib/collections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/collections-api-client')>();
  return { ...actual, listCollections: vi.fn().mockResolvedValue([]) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return {
    ...actual,
    getCurrentSite: vi.fn().mockResolvedValue({
      id: 'site-1',
      name: 'Forno Esempio',
      domain: 'forno.esempio.test',
      defaultLocale: 'it',
      enabledLocales: ['it'],
    }),
  };
});

vi.mock('../../lib/account-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/account-api-client')>();
  return {
    ...actual,
    getAccountProfile: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'chi@esempio.it',
      role: 'editor',
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {},
      avatarUrl: null,
      language: null,
    }),
  };
});

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, currentSession: vi.fn() };
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    // Mimics the real Link closely enough for the active-item test below:
    // the router marks the current link with `data-status="active"` and
    // CONCATENATES `activeProps.className` onto `className`. Pages stands
    // in for "the screen you are on".
    Link: ({
      children,
      to,
      params,
      className,
      activeProps,
      'aria-label': ariaLabel,
      title,
    }: {
      children: ReactNode;
      to: string;
      params?: Record<string, string>;
      className?: string;
      activeProps?: { className?: string };
      'aria-label'?: string;
      title?: string;
    }) => {
      const isActive = to === '/pages';
      return (
        <a
          href={to}
          aria-label={ariaLabel}
          title={title}
          data-collection-id={params?.collectionId}
          data-status={isActive ? 'active' : undefined}
          className={
            isActive && activeProps?.className
              ? `${className ?? ''} ${activeProps.className}`
              : className
          }
        >
          {children}
        </a>
      );
    },
    useNavigate: vi.fn(),
    useRouter: () => ({ history: { push: vi.fn() } }),
    // The narrow bar names the screen from the route: the matches a test
    // sets, or none.
    useMatches: ({
      select,
    }: {
      select: (matches: typeof routeMatches.current) => unknown;
    }) => select(routeMatches.current),
  };
});

function renderShell(role: UserRole = 'admin') {
  vi.mocked(auth.currentSession).mockResolvedValue({
    userId: 'user-1',
    email: 'chi@esempio.it',
    role,
  });
  return render(
    // The app mounts the tooltip provider at its root (main.tsx); the
    // narrow bar's menu button is an IconButton, which needs it.
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <AdminShell>
            <p>content</p>
          </AdminShell>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('AdminShell', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * The sidebar used to offer every screen to everybody and let the API
   * say no after the click: an Editor saw Utenti, opened it, and got a
   * generic error page. The server refusing is right; the sidebar
   * pretending the door is open is not.
   */
  it.each(['publisher', 'editor'] as const)(
    "does not offer the site's own settings to a %s",
    async (role) => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

      renderShell(role);

      // The rest of the sidebar is there, so this is about these entries
      // and not about the shell failing to render at all.
      expect(await screen.findByRole('link', { name: 'Pagine' })).toBeTruthy();
      for (const name of ['Utenti', 'Stile', 'Integrazioni', 'Cookie banner']) {
        expect(screen.queryByRole('link', { name })).toBeNull();
      }
    },
  );

  // Classification changes show online at once (docs/roles.md): a
  // publisher's screen, which an editor is not offered.
  it('offers Categorie to a publisher and not to an editor', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    const { unmount } = renderShell('publisher');
    expect(await screen.findByRole('link', { name: 'Categorie' })).toBeTruthy();
    unmount();

    renderShell('editor');
    expect(await screen.findByRole('link', { name: 'Pagine' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Categorie' })).toBeNull();
  });

  /*
   * The user's own line: pages and news must not be mixed, even though
   * underneath they are the same thing. A section is a menu entry.
   */
  it('gives every section of the site an entry of its own, under Pagine', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(collectionsApi.listCollections).mockResolvedValue([
      buildCollectionRecord({ name: 'News' }),
    ]);

    renderShell('admin');

    const entry = await screen.findByRole('link', { name: 'News' });
    expect(entry.getAttribute('href')).toBe('/collections/$collectionId');
  });

  /*
   * Integrations, Cookies and Users are sections of the settings area now,
   * one level down; the sidebar holds a single entry for all of them.
   */
  it.each(['admin', 'publisher'] as const)(
    'offers the settings area to a %s, who has something to set there',
    async (role) => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

      renderShell(role);

      expect(
        (
          await screen.findByRole('link', { name: 'Impostazioni' })
        ).getAttribute('href'),
      ).toBe('/settings');
    },
  );

  it('does not offer the settings area to an editor, who has nothing to set there', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell('editor');

    expect(await screen.findByRole('link', { name: 'Pagine' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Impostazioni' })).toBeNull();
  });

  /*
   * While the role is still unknown — loading, or the request failed —
   * the admin-only entries stay hidden. Guessing generously would put
   * back exactly what this hides.
   */
  it('hides the settings area until it knows who is asking', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(auth.currentSession).mockReturnValue(
      new Promise(() => undefined),
    );

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <TooltipProvider>
          <ToastProvider>
            <AdminShell>
              <p>content</p>
            </AdminShell>
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('link', { name: 'Impostazioni' })).toBeNull();
  });

  it('renders links to Pagine, Media, Header e footer, Stile and Impostazioni, and an Account menu', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();

    expect(
      screen.getByRole('link', { name: 'Pagine' }).getAttribute('href'),
    ).toBe('/pages');
    expect(
      screen.getByRole('link', { name: 'Media' }).getAttribute('href'),
    ).toBe('/media');
    expect(
      screen
        .getByRole('link', { name: 'Header e footer' })
        .getAttribute('href'),
    ).toBe('/layout');
    expect(
      (await screen.findByRole('link', { name: 'Stile' })).getAttribute('href'),
    ).toBe('/style');
    // Awaited, not synchronous: this entry now waits to know the role.
    expect(
      (await screen.findByRole('link', { name: 'Impostazioni' })).getAttribute(
        'href',
      ),
    ).toBe('/settings');
    expect(screen.getByText('content')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Account: Giulia Rossi' }),
    ).toBeTruthy();
  });

  it('keeps the language and theme in the account menu, and nowhere else in the sidebar', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: /^account:/i }));

    expect(
      await screen.findByLabelText("Lingua dell'interfaccia"),
    ).toBeTruthy();
    // Three choices rather than a dark on/off switch: "follow the system"
    // is the default now, and a two-position toggle cannot say it.
    expect(screen.getByRole('radiogroup', { name: /tema/i })).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: /come il sistema/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^esci$/i })).toBeTruthy();
  });

  /*
   * The active entry said where you were with its background alone. Its
   * colour came in as `activeProps.className`, which the router appends to
   * `className` — so `text-muted-foreground` and `text-foreground` sat in
   * one attribute, where being written second wins nothing, and the
   * computed colour of the current screen's entry was the muted one, the
   * same as every other entry's.
   */
  /*
   * Twelve flat entries plus a menu with six more, and no readable
   * criterion between them: Style, Integrations and Cookie banner are
   * settings and lived in the sidebar, while Languages and Business info
   * are settings and lived in the menu.
   */
  it('groups the sidebar by what an entry is about', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();
    // The last group waits to know the role.
    await screen.findByRole('link', { name: 'Impostazioni' });

    const groups = screen.getAllByRole('heading', { level: 2 });
    expect(groups.map((heading) => heading.textContent)).toEqual([
      'Contenuti',
      'Aspetto',
    ]);
  });

  describe('the site it is open on', () => {
    it('names the site, its domain, and a way to go and look at it', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

      renderShell();

      expect(await screen.findByText('Forno Esempio')).toBeTruthy();
      expect(screen.getByText('forno.esempio.test')).toBeTruthy();
      const open = screen.getByRole('link', {
        name: 'Apri il sito: Forno Esempio',
      });
      expect(open.getAttribute('href')).toBe(PUBLIC_SITE_URL);
      expect(open.getAttribute('target')).toBe('_blank');
      expect(open.getAttribute('rel')).toContain('noopener');
    });

    it('says the domain is still to be set, instead of leaving it blank', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(
        buildSiteRecord({ name: 'Forno Esempio', domain: null }),
      );

      renderShell();

      expect(await screen.findByText('Dominio da impostare')).toBeTruthy();
    });
  });

  // What is set up once is not what is worked on every day: Settings is
  // one entry, at the foot, after everything that is.
  it('puts Impostazioni last, after the daily work', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();
    const settings = await screen.findByRole('link', { name: 'Impostazioni' });
    const style = await screen.findByRole('link', { name: 'Stile' });

    expect(
      style.compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('names the screen in the narrow bar, from the route that is open', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    routeMatches.current = [
      { staticData: {} },
      { staticData: { titleKey: 'shell.nav.settings' } },
      { staticData: {} },
    ];

    renderShell();

    // Beside the mark, in the bar that only shows on a phone.
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('Impostazioni')).toBeTruthy();
    routeMatches.current = [];
  });

  describe('folded to the strip', () => {
    beforeEach(() => {
      localStorage.removeItem('kometio-sidebar-collapsed');
    });

    /** The links and buttons of the sidebar — the strip is the same `nav`, drawn narrower. */
    function sidebar() {
      return within(
        screen.getByRole('navigation', { name: 'Navigazione principale' }),
      );
    }

    async function fold() {
      fireEvent.click(await screen.findByRole('button', { name: 'Comprimi' }));
    }

    it('is 72px wide, the same as the strip down the canvas, and says so with a button that unfolds it', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      await fold();

      const nav = screen.getByRole('navigation', {
        name: 'Navigazione principale',
      });
      expect(nav.className).toContain('w-18');
      expect(sidebar().getByRole('button', { name: 'Espandi' })).toBeTruthy();
      expect(sidebar().queryByRole('button', { name: 'Comprimi' })).toBeNull();
    });

    // The rule of the canvas's strip: never a picture alone.
    it('writes a word under every picture, whatever the picture is', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      await screen.findByRole('link', { name: 'Impostazioni' });
      await fold();

      const items = [
        ...sidebar().getAllByRole('link'),
        ...sidebar().getAllByRole('button'),
      ];
      expect(items.length).toBeGreaterThan(8);
      for (const item of items) {
        expect(
          item.textContent?.trim(),
          `${item.getAttribute('aria-label') ?? item.outerHTML.slice(0, 80)} has no word`,
        ).not.toBe('');
      }
    });

    it('goes to the same places, in the same order, as the whole sidebar', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(collectionsApi.listCollections).mockResolvedValue([
        buildCollectionRecord({ id: 'c1', name: 'News' }),
      ]);
      renderShell();
      // Everything the sidebar draws has arrived, so nothing is still to
      // come in when it is folded.
      await screen.findByRole('link', { name: 'Impostazioni' });
      await screen.findByRole('link', { name: 'News' });
      const hrefs = () =>
        sidebar()
          .getAllByRole('link')
          .map((link) => link.getAttribute('href'))
          .filter((href) => href?.startsWith('/'));
      const whole = hrefs();

      await fold();

      expect(hrefs()).toEqual(whole);
    });

    it('shortens the name that does not fit 68px, and keeps it whole for a screen reader', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      await screen.findByRole('link', { name: 'Impostazioni' });
      await fold();

      const layout = sidebar().getByRole('link', { name: 'Header e footer' });
      expect(layout.textContent).toBe('Header');
      const settings = sidebar().getByRole('link', { name: 'Impostazioni' });
      expect(settings.textContent).toBe('Opzioni');
      // What fits keeps its own name.
      expect(sidebar().getByRole('link', { name: 'Sezioni' }).textContent).toBe(
        'Sezioni',
      );
    });

    it('draws the site as a link named for the site it goes to', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      await screen.findByRole('link', { name: 'Impostazioni' });
      await fold();

      const site = await sidebar().findByRole('link', {
        name: 'Apri il sito: Forno Esempio',
      });
      expect(site.textContent).toBe('Sito');
      expect(site.getAttribute('href')).toBe(PUBLIC_SITE_URL);
    });

    it('gives the collections an item each while there are three or fewer, with their names', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(collectionsApi.listCollections).mockResolvedValue([
        buildCollectionRecord({ id: 'c1', name: 'News' }),
        buildCollectionRecord({ id: 'c2', name: 'Eventi' }),
        buildCollectionRecord({ id: 'c3', name: 'Casi' }),
      ]);
      renderShell();
      await screen.findByRole('link', { name: 'News' });
      await fold();

      for (const name of ['News', 'Eventi', 'Casi']) {
        expect((await sidebar().findByRole('link', { name })).textContent).toBe(
          name,
        );
      }
      expect(
        sidebar().queryByRole('button', { name: 'Collezioni' }),
      ).toBeNull();
    });

    it('gathers more than three into one item that opens a list with the names written', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(collectionsApi.listCollections).mockResolvedValue(
        ['News', 'Eventi', 'Casi', 'Guide'].map((name, index) =>
          buildCollectionRecord({ id: `c${index}`, name }),
        ),
      );
      renderShell();
      await screen.findByRole('link', { name: 'News' });
      await fold();

      const gathered = await sidebar().findByRole('button', {
        name: 'Collezioni',
      });
      expect(sidebar().queryByRole('link', { name: 'News' })).toBeNull();
      fireEvent.click(gathered);

      const list = within(
        await screen.findByRole('dialog', { name: 'Collezioni' }),
      );
      expect(list.getAllByRole('link').map((link) => link.textContent)).toEqual(
        ['News', 'Eventi', 'Casi', 'Guide'],
      );
    });

    it('turns the search field into a written item, and still opens it', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      await fold();

      fireEvent.click(sidebar().getByRole('button', { name: 'Cerca' }));

      expect(
        await screen.findByRole('dialog', { name: 'Cerca nell’editor' }),
      ).toBeTruthy();
    });

    it('keeps the account menu, drawn as the picture with the role under it', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell('admin');
      await fold();

      const account = await sidebar().findByRole('button', {
        name: 'Account: Giulia Rossi',
      });
      expect(account.textContent).toContain('Editor');
      fireEvent.click(account);

      expect(
        await screen.findByRole('link', { name: 'Il mio profilo' }),
      ).toBeTruthy();
    });

    it('remembers the fold, and the unfold, between visits', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      const first = renderShell();
      await fold();
      first.unmount();

      renderShell();
      const nav = await screen.findByRole('navigation', {
        name: 'Navigazione principale',
      });
      expect(nav.className).toContain('w-18');

      fireEvent.click(within(nav).getByRole('button', { name: 'Espandi' }));
      expect(nav.className).toContain('w-52');
      expect(localStorage.getItem('kometio-sidebar-collapsed')).toBe('false');
    });

    it('is not offered in the menu on a phone, which is always whole', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      renderShell();
      fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));

      const menu = within(await screen.findByRole('dialog', { name: 'Menu' }));
      expect(menu.queryByRole('button', { name: 'Comprimi' })).toBeNull();
    });
  });

  describe('the search', () => {
    it('opens from the field in the sidebar, which says what it finds and the key that opens it', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

      renderShell();
      const field = screen.getAllByRole('button', { name: /Cerca…/ })[0];
      if (!field) throw new Error('the sidebar has no search field');
      expect(field.textContent).toMatch(/(⌘|Ctrl)K|Ctrl\+K/);
      fireEvent.click(field);

      expect(
        await screen.findByRole('dialog', { name: 'Cerca nell’editor' }),
      ).toBeTruthy();
    });

    it('opens on Ctrl+K from anywhere in the shell, even inside a field', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <TooltipProvider>
            <ToastProvider>
              <AdminShell>
                <input aria-label="un campo" />
              </AdminShell>
            </ToastProvider>
          </TooltipProvider>
        </QueryClientProvider>,
      );

      fireEvent.keyDown(screen.getByLabelText('un campo'), {
        key: 'k',
        ctrlKey: true,
      });

      expect(
        await screen.findByRole('dialog', { name: 'Cerca nell’editor' }),
      ).toBeTruthy();
    });

    it('is a written button in the narrow bar, where there is no sidebar to hold the field', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

      renderShell();
      const bar = screen.getByRole('banner');
      fireEvent.click(within(bar).getByRole('button', { name: 'Cerca' }));

      expect(
        await screen.findByRole('dialog', { name: 'Cerca nell’editor' }),
      ).toBeTruthy();
    });
  });

  it('colours the active nav item through a variant, not a second class', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();
    const active = screen.getByRole('link', { name: 'Pagine' });

    expect(active.getAttribute('data-status')).toBe('active');
    expect(active.className).toContain('data-[status=active]:text-foreground');
    // The point of the fix: nothing hands the link a bare colour that has
    // to out-order another bare colour in the same attribute.
    expect(active.className.split(/\s+/)).not.toContain('text-foreground');
  });

  /*
   * On a narrow screen the sidebar was a fixed 208px column that took more
   * than half of a phone, on every screen. Below `md` it is a bar with a
   * button, and the same navigation opens in a dialog: focus trapped,
   * Escape closes it, and following a link closes it too.
   */
  it('opens the same navigation from the narrow bar, and closes once a link is followed', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    renderShell();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }));

    const menu = await screen.findByRole('dialog', { name: 'Menu' });
    const inMenu = [...menu.querySelectorAll('a')].map((a) => a.textContent);
    expect(inMenu).toContain('Pagine');
    expect(inMenu).toContain('Media');

    const media = [...menu.querySelectorAll('a')].find(
      (a) => a.textContent === 'Media',
    );
    if (!media) throw new Error('the menu has no Media link');
    fireEvent.click(media);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes the profile and logout inside Account', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Account: Giulia Rossi' }),
    );

    expect(
      screen.getByRole('link', { name: 'Il mio profilo' }).getAttribute('href'),
    ).toBe('/account');
    expect(screen.getByRole('button', { name: /^esci$/i })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /lingua/i })).toBeNull();
  });

  /*
   * Who is signed in, at a glance: before, the foot of the sidebar said
   * "Account" to everybody.
   */
  it('shows the person signed in: their initial, name and role', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderShell('editor');

    const trigger = await screen.findByRole('button', {
      name: 'Account: Giulia Rossi',
    });
    expect(trigger.textContent).toContain('Giulia Rossi');
    expect(trigger.textContent).toContain('Editor');
    expect(
      trigger.querySelector('[data-testid="user-avatar-initial"]')?.textContent,
    ).toBe('G');
  });
});
