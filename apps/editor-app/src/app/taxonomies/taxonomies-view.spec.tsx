import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  buildSiteRecord,
  buildTaxonomyRecord,
  buildTermRecord,
} from '@kometio/testing/records';
import { WithToasts } from '../../test/toasts.test-fixture';
import * as api from '../../lib/taxonomies-api-client';
import * as sitesApi from '../../lib/sites-api-client';
import type { TaxonomyRecord } from '../../lib/taxonomies-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TaxonomiesView } from './taxonomies-view';
import { ApiError } from '../../lib/http-client';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

vi.mock('../../lib/taxonomies-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/taxonomies-api-client')>();
  return {
    ...actual,
    listTaxonomies: vi.fn(),
    listTerms: vi.fn(),
    createTaxonomy: vi.fn(),
    updateTaxonomy: vi.fn(),
    deleteTaxonomy: vi.fn(),
  };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, getCurrentSite: vi.fn() };
});

const taxonomy = buildTaxonomyRecord();

function renderView(
  taxonomies: TaxonomyRecord[],
  terms: api.TermRecord[] = [],
) {
  vi.mocked(api.listTaxonomies).mockResolvedValue(taxonomies);
  vi.mocked(api.listTerms).mockResolvedValue(terms);
  vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(
    buildSiteRecord({ enabledLocales: ['it', 'en'] }),
  );
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <TaxonomiesView siteId="site-1" />
      </WithToasts>
    </QueryClientProvider>,
  );
}

/** The New category dialog, open and with a name typed. */
async function openNewDialog(name = 'Famiglia') {
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Nuova categoria' }))[0],
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Nome'), {
    target: { value: name },
  });
  return dialog;
}

describe('TaxonomiesView', () => {
  afterEach(() => vi.clearAllMocks());

  /*
   * "No category yet." was the whole message, about a concept a client has
   * never met — it said the screen was empty and nothing about what would
   * fill it, or how.
   */
  it('shows an empty state that explains what a category is, and makes one from it', async () => {
    renderView([]);

    expect(
      await screen.findByText(/Una categoria è un modo di classificare/),
    ).toBeTruthy();
    // The header's button, and the one under the explanation.
    const buttons = screen.getAllByRole('button', { name: 'Nuova categoria' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  /*
   * The three states of a prefix are the whole reason the API takes it
   * as `absent | null | string` (docs/adr/0064), and the dialog is where
   * they are decided. Absent means "derive one from the name" — sending
   * an empty string instead would ask for an empty URL segment.
   */
  it('leaves the prefix out entirely when none was typed, and nests terms as it always did', async () => {
    renderView([]);
    const dialog = await openNewDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(vi.mocked(api.createTaxonomy)).toHaveBeenCalledWith({
        siteId: 'site-1',
        name: { it: 'Famiglia' },
        hierarchical: true,
      }),
    );
  });

  it('sends a null prefix when the category is mounted at the root', async () => {
    renderView([]);
    const dialog = await openNewDialog();

    fireEvent.click(
      within(dialog).getByLabelText('Nessun prefisso (radice del sito)'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(vi.mocked(api.createTaxonomy)).toHaveBeenCalledWith({
        siteId: 'site-1',
        name: { it: 'Famiglia' },
        prefix: null,
        hierarchical: true,
      }),
    );
  });

  it('sends the prefix that was typed', async () => {
    renderView([]);
    const dialog = await openNewDialog();

    fireEvent.change(within(dialog).getByLabelText('Prefisso URL'), {
      target: { value: 'fam' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(vi.mocked(api.createTaxonomy)).toHaveBeenCalledWith({
        siteId: 'site-1',
        name: { it: 'Famiglia' },
        prefix: 'fam',
        hierarchical: true,
      }),
    );
  });

  it('can make a flat category, with no terms inside terms', async () => {
    renderView([]);
    const dialog = await openNewDialog();

    fireEvent.click(
      within(dialog).getByLabelText('Termini annidati (gerarchia)'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(vi.mocked(api.createTaxonomy)).toHaveBeenCalledWith(
        expect.objectContaining({ hierarchical: false }),
      ),
    );
  });

  it('says it was made, and closes', async () => {
    vi.mocked(api.createTaxonomy).mockResolvedValue(
      buildTaxonomyRecord({ name: { it: 'Famiglia' } }),
    );
    renderView([]);
    const dialog = await openNewDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    expect(await screen.findByText('Categoria “Famiglia” creata')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports a taken address in words a person can act on, in the dialog', async () => {
    renderView([]);
    vi.mocked(api.createTaxonomy).mockRejectedValue(
      new ApiError(409, { message: 'taken', statusCode: 409 }),
    );
    const dialog = await openNewDialog('Categoria');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Crea' }));

    expect(
      await within(dialog).findByText(
        'Un’altra categoria o una pagina risponde già a quell’indirizzo.',
      ),
    ).toBeTruthy();
    // Still open, the name still there.
    expect(within(dialog).getByLabelText<HTMLInputElement>('Nome').value).toBe(
      'Categoria',
    );
  });

  it('shows where the terms of a category answer, and that it cannot be moved', async () => {
    renderView([taxonomy, { ...taxonomy, id: 'taxonomy-2', prefix: null }]);

    expect(await screen.findByText('/categoria/…')).toBeTruthy();
    expect(screen.getByText('alla radice del sito')).toBeTruthy();
    expect(
      screen.getAllByText(
        'Non si cambia dopo la creazione: gli indirizzi dei termini esistenti si romperebbero.',
      ),
    ).toHaveLength(2);
    // Not a field: nothing in the list offers to retype it.
    expect(screen.queryByLabelText('Prefisso URL')).toBeNull();
  });

  it('names a category with a heading, and gives it an address the term pages can point at', async () => {
    renderView([taxonomy]);

    const heading = await screen.findByRole('heading', {
      name: taxonomy.name.it,
    });
    expect(heading.closest('section')?.id).toBe('taxonomy-1');
  });

  it('renames a category in a dialog, and says so', async () => {
    vi.mocked(api.updateTaxonomy).mockResolvedValue({
      ...taxonomy,
      name: { it: 'Famiglia' },
    });
    renderView([taxonomy]);

    fireEvent.click(await screen.findByRole('button', { name: 'Rinomina' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText<HTMLInputElement>('Nome');
    expect(field.value).toBe(taxonomy.name.it);
    fireEvent.change(field, { target: { value: 'Famiglia' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rinomina' }));

    await waitFor(() =>
      expect(vi.mocked(api.updateTaxonomy)).toHaveBeenCalledWith('taxonomy-1', {
        name: { ...taxonomy.name, it: 'Famiglia' },
      }),
    );
    expect(
      await screen.findByText('Categoria rinominata in “Famiglia”'),
    ).toBeTruthy();
  });

  /*
   * "Delete this, with its forty terms?" and "delete this?" are different
   * decisions: the question names the category and says how many go.
   */
  it('asks before deleting a category, naming it and how many terms go with it', async () => {
    vi.mocked(api.deleteTaxonomy).mockResolvedValue(undefined);
    renderView(
      [taxonomy],
      [
        buildTermRecord({ id: 't1', taxonomyId: taxonomy.id }),
        buildTermRecord({ id: 't2', taxonomyId: taxonomy.id }),
      ],
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Elimina' }));

    const dialog = await screen.findByRole('alertdialog');
    within(dialog).getByText(`Eliminare la categoria “${taxonomy.name.it}”?`);
    await within(dialog).findByText(/I suoi 2 termini verranno eliminati/);
    expect(vi.mocked(api.deleteTaxonomy)).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));

    await waitFor(() =>
      expect(vi.mocked(api.deleteTaxonomy)).toHaveBeenCalledWith('taxonomy-1'),
    );
    expect(
      await screen.findByText(`Categoria “${taxonomy.name.it}” eliminata`),
    ).toBeTruthy();
  });
});
