import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/taxonomies-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { buildTaxonomyRecord, buildTermRecord } from '@kometio/testing/records';
import { PageGroupTermsDialog } from './page-group-terms-dialog';

vi.mock('../../lib/taxonomies-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/taxonomies-api-client')>();
  return {
    ...actual,
    listTaxonomies: vi.fn(),
    listTerms: vi.fn(),
    getPageGroupTerms: vi.fn(),
    setPageGroupTerms: vi.fn(),
  };
});

const taxonomy = buildTaxonomyRecord({ name: { it: 'Categoria' } });

const espresso = buildTermRecord({
  name: { it: 'Espresso' },
  slugs: { it: 'espresso' },
});

function renderDialog(assigned: string[]) {
  vi.mocked(api.listTaxonomies).mockResolvedValue([taxonomy]);
  vi.mocked(api.listTerms).mockResolvedValue([
    espresso,
    { ...espresso, id: 'term-2', name: { it: 'Moka' }, slugs: { it: 'moka' } },
  ]);
  vi.mocked(api.getPageGroupTerms).mockResolvedValue({ termIds: assigned });
  vi.mocked(api.setPageGroupTerms).mockResolvedValue({ termIds: assigned });
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <PageGroupTermsDialog
          groupId="group-1"
          siteId="site-1"
          open
          onOpenChange={() => undefined}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('PageGroupTermsDialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('groups the terms under the dimension they belong to', async () => {
    renderDialog([]);

    expect(await screen.findByText('Categoria')).toBeTruthy();
    expect(screen.getByLabelText('Espresso')).toBeTruthy();
    expect(screen.getByLabelText('Moka')).toBeTruthy();
  });

  it('shows what the page already carries', async () => {
    renderDialog(['term-2']);

    await waitFor(() =>
      expect(screen.getByLabelText('Moka').getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(screen.getByLabelText('Espresso').getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  /*
   * The whole set, not a diff — that is what the endpoint takes and what
   * the editor knows: the boxes that are ticked (docs/adr/0064).
   */
  it('sends the whole set when a term is ticked', async () => {
    renderDialog(['term-2']);
    await waitFor(() =>
      expect(screen.getByLabelText('Moka').getAttribute('aria-checked')).toBe(
        'true',
      ),
    );

    fireEvent.click(screen.getByLabelText('Espresso'));

    await waitFor(() =>
      expect(vi.mocked(api.setPageGroupTerms)).toHaveBeenCalledWith('group-1', [
        'term-2',
        'term-1',
      ]),
    );
  });

  it('says the classification was saved, and says so when it was not', async () => {
    renderDialog(['term-2']);
    await waitFor(() =>
      expect(screen.getByLabelText('Moka').getAttribute('aria-checked')).toBe(
        'true',
      ),
    );

    fireEvent.click(screen.getByLabelText('Espresso'));
    expect(
      await screen.findByText('Categorie della pagina salvate'),
    ).toBeTruthy();

    vi.mocked(api.setPageGroupTerms).mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByLabelText('Moka'));
    expect(
      await screen.findByText(
        'Le categorie della pagina non sono state salvate. Riprova.',
      ),
    ).toBeTruthy();
  });

  it('sends what is left when a term is unticked', async () => {
    renderDialog(['term-1', 'term-2']);
    await waitFor(() =>
      expect(
        screen.getByLabelText('Espresso').getAttribute('aria-checked'),
      ).toBe('true'),
    );

    fireEvent.click(screen.getByLabelText('Espresso'));

    await waitFor(() =>
      expect(vi.mocked(api.setPageGroupTerms)).toHaveBeenCalledWith('group-1', [
        'term-2',
      ]),
    );
  });

  /* It is the same set in every language, and the dialog has to say so. */
  it('says the classification is shared by every language of the page', async () => {
    renderDialog([]);

    expect(
      await screen.findByText(
        'La stessa per tutte le lingue di questa pagina.',
      ),
    ).toBeTruthy();
  });
});
