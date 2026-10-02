import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildPageTranslationRecord,
} from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { MoveToParentDialog } from './move-to-parent-dialog';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroups: vi.fn(),
    // The trigger names the current parent by reading it directly, not by
    // finding it in the list — a filtered list is not guaranteed to hold it.
    listPageGroupTranslations: vi.fn(),
  };
});

function page(id: string, title: string, parentId: string | null = null) {
  return buildPageGroupListItemRecord({
    id,
    parentId,
    translations: [buildPageGroupListItemTranslation({ title, slug: id })],
  });
}

function renderDialog(currentParentId: string | null = null) {
  vi.mocked(api.listPageGroups).mockResolvedValue({
    items: [
      page('services', 'Servizi'),
      page('plumbing', 'Idraulica', 'services'),
      page('home', 'Casa'),
    ],
    total: 3,
  });
  vi.mocked(api.listPageGroupTranslations).mockResolvedValue([
    buildPageTranslationRecord({
      pageGroupId: 'services',
      locale: 'it',
      slug: 'servizi',
      seoMeta: { title: 'Servizi', description: '' },
    }),
  ]);
  const onMove = vi.fn<(parentId: string | null) => Promise<unknown>>(() =>
    Promise.resolve(),
  );
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MoveToParentDialog
        siteId="site-1"
        defaultLocale="it"
        open
        onOpenChange={vi.fn()}
        pageTitle="Idraulica"
        pageGroupId="plumbing"
        currentParentId={currentParentId}
        onMove={onMove}
        isMoving={false}
      />
    </QueryClientProvider>,
  );
  return { onMove };
}

describe('MoveToParentDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('moves the page under the one chosen', async () => {
    const { onMove } = renderDialog('services');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagina genitore' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Casa/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta' }));

    await waitFor(() => expect(onMove).toHaveBeenCalledWith('home'));
  });

  it('takes the page back to the top level', async () => {
    const { onMove } = renderDialog('services');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagina genitore' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /livello radice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sposta' }));

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(null));
  });

  /*
   * The API refuses a ring anyway; a destination nobody can choose is
   * better than an error message explaining why the choice was wrong.
   */
  it('asks the server to leave out the page and everything under it', async () => {
    // Not a client-side filter any more, and it cannot be: a page found
    // by searching arrives without its ancestors, so there is no tree on
    // this side to walk down from the page being moved.
    renderDialog(null);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagina genitore' }),
    );

    await waitFor(() =>
      expect(api.listPageGroups).toHaveBeenCalledWith(
        'site-1',
        1,
        expect.any(Number),
        expect.objectContaining({ excludeSubtreeOf: 'plumbing' }),
      ),
    );
  });

  it('says nothing has changed until a different place is chosen', async () => {
    renderDialog('services');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sposta' }).hasAttribute('disabled'),
      ).toBe(true),
    );
  });
});
