import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { WithToasts } from '../../test/toasts.test-fixture';
import { sessionAs } from '../../test/current-session.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import type { MediaRecord, MediaFilters } from '../../lib/media-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildMediaRecord } from '@kometio/testing/records';
import * as mediaApi from '../../lib/media-api-client';
import { ApiError } from '../../lib/http-client';
import { MediaLibraryView } from './media-library-view';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    // No router in these tests: a folder is a link, and what matters here
    // is where it points.
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// A panel opened by the address asks for its file and where it is used.
vi.mock('../../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/media-api-client')>();
  return { ...actual, getMedia: vi.fn(), getMediaUsages: vi.fn() };
});

const mediaOne = buildMediaRecord();

interface SearchUpdate {
  to?: string;
  search: (previous: object) => object;
  replace?: boolean;
}

function isSearchUpdate(value: unknown): value is SearchUpdate {
  return (
    typeof value === 'object' &&
    value !== null &&
    'search' in value &&
    typeof value.search === 'function'
  );
}

/** What the first navigation asked for, when it asked to change the search by a function of the current one. */
function firstSearchUpdate(navigate: {
  mock: { calls: unknown[][] };
}): SearchUpdate {
  const options = navigate.mock.calls[0]?.[0];
  if (!isSearchUpdate(options)) {
    throw new Error('the first navigation did not update the search');
  }
  return options;
}

const counts = { image: 21, video: 0, audio: 2, document: 3, other: 1 };

function renderView(
  items: MediaRecord[],
  options: {
    page?: number;
    total?: number;
    filters?: MediaFilters;
    openFileId?: string;
  } = {},
) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <MediaLibraryView
          siteId="site-1"
          items={items}
          page={options.page ?? 1}
          total={options.total ?? items.length}
          filters={options.filters ?? {}}
          counts={counts}
          openFileId={options.openFileId}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('MediaLibraryView', () => {
  beforeEach(() => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    vi.mocked(mediaApi.getMediaUsages).mockResolvedValue({
      pages: [],
      sections: [],
      layout: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  /*
   * The library used to open onto every file at once. It opens onto five
   * folders now, each with how many files it holds, and no file is shown
   * until one is opened.
   */
  it('opens onto one folder per kind, each with its count and its own address', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    const { container } = renderView([mediaOne]);

    expect(screen.getByRole('heading', { name: 'Media' })).toBeTruthy();
    const folders = screen.getByRole('navigation', { name: 'Cartelle' });
    const links = [...folders.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual([
      'Immagini21 file',
      'Video0 file',
      'Audio2 file',
      'Documenti3 file',
      'Altro1 file',
    ]);
    expect(links[3].getAttribute('href')).toBe('/media?page=1&kind=document');
    // An empty folder is still there: the library's shape does not change
    // with its contents.
    expect(links[1].textContent).toContain('0 file');
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it("shows a folder's files under a way back to the folders", () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    const { container } = renderView([mediaOne], {
      filters: { kind: 'image' },
    });

    // The folder's own name is the title, like every other screen's; how
    // many files it holds goes under it.
    expect(screen.getByRole('heading', { name: 'Immagini' })).toBeTruthy();
    expect(screen.getByText('21 file')).toBeTruthy();
    const trail = screen.getByRole('navigation', { name: 'Dove ti trovi' });
    expect(trail.querySelector('a')?.getAttribute('href')).toBe(
      '/media?page=1',
    );
    expect(container.querySelectorAll('img')).toHaveLength(1);
    // The folder is the choice of kind; offering the kind buttons again
    // inside it would ask the same question twice.
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('searches every folder when the search is typed at the front door', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderView([mediaOne], { filters: { search: 'foto' } });

    expect(
      screen.getByRole('heading', { name: 'Risultati della ricerca' }),
    ).toBeTruthy();
    expect(screen.getByText('foto.png')).toBeTruthy();
  });

  /*
   * The search lives in the address on purpose — one worth doing is worth
   * reloading into and sending to somebody — but writing it there on every
   * keystroke meant a history entry and a loader round trip per character:
   * six of each to type "report", and six presses of Back to leave the
   * screen. The pages list had already written that lesson down.
   */
  it('waits for the typing to settle before touching the address', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    renderView([mediaOne]);
    const box = screen.getByLabelText('Cerca per nome');

    fireEvent.change(box, { target: { value: 'r' } });
    fireEvent.change(box, { target: { value: 're' } });
    fireEvent.change(box, { target: { value: 'rep' } });

    // What was typed is on screen straight away, whatever the address says.
    expect((box as HTMLInputElement).value).toBe('rep');
    expect(navigate).not.toHaveBeenCalled();

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith({
      to: '/media',
      search: { page: 1, search: 'rep', kind: undefined },
      // One search, one history entry — not one per character.
      replace: true,
    });
  });

  it('navigates via /media search params when paging', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);

    renderView([mediaOne], {
      page: 2,
      total: 100,
      filters: { kind: 'image' },
    });
    fireEvent.click(screen.getByRole('button', { name: /pagina successiva/i }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/media',
        search: { kind: 'image', page: 3 },
      }),
    );
  });

  /*
   * Upload is the screen's action, beside its title, on every one of its
   * three faces — the folders, a folder, and a search — not in a toolbar
   * that came and went with what was showing.
   */
  it('puts the upload beside the title, at the front door and inside a folder', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    const { unmount } = renderView([mediaOne]);
    expect(
      screen.getByRole('heading', { name: 'Media' }).closest('header')
        ?.textContent,
    ).toContain('Carica file');
    unmount();

    renderView([mediaOne], { filters: { kind: 'image' } });
    expect(
      screen.getByRole('heading', { name: 'Immagini' }).closest('header')
        ?.textContent,
    ).toContain('Carica file');
  });

  it('no longer carries the security warning on the page', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderView([mediaOne], { filters: { kind: 'image' } });

    expect(
      screen.queryByText(/kometio non controlla cosa contiene/i),
    ).toBeNull();
  });

  it('opens a file in its panel: the address gains ?file=, one step forward', () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    renderView([mediaOne], { filters: { kind: 'image' } });

    fireEvent.click(screen.getByRole('button', { name: 'foto.png' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    const call = firstSearchUpdate(navigate);
    expect(call.to).toBe('/media');
    // Kept: the folder and page the panel opened over.
    expect(call.search({ page: 2, kind: 'image' })).toEqual({
      page: 2,
      kind: 'image',
      file: 'media-1',
    });
    // Pushed, not replaced: that is what lets Back close it.
    expect(call.replace).toBeUndefined();
  });

  it('shows the panel of the file the address names', () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());

    renderView([mediaOne], {
      filters: { kind: 'image' },
      openFileId: 'media-1',
    });

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('URL pubblico')).toBeTruthy();
  });

  it('says so when the address names a file that is not there', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(mediaApi.getMedia).mockRejectedValue(new ApiError(404, {}));

    renderView([mediaOne], {
      filters: { kind: 'image' },
      openFileId: 'somebody-elses',
    });

    expect(await screen.findByText('File non trovato')).toBeTruthy();
  });

  it('opens the panel on a file the list does not hold, by asking for it', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    const elsewhere = buildMediaRecord({
      id: 'on-page-3',
      filename: 'pagina-tre.png',
    });
    vi.mocked(mediaApi.getMedia).mockResolvedValue(elsewhere);

    renderView([mediaOne], {
      filters: { kind: 'image' },
      openFileId: 'on-page-3',
    });

    expect(
      await screen.findByRole('heading', { name: 'pagina-tre.png' }),
    ).toBeTruthy();
    expect(mediaApi.getMedia).toHaveBeenCalledWith('on-page-3');
  });

  it('closes a panel it opened by stepping back, so the history does not grow a twin of the list', () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    const back = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => undefined);
    const view = renderView([mediaOne], { filters: { kind: 'image' } });

    fireEvent.click(screen.getByRole('button', { name: 'foto.png' }));
    view.rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <WithToasts>
          <MediaLibraryView
            siteId="site-1"
            items={[mediaOne]}
            page={1}
            total={1}
            filters={{ kind: 'image' }}
            counts={counts}
            openFileId="media-1"
          />
        </WithToasts>
      </QueryClientProvider>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(back).toHaveBeenCalledTimes(1);
    // Only the opening navigated; closing did not add an entry.
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('closes a panel it arrived at by a link by replacing the address, since there is nothing to go back to', () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    const back = vi
      .spyOn(window.history, 'back')
      .mockImplementation(() => undefined);
    renderView([mediaOne], {
      filters: { kind: 'image' },
      openFileId: 'media-1',
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(back).not.toHaveBeenCalled();
    const call = firstSearchUpdate(navigate);
    expect(call.replace).toBe(true);
    expect(call.search({ kind: 'image', file: 'media-1' })).toEqual({
      kind: 'image',
      file: undefined,
    });
  });
});
