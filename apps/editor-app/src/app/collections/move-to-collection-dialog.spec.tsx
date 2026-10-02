import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { buildCollectionRecord } from '@kometio/testing/records';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { MoveToCollectionDialog } from './move-to-collection-dialog';
import * as api from '../../lib/collections-api-client';

vi.mock('../../lib/collections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/collections-api-client')>();
  return { ...actual, listCollections: vi.fn() };
});

function renderDialog(
  overrides: Partial<{
    currentCollectionId: string | null;
  }> = {},
) {
  vi.mocked(api.listCollections).mockResolvedValue([
    buildCollectionRecord({ id: 'news', name: 'News' }),
    buildCollectionRecord({
      id: 'events',
      name: 'Events',
      icon: 'calendar',
      order: 1,
    }),
  ]);
  const onMove = vi.fn<(id: string | null) => Promise<unknown>>(() =>
    Promise.resolve(),
  );
  const utils = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MoveToCollectionDialog
        siteId="site-1"
        open
        onOpenChange={vi.fn()}
        pageTitle="Primo articolo"
        currentCollectionId={overrides.currentCollectionId ?? null}
        onMove={onMove}
        isMoving={false}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onMove };
}

/*
 * The way OUT of a section has to be as reachable as the way in, so the
 * page tree is one of the options rather than a separate "remove" action.
 */
describe('MoveToCollectionDialog', () => {
  it('offers every section of the site, plus the page tree itself', async () => {
    renderDialog();

    expect(await screen.findByText('News')).toBeTruthy();
    expect(screen.getByText('Events')).toBeTruthy();
    expect(screen.getByText('Pagine (nessuna collezione)')).toBeTruthy();
  });

  it('starts on the section the page is filed in', async () => {
    renderDialog({ currentCollectionId: 'events' });

    await screen.findByText('Events');
    const chosen = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).checked);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].closest('label')?.textContent).toContain('Events');
  });

  it('moves the page to the section that was picked', async () => {
    const { onMove } = renderDialog();

    fireEvent.click(await screen.findByText('News'));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta' }));

    expect(onMove).toHaveBeenCalledWith('news');
  });

  /*
   * Confirming without changing anything would fire a save that writes
   * what is already there — and reads, from the list, as nothing having
   * happened.
   */
  it('has nothing to confirm until a different place is picked', async () => {
    renderDialog({ currentCollectionId: 'news' });

    await screen.findByText('News');
    const confirm = screen.getByRole('button', { name: 'Sposta' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Pagine (nessuna collezione)'));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });
});
