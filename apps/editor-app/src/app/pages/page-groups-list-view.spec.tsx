import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import {
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildPageGroupRecord,
} from '@kometio/testing/records';
import { ApiError } from '../../lib/http-client';
import * as api from '../../lib/page-groups-api-client';
import { WithToasts } from '../../test/toasts.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { EMPTY_PAGES_LIST_FILTERS } from './pages-list-filter-bar';
import { PageGroupsListView } from './page-groups-list-view';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    createPageGroup: vi.fn(),
    createPageGroupTranslation: vi.fn(),
    deletePageGroup: vi.fn(),
    duplicatePageGroup: vi.fn(),
    reorderPageGroups: vi.fn(),
  };
});

const groupA = buildPageGroupListItemRecord({
  id: 'group-a',
  createdByName: 'Ada Lovelace',
  lastEditedAt: '2026-09-09T10:00:00.000Z',
  lastEditedByName: 'Grace Hopper',
  translations: [
    buildPageGroupListItemTranslation({
      slug: 'chi-siamo',
      title: 'Chi siamo',
      status: 'published',
    }),
  ],
});

const groupB: PageGroupListItemRecord = {
  ...groupA,
  id: 'group-b',
  order: 1,
  translations: [
    buildPageGroupListItemTranslation({
      slug: 'contatti',
      title: 'Contatti',
      status: 'draft',
    }),
  ],
};

function renderView(
  overrides: Partial<{
    groups: PageGroupListItemRecord[];
    page: number;
    total: number;
    filters: typeof EMPTY_PAGES_LIST_FILTERS;
    collectionId: string | null;
    layout: 'tree' | 'feed';
    isRefreshing: boolean;
  }> = {},
) {
  const onFiltersChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <PageGroupsListView
          siteId="site-1"
          collectionId={overrides.collectionId ?? null}
          layout={overrides.layout ?? 'tree'}
          defaultLocale="it"
          enabledLocales={['it']}
          groups={overrides.groups ?? [groupA, groupB]}
          page={overrides.page ?? 1}
          total={
            overrides.total ?? (overrides.groups ?? [groupA, groupB]).length
          }
          filters={overrides.filters ?? EMPTY_PAGES_LIST_FILTERS}
          onFiltersChange={onFiltersChange}
          isRefreshing={overrides.isRefreshing}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
  return { ...utils, onFiltersChange };
}

/** Ticks the box at the start of a page's row, the way a person chooses the pages to act on. */
function tick(title: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: `Seleziona ${title}` }));
}

describe('PageGroupsListView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders one row per group, each title a link that opens the page', () => {
    renderView();

    expect(
      screen.getByRole('link', { name: 'Chi siamo' }).getAttribute('href'),
    ).toBe('/page-groups/group-a');
    expect(
      screen.getByRole('link', { name: 'Contatti' }).getAttribute('href'),
    ).toBe('/page-groups/group-b');
  });

  it('says why a page with subpages cannot be deleted, instead of an error code', async () => {
    vi.mocked(api.deletePageGroup).mockRejectedValue(
      new ApiError(409, { message: 'page-has-children', statusCode: 409 }),
    );
    renderView();

    tick('Chi siamo');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Elimina' }));

    await screen.findByText(/Questa pagina ha delle sottopagine/);
    expect(screen.queryByText(/page-has-children|ApiError/)).toBeNull();
  });

  it('offers nothing to do to a page until one is ticked, and then says what, in words', () => {
    renderView();

    expect(screen.queryByRole('button', { name: 'Duplica' })).toBeNull();

    tick('Chi siamo');

    const bar = within(
      screen.getByRole('region', { name: 'Azioni sulle pagine selezionate' }),
    );
    expect(bar.getByText('1 selezionata')).toBeTruthy();
    for (const name of [
      'Apri',
      'Duplica',
      'Sposta in una collezione…',
      'Sposta sotto…',
      'Elimina',
    ]) {
      expect(bar.getByRole('button', { name })).toBeTruthy();
    }
  });

  /*
   * Filing an existing page under a section had no door at all: the
   * endpoint existed, nothing in the editor called it, and the only way
   * in was to create the page from inside the section.
   */
  it('offers to move the selected page into a section', async () => {
    renderView();

    tick('Chi siamo');
    fireEvent.click(
      screen.getByRole('button', { name: 'Sposta in una collezione…' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Sposta in una collezione' }),
    ).toBeTruthy();
  });

  it('writes the actions once, in the bar over the list, and not on every row', () => {
    renderView();

    tick('Chi siamo');

    const row = screen.getByText('Chi siamo').closest('li');
    expect(row?.querySelectorAll('button:not([role="checkbox"])')).toHaveLength(
      // The drag handle, and nothing else: a row does not carry actions.
      1,
    );
    expect(screen.getAllByRole('button', { name: 'Elimina' })).toHaveLength(1);
  });

  it('gives every row its address, its creator, its last editor and a badge that says its status', () => {
    renderView();

    expect(screen.getByText('/chi-siamo')).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
    expect(screen.getAllByText('Grace Hopper')).toHaveLength(2);
    // The month by name: 09/09 could not show which half is the day.
    expect(screen.getAllByText('9 set 2026')).toHaveLength(2);
    expect(screen.getByLabelText('IT — Pubblicata')).toBeTruthy();
    expect(screen.getByLabelText('IT — Bozza')).toBeTruthy();
  });

  // A state has its own colour and its word: the column said it in plain
  // text, and the state that costs somebody something looked like the rest.
  it('draws each row’s state as a badge, in the colour of that state', () => {
    const withUnpublishedChanges: PageGroupListItemRecord = {
      ...groupA,
      id: 'group-c',
      order: 2,
      translations: [
        buildPageGroupListItemTranslation({
          slug: 'servizi',
          title: 'Servizi',
          status: 'published',
          hasUnpublishedChanges: true,
        }),
      ],
    };
    renderView({ groups: [groupA, groupB, withUnpublishedChanges] });

    const stateOf = (title: string) => {
      const row = screen.getByText(title).closest('li');
      return row?.querySelector('[data-slot="badge"]:not([aria-label])');
    };
    expect(stateOf('Chi siamo')?.textContent).toBe('Pubblicata');
    expect(stateOf('Chi siamo')?.getAttribute('data-variant')).toBe('success');
    expect(stateOf('Contatti')?.textContent).toBe('Bozza');
    expect(stateOf('Contatti')?.getAttribute('data-variant')).toBe('secondary');
    expect(stateOf('Servizi')?.textContent).toBe('Modifiche non pubblicate');
    expect(stateOf('Servizi')?.getAttribute('data-variant')).toBe('warning');
  });

  it('shows a dash rather than "Invalid Date" when a row carries a date it cannot read', () => {
    renderView({
      groups: [
        {
          ...groupA,
          lastEditedAt: '',
          createdByName: null,
          lastEditedByName: null,
        },
      ],
    });

    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    // One dash, not three: the two author columns are not drawn at all
    // when nobody on this page of results is named. They were "—" on
    // fifteen rows in sixteen and took a third of the table between them.
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(screen.queryByText('Creata da')).toBeNull();
  });

  it('duplicating a page keeps it in the list, and offers the way to the copy in a toast', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    vi.mocked(api.duplicatePageGroup).mockResolvedValue(
      buildPageGroupRecord({ id: 'group-a-copy', order: 2 }),
    );
    renderView();

    tick('Chi siamo');
    fireEvent.click(screen.getByRole('button', { name: 'Duplica' }));

    await vi.waitFor(() =>
      expect(api.duplicatePageGroup).toHaveBeenCalledWith('group-a'),
    );
    expect(await screen.findByText('Pagina duplicata')).toBeTruthy();
    // It did not take the person anywhere: it offered.
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apri la copia' }));
    expect(navigate).toHaveBeenCalledWith({
      to: '/page-groups/$groupId',
      params: { groupId: 'group-a-copy' },
    });
  });

  describe('with more than one page ticked', () => {
    it('counts them, and offers what works on several (opening and moving under one parent do not)', () => {
      renderView();

      tick('Chi siamo');
      tick('Contatti');

      const bar = within(
        screen.getByRole('region', { name: 'Azioni sulle pagine selezionate' }),
      );
      expect(bar.getByText('2 selezionate')).toBeTruthy();
      expect(bar.queryByRole('button', { name: 'Apri' })).toBeNull();
      expect(bar.queryByRole('button', { name: 'Sposta sotto…' })).toBeNull();
      for (const name of ['Duplica', 'Sposta in una collezione…', 'Elimina']) {
        expect(bar.getByRole('button', { name })).toBeTruthy();
      }
    });

    it('ticks every page from the box in the header, and unticks them from the same box', () => {
      renderView();

      const all = screen.getByRole('checkbox', {
        name: 'Seleziona tutte le pagine',
      });
      fireEvent.click(all);
      expect(screen.getByText('2 selezionate')).toBeTruthy();
      expect(all.getAttribute('aria-checked')).toBe('true');

      fireEvent.click(all);
      expect(screen.queryByText('2 selezionate')).toBeNull();
    });

    it('says the header box is half ticked when only some are', () => {
      renderView();

      tick('Chi siamo');

      expect(
        screen
          .getByRole('checkbox', { name: 'Seleziona tutte le pagine' })
          .getAttribute('aria-checked'),
      ).toBe('mixed');
    });

    it('clears the selection with Deseleziona', () => {
      renderView();
      tick('Chi siamo');

      fireEvent.click(screen.getByRole('button', { name: 'Deseleziona' }));

      expect(
        screen.queryByRole('region', {
          name: 'Azioni sulle pagine selezionate',
        }),
      ).toBeNull();
    });

    it('duplicates them one after the other, and says so once', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(api.duplicatePageGroup)
        .mockResolvedValueOnce(buildPageGroupRecord({ id: 'copy-a' }))
        .mockResolvedValueOnce(buildPageGroupRecord({ id: 'copy-b' }));
      renderView();

      tick('Chi siamo');
      tick('Contatti');
      fireEvent.click(screen.getByRole('button', { name: 'Duplica' }));

      expect(await screen.findByText('2 pagine duplicate')).toBeTruthy();
      expect(api.duplicatePageGroup).toHaveBeenNthCalledWith(1, 'group-a');
      expect(api.duplicatePageGroup).toHaveBeenNthCalledWith(2, 'group-b');
      // Two copies have no one "the copy" to open.
      expect(
        screen.queryByRole('button', { name: 'Apri la copia' }),
      ).toBeNull();
    });

    it('asks once for all of them before deleting, and deletes each', async () => {
      vi.mocked(api.deletePageGroup).mockResolvedValue(undefined);
      renderView();

      tick('Chi siamo');
      tick('Contatti');
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(within(confirm).getByText('Eliminare 2 pagine?')).toBeTruthy();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Elimina' }));

      expect(await screen.findByText('2 pagine eliminate')).toBeTruthy();
      expect(api.deletePageGroup).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleting a page that has subpages', () => {
    const parent = buildPageGroupListItemRecord({
      id: 'parent',
      parentId: null,
      childCount: 2,
      translations: [
        buildPageGroupListItemTranslation({
          slug: 'servizi',
          title: 'Servizi',
        }),
      ],
    });
    const childOne = buildPageGroupListItemRecord({
      id: 'child-1',
      parentId: 'parent',
      translations: [
        buildPageGroupListItemTranslation({ slug: 'web', title: 'Web' }),
      ],
    });
    const childTwo = buildPageGroupListItemRecord({
      id: 'child-2',
      parentId: 'parent',
      translations: [
        buildPageGroupListItemTranslation({ slug: 'seo', title: 'Consulenza' }),
      ],
    });

    it('names the subpages and says they move to the top level, and lets the deletion go ahead', async () => {
      vi.mocked(api.deletePageGroup).mockResolvedValue(undefined);
      renderView({ groups: [parent, childOne, childTwo] });

      tick('Servizi');
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain(
        'Le 2 sottopagine (Web, Consulenza) passano al primo livello',
      );
      expect(dialog.textContent).toContain('quelli attuali non porteranno più');
      const confirm = within(dialog).getByRole('button', { name: 'Elimina' });
      expect(confirm).toHaveProperty('disabled', false);
      fireEvent.click(confirm);

      await waitFor(() =>
        expect(api.deletePageGroup).toHaveBeenCalledWith('parent'),
      );
      // The subpages are not deleted: the API moves them.
      expect(api.deletePageGroup).toHaveBeenCalledTimes(1);
    });

    it('says how many move even when the list is filtered and does not hold them', async () => {
      vi.mocked(api.deletePageGroup).mockResolvedValue(undefined);
      // Only the parent is on screen (a search found it); the API knows it has three.
      renderView({ groups: [{ ...parent, childCount: 3 }] });

      tick('Servizi');
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain(
        '3 sottopagine passano al primo livello',
      );
      // No half list of names: they are not all here.
      expect(dialog.textContent).not.toContain('Web');
    });

    it('says which subpage has its address taken at the top level, in the server’s own words', async () => {
      vi.mocked(api.deletePageGroup).mockRejectedValue(
        new ApiError(409, {
          message:
            'The page "web" (it) under this one cannot move to the top level: that address is already taken there. Rename it or move it elsewhere first.',
          statusCode: 409,
        }),
      );
      renderView({ groups: [parent, childOne, childTwo] });
      tick('Servizi');
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
      const dialog = await screen.findByRole('alertdialog');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));

      expect(
        await screen.findByText(/The page "web" \(it\) under this one/),
      ).toBeTruthy();
    });

    it('deletes the subpages first when they are ticked too, and the page after them', async () => {
      vi.mocked(api.deletePageGroup).mockResolvedValue(undefined);
      renderView({ groups: [parent, childOne, childTwo] });

      tick('Servizi');
      tick('Web');
      tick('Consulenza');
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));

      expect(await screen.findByText('3 pagine eliminate')).toBeTruthy();
      expect(
        vi
          .mocked(api.deletePageGroup)
          .mock.calls.map(([id]) => id)
          .at(-1),
      ).toBe('parent');
    });
  });

  it('shows a drag handle for every row when unfiltered and on a single page', () => {
    renderView();

    expect(
      screen.getAllByRole('button', { name: 'Trascina per riordinare' }),
    ).toHaveLength(2);
  });

  it('hides the drag handle while a filter is active (a drag could not be a real full-sibling permutation), and says how to get it back', () => {
    renderView({ filters: { ...EMPTY_PAGES_LIST_FILTERS, search: 'chi' } });

    expect(
      screen.queryByRole('button', { name: 'Trascina per riordinare' }),
    ).toBeNull();
    expect(
      screen.getByText('Per riordinare le pagine togli i filtri.'),
    ).toBeTruthy();
  });

  it('hides the drag handle when there is more than one page of results, and says why', () => {
    renderView({ total: 100 });

    expect(
      screen.queryByRole('button', { name: 'Trascina per riordinare' }),
    ).toBeNull();
    expect(
      screen.getByText(
        'Per riordinare le pagine devono stare tutte in una pagina dell’elenco.',
      ),
    ).toBeTruthy();
  });

  it('says nothing about reordering where reordering was never on offer', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderView({ filters: { ...EMPTY_PAGES_LIST_FILTERS, search: 'chi' } });

    expect(screen.queryByText(/Per riordinare/)).toBeNull();
  });

  // The status column is not drawn on a phone; the state was lost with it.
  it('shows the state under the address as well, for a screen with no status column', () => {
    renderView();

    const row = screen.getByText('Chi siamo').closest('li');
    expect(
      row?.querySelectorAll('[data-slot="badge"]:not([aria-label])'),
    ).toHaveLength(2);
  });

  it('gives way to a placeholder while a filter is being asked for, not to rows that no longer match', () => {
    renderView({ isRefreshing: true });

    expect(screen.queryByText('Chi siamo')).toBeNull();
    expect(screen.getByText('Caricamento...')).toBeTruthy();
  });
});

/*
 * A section's list is the same screen with a narrower question, so its
 * pagination has to come back to it: it used to send you to the page tree
 * as soon as a section grew past one page of results, which reads as the
 * section having lost everything in it.
 */
describe('PageGroupsListView pagination', () => {
  it('stays on the section it is listing', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    renderView({
      collectionId: 'news',
      layout: 'feed',
      page: 1,
      total: 40,
    });

    fireEvent.click(screen.getByLabelText('Pagina successiva'));

    expect(navigate).toHaveBeenCalledWith({
      to: '/collections/$collectionId',
      params: { collectionId: 'news' },
      search: expect.any(Function),
    });
  });

  /*
   * The next page of a filtered list is the next page of THAT list: paging
   * wrote the address as `?page=2` and dropped the search, the state and the
   * language along the way.
   */
  it.each([
    ['the page tree', {}, '/pages'],
    [
      'a section',
      { collectionId: 'news', layout: 'feed' as const },
      '/collections/$collectionId',
    ],
  ])(
    'keeps every filter of %s when it goes to the next page',
    async (_name, props, to) => {
      const navigate = vi.fn();
      vi.mocked(router.useNavigate).mockReturnValue(navigate);
      renderView({ ...props, page: 1, total: 40 });

      fireEvent.click(screen.getByLabelText('Pagina successiva'));

      const call = navigate.mock.calls[0]?.[0];
      expect(call.to).toBe(to);
      expect(
        call.search({
          page: 1,
          search: 'caffè',
          status: 'draft',
          locale: 'en',
        }),
      ).toEqual({ page: 2, search: 'caffè', status: 'draft', locale: 'en' });
    },
  );

  it('goes back to Pages when it is the page tree', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    renderView({ page: 1, total: 40 });

    fireEvent.click(screen.getByLabelText('Pagina successiva'));

    expect(navigate).toHaveBeenCalledWith({
      to: '/pages',
      search: expect.any(Function),
    });
  });
});

describe('PageGroupsListView — what each role is offered (docs/roles.md)', () => {
  it('lets an editor open and duplicate a page, but not move, reorder or delete it', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderView();

    expect(
      screen.queryByRole('button', { name: 'Trascina per riordinare' }),
    ).toBeNull();
    tick('Chi siamo');

    expect(screen.getByRole('button', { name: 'Duplica' })).toBeTruthy();
    for (const name of [
      'Elimina',
      'Sposta in una collezione…',
      'Sposta sotto…',
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});
