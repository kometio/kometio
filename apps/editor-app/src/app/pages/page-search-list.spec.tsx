import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
} from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { PageSearchList } from './page-search-list';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return { ...actual, listPageGroups: vi.fn() };
});

function page(
  id: string,
  title: string,
  parentId: string | null = null,
  locale = 'it',
) {
  return buildPageGroupListItemRecord({
    id,
    parentId,
    translations: [
      buildPageGroupListItemTranslation({ title, slug: id, locale }),
    ],
  });
}

function renderList(
  items: ReturnType<typeof page>[],
  total = items.length,
  props: Partial<Parameters<typeof PageSearchList>[0]> = {},
) {
  vi.mocked(api.listPageGroups).mockResolvedValue({ items, total });
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      {/* The pager's buttons are IconButtons, and a Radix tooltip needs a provider. */}
      <TooltipProvider>
        <PageSearchList
          siteId="site-1"
          locale="it"
          onSelect={onSelect}
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onSelect };
}

describe('PageSearchList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks the server for the typed search rather than filtering what it has', async () => {
    // The bug this replaces: twenty pages fetched once and filtered in
    // the browser, so the twenty-first could never be found.
    renderList([page('home', 'Casa')]);

    fireEvent.change(
      await screen.findByLabelText(/Cerca una pagina|Search pages/),
      {
        target: { value: 'serv' },
      },
    );

    await waitFor(() =>
      expect(api.listPageGroups).toHaveBeenCalledWith(
        'site-1',
        1,
        expect.any(Number),
        expect.objectContaining({ search: 'serv' }),
      ),
    );
  });

  it('goes back to the first page when the search changes', async () => {
    // Page 4 of the old results is usually past the end of the new ones,
    // which would answer a search that matched with an empty list.
    renderList([page('home', 'Casa')], 100);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Pagina successiva|Next page/i,
      }),
    );
    await waitFor(() =>
      expect(api.listPageGroups).toHaveBeenCalledWith(
        'site-1',
        2,
        expect.any(Number),
        expect.anything(),
      ),
    );

    fireEvent.change(screen.getByLabelText(/Cerca una pagina|Search pages/), {
      target: { value: 'casa' },
    });

    await waitFor(() =>
      expect(api.listPageGroups).toHaveBeenLastCalledWith(
        'site-1',
        1,
        expect.any(Number),
        expect.objectContaining({ search: 'casa' }),
      ),
    );
  });

  it('hands back the page that was clicked', async () => {
    const { onSelect } = renderList([page('home', 'Casa')]);

    fireEvent.click(await screen.findByRole('button', { name: /Casa/ }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ pageGroupId: 'home', title: 'Casa' }),
    );
  });

  it('indents a child under the parent it arrived with', async () => {
    renderList([
      page('services', 'Servizi'),
      page('plumbing', 'Idraulica', 'services'),
    ]);

    const child = await screen.findByText('Idraulica');
    const parent = screen.getByText('Servizi');
    expect(parent.getAttribute('style')).toContain('0rem');
    expect(child.getAttribute('style')).toContain('1rem');
  });

  it('draws a match whose parent did not come back at the top, not indented under nothing', async () => {
    // What a search returns: the pages whose title matched, without their
    // ancestors. Indenting by real depth would draw a tree with no trunk.
    renderList([page('plumbing', 'Idraulica', 'services')]);

    expect(
      (await screen.findByText('Idraulica')).getAttribute('style'),
    ).toContain('0rem');
  });

  it('leaves out a page with no translation in the asked-for language', async () => {
    // It has no address there, so choosing it would mean nothing.
    renderList([page('home', 'Casa'), page('about', 'About', null, 'en')]);

    expect(await screen.findByText('Casa')).toBeTruthy();
    expect(screen.queryByText('About')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    renderList([]);

    expect(await screen.findByText(/Nessuna pagina|No pages/i)).toBeTruthy();
  });

  it('fetches nothing while it is not open', async () => {
    // Both callers keep it mounted for the life of the screen around it.
    renderList([page('home', 'Casa')], 1, { enabled: false });

    await waitFor(() => expect(api.listPageGroups).not.toHaveBeenCalled());
  });
});
