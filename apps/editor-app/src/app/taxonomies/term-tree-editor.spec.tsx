import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../../components/ui/tooltip';
import * as api from '../../lib/taxonomies-api-client';
import type { TermRecord } from '../../lib/taxonomies-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildTaxonomyRecord, buildTermRecord } from '@kometio/testing/records';
import { chooseOption } from '../../test/select.test-fixture';
import { TermTreeEditor } from './term-tree-editor';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

vi.mock('../../lib/taxonomies-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/taxonomies-api-client')>();
  return {
    ...actual,
    listTerms: vi.fn(),
    createTerm: vi.fn(),
    reorderTerms: vi.fn(),
  };
});

const taxonomy = buildTaxonomyRecord();

function term(overrides: Partial<TermRecord> & { id: string }): TermRecord {
  return buildTermRecord({
    name: { it: overrides.id },
    slugs: { it: overrides.id },
    ...overrides,
  });
}

function renderEditor(terms: TermRecord[]) {
  vi.mocked(api.listTerms).mockResolvedValue(terms);
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <TermTreeEditor taxonomy={taxonomy} defaultLocale="it" />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('TermTreeEditor', () => {
  afterEach(() => vi.clearAllMocks());

  /*
   * A term unfolded in place, five fields per language, and pushed the rest
   * of the tree off the screen. It is a link to a page of its own now, and
   * the tree keeps only what is needed to find one.
   */
  it('makes every term a link to the page where it is edited', async () => {
    renderEditor([term({ id: 'macchine', name: { it: 'Macchine' } })]);

    const link = await screen.findByRole('link', { name: /Macchine/ });
    expect(link.getAttribute('href')).toBe(
      '/taxonomies/taxonomy-1/terms/macchine',
    );
  });

  it('has no field of a term in the tree', async () => {
    renderEditor([term({ id: 'macchine', name: { it: 'Macchine' } })]);
    await screen.findByRole('link', { name: /Macchine/ });

    expect(screen.queryByLabelText('Slug')).toBeNull();
    expect(screen.queryByRole('button', { name: /elimina/i })).toBeNull();
  });

  /*
   * The slug is next to the name and not behind an "advanced" toggle: it
   * IS the address, and hiding it is how somebody publishes fifty terms
   * and only then notices what their URLs say (docs/adr/0064).
   */
  it('shows each term address as it will answer', async () => {
    renderEditor([
      term({
        id: 'macchine',
        name: { it: 'Macchine' },
        slugs: { it: 'macchine' },
      }),
    ]);

    const row = await screen.findByRole('link', { name: /Macchine/ });
    expect(row.textContent).toContain('/categoria/macchine');
  });

  it('reads the tree in order, children under their parent, and says how many are inside', async () => {
    renderEditor([
      term({ id: 'b', name: { it: 'B' } }),
      term({ id: 'b-child', name: { it: 'B child' }, parentId: 'b' }),
      term({ id: 'a', name: { it: 'A' } }),
    ]);

    const rows = await screen.findAllByRole('link', {
      name: /\/categoria\//,
    });
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      'B/categoria/b1 termine dentro',
      'B child/categoria/b-child',
      'A/categoria/a',
    ]);
  });

  it('creates a term under the parent that was chosen, the field named above it', async () => {
    renderEditor([term({ id: 'parent', name: { it: 'Parent' } })]);
    await screen.findByRole('link', { name: /Parent/ });

    fireEvent.change(screen.getByLabelText('Nuovo termine'), {
      target: { value: 'Espresso' },
    });
    // A visible label, not only an aria-label a screen reader alone hears.
    chooseOption(
      screen.getByLabelText('Dentro (per il nuovo termine)'),
      'Parent',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi termine' }));

    await waitFor(() =>
      expect(vi.mocked(api.createTerm)).toHaveBeenCalledWith('taxonomy-1', {
        name: { it: 'Espresso' },
        parentId: 'parent',
      }),
    );
  });

  it('says an address is taken when the API says so', async () => {
    vi.mocked(api.createTerm).mockRejectedValue(
      new ApiError(409, { message: 'taken', statusCode: 409 }),
    );
    renderEditor([]);
    await screen.findByText('Nessun termine, per ora.');

    fireEvent.change(screen.getByLabelText('Nuovo termine'), {
      target: { value: 'Espresso' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi termine' }));

    expect(
      await screen.findByText(
        "Quell'indirizzo è già occupato da un altro termine o da una pagina.",
      ),
    ).toBeTruthy();
  });

  describe('putting the terms in order', () => {
    const treeNames = () =>
      screen
        .getAllByRole('link', { name: /\/categoria\// })
        .map((row) => row.textContent?.split('/categoria/')[0]);

    it('offers nothing while every term is alone under its parent', async () => {
      renderEditor([
        term({ id: 'a', name: { it: 'A' } }),
        term({ id: 'a-child', name: { it: 'A child' }, parentId: 'a' }),
      ]);
      await screen.findByRole('link', { name: /A child/ });

      expect(screen.queryByRole('button', { name: 'Riordina' })).toBeNull();
    });

    it('shows Up and Down beside the terms only once Reorder is pressed, and none where a term cannot go', async () => {
      renderEditor([
        term({ id: 'a', name: { it: 'A' } }),
        term({ id: 'b', name: { it: 'B' } }),
      ]);
      await screen.findByRole('link', { name: /^A/ });
      expect(screen.queryByRole('button', { name: /Sposta/ })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Riordina' }));

      expect(
        (
          screen.getByRole('button', {
            name: 'Sposta A più in alto',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: 'Sposta B più in basso',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: 'Sposta A più in basso',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Fatto' }));
      expect(screen.queryByRole('button', { name: /Sposta/ })).toBeNull();
    });

    it('sends the whole sibling group with the two swapped, and shows the order the API answers with', async () => {
      const a = term({ id: 'a', name: { it: 'A' } });
      const b = term({ id: 'b', name: { it: 'B' } });
      const c = term({ id: 'c', name: { it: 'C' } });
      vi.mocked(api.reorderTerms).mockResolvedValue([b, a, c]);
      renderEditor([a, b, c]);
      await screen.findByRole('link', { name: /^A/ });
      fireEvent.click(screen.getByRole('button', { name: 'Riordina' }));

      fireEvent.click(
        screen.getByRole('button', { name: 'Sposta A più in basso' }),
      );

      await waitFor(() =>
        expect(api.reorderTerms).toHaveBeenCalledWith('taxonomy-1', {
          parentId: null,
          orderedTermIds: ['b', 'a', 'c'],
        }),
      );
      await waitFor(() => expect(treeNames()).toEqual(['B', 'A', 'C']));
    });

    it('moves a child only among its own siblings, naming its parent', async () => {
      const top = term({ id: 'top', name: { it: 'Top' } });
      const x = term({ id: 'x', name: { it: 'X' }, parentId: 'top' });
      const y = term({ id: 'y', name: { it: 'Y' }, parentId: 'top' });
      vi.mocked(api.reorderTerms).mockResolvedValue([top, y, x]);
      renderEditor([top, x, y]);
      await screen.findByRole('link', { name: /^Top/ });
      fireEvent.click(screen.getByRole('button', { name: 'Riordina' }));
      // Top is alone at the top: it has nothing to move past.
      expect(screen.queryByRole('button', { name: /Sposta Top/ })).toBeNull();

      fireEvent.click(
        screen.getByRole('button', { name: 'Sposta X più in basso' }),
      );

      await waitFor(() =>
        expect(api.reorderTerms).toHaveBeenCalledWith('taxonomy-1', {
          parentId: 'top',
          orderedTermIds: ['y', 'x'],
        }),
      );
    });

    it('says when the order could not be changed, and leaves the list as it was', async () => {
      vi.mocked(api.reorderTerms).mockRejectedValue(new Error('boom'));
      renderEditor([
        term({ id: 'a', name: { it: 'A' } }),
        term({ id: 'b', name: { it: 'B' } }),
      ]);
      await screen.findByRole('link', { name: /^A/ });
      fireEvent.click(screen.getByRole('button', { name: 'Riordina' }));

      fireEvent.click(
        screen.getByRole('button', { name: 'Sposta A più in basso' }),
      );

      expect(
        await screen.findByText(/non è stato possibile cambiare l’ordine/i),
      ).toBeTruthy();
      expect(treeNames()).toEqual(['A', 'B']);
    });
  });
});
