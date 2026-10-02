import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { buildTaxonomyRecord, buildTermRecord } from '@kometio/testing/records';
import * as api from '../../lib/taxonomies-api-client';
import type { TermRecord } from '../../lib/taxonomies-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { optionNames } from '../../test/select.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { TermEditorView } from './term-editor-view';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
  useNavigate: vi.fn(),
  // No router around this view, and the blocker needs one: leaving with
  // work unsaved is tested where the bar is (save-bar.spec).
  useBlocker: () => ({ status: 'idle' as const }),
}));

vi.mock('../../lib/taxonomies-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/taxonomies-api-client')>();
  return {
    ...actual,
    updateTerm: vi.fn(),
    moveTerm: vi.fn(),
    deleteTerm: vi.fn(),
  };
});

const taxonomy = buildTaxonomyRecord({ name: { it: 'Argomento' } });

function term(overrides: Partial<TermRecord> & { id: string }): TermRecord {
  return buildTermRecord({
    taxonomyId: taxonomy.id,
    name: { it: overrides.id },
    slugs: { it: overrides.id },
    ...overrides,
  });
}

const macchine = term({
  id: 'macchine',
  name: { it: 'Macchine', en: 'Machines' },
  slugs: { it: 'macchine', en: 'machines' },
});

function renderEditor(
  current: TermRecord = macchine,
  terms: TermRecord[] = [current],
  hierarchical = true,
) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <TermEditorView
          siteId="site-1"
          taxonomy={{ ...taxonomy, hierarchical }}
          term={current}
          terms={terms}
          locales={['it', 'en']}
          defaultLocale="it"
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

/** The fields of one language: each has its own group, named by the language. */
function language(code: 'IT' | 'EN') {
  return within(
    screen.getByRole('group', { name: new RegExp(`^${code}\\b`, 'i') }),
  );
}

describe('TermEditorView', () => {
  afterEach(() => vi.clearAllMocks());

  it('says where you are: a way back up the trail, the term as the title, its category under it', () => {
    renderEditor();

    const trail = screen.getByRole('navigation', { name: 'Dove ti trovi' });
    expect(
      within(trail)
        .getByRole('link', { name: 'Categorie' })
        .getAttribute('href'),
    ).toBe('/taxonomies');
    expect(within(trail).getByRole('link', { name: 'Argomento' })).toBeTruthy();
    expect(within(trail).getByText('Macchine')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Macchine' })).toBeTruthy();
    expect(screen.getByText('Categoria Argomento')).toBeTruthy();
  });

  it('has the name, the address and the text of each language, each with its label', () => {
    renderEditor();

    expect(language('IT').getByLabelText<HTMLInputElement>('Nome').value).toBe(
      'Macchine',
    );
    expect(language('EN').getByLabelText<HTMLInputElement>('Slug').value).toBe(
      'machines',
    );
    expect(language('EN').getByLabelText('Descrizione')).toBeTruthy();
  });

  it('shows the whole address as it will answer, following what is typed', () => {
    renderEditor();
    expect(screen.getByText('Indirizzo: /categoria/macchine')).toBeTruthy();

    fireEvent.change(language('IT').getByLabelText('Slug'), {
      target: { value: 'caffe' },
    });

    expect(screen.getByText('Indirizzo: /categoria/caffe')).toBeTruthy();
  });

  describe('saving', () => {
    it('shows no bar until something changes, then saves everything in one go', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue({
        ...macchine,
        name: { ...macchine.name, it: 'Macchine da caffè' },
      });
      renderEditor();
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();

      fireEvent.change(language('IT').getByLabelText('Nome'), {
        target: { value: 'Macchine da caffè' },
      });
      // Nothing was sent when the cursor left the field, as it used to be.
      expect(api.updateTerm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateTerm).toHaveBeenCalledWith('macchine', {
          name: { it: 'Macchine da caffè', en: 'Machines' },
          description: {},
          slugs: { it: 'macchine', en: 'machines' },
          noindex: false,
          landingPageGroupId: null,
        }),
      );
      // Said, and the bar gone.
      expect(await screen.findByText('Salvato')).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull(),
      );
    });

    // An emptied slug is not an empty address: the term is not published in
    // that language at all.
    it('drops a language from the addresses when its slug is cleared', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue(macchine);
      renderEditor();

      fireEvent.change(language('EN').getByLabelText('Slug'), {
        target: { value: '  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateTerm).toHaveBeenCalledWith(
          'macchine',
          expect.objectContaining({ slugs: { it: 'macchine' } }),
        ),
      );
    });

    it('puts the cancelled edits back', () => {
      renderEditor();
      const name = language('IT').getByLabelText<HTMLInputElement>('Nome');

      fireEvent.change(name, { target: { value: 'Altro' } });
      fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

      expect(name.value).toBe('Macchine');
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    });

    it('says an address is taken when the API says so, and keeps the work', async () => {
      vi.mocked(api.updateTerm).mockRejectedValue(
        new ApiError(409, { message: 'taken', statusCode: 409 }),
      );
      renderEditor();

      fireEvent.change(language('IT').getByLabelText('Slug'), {
        target: { value: 'occupato' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      expect(
        await screen.findByText(
          "Quell'indirizzo è già occupato da un altro termine o da una pagina.",
        ),
      ).toBeTruthy();
      expect(
        language('IT').getByLabelText<HTMLInputElement>('Slug').value,
      ).toBe('occupato');
    });
  });

  describe('the switches and the page', () => {
    it('keeps a term out of the search engines by a labelled box, saved with the rest', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue({
        ...macchine,
        noindex: true,
      });
      renderEditor();

      const box = screen.getByRole('checkbox', {
        name: /fuori dai motori di ricerca/i,
      });
      expect(box.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(box);
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateTerm).toHaveBeenCalledWith(
          'macchine',
          expect.objectContaining({ noindex: true }),
        ),
      );
    });

    it('lets a term go back to the default layout, and sends null rather than leaving it out', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue(macchine);
      renderEditor(term({ ...macchine, landingPageGroupId: 'page-9' }));

      fireEvent.click(
        screen.getByRole('button', { name: /disposizione predefinita/i }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateTerm).toHaveBeenCalledWith(
          'macchine',
          expect.objectContaining({ landingPageGroupId: null }),
        ),
      );
    });
  });

  describe('where it sits', () => {
    const parent = term({ id: 'parent', name: { it: 'Parent' } });
    const child = term({
      id: 'child',
      name: { it: 'Child' },
      parentId: 'parent',
    });
    const grandchild = term({
      id: 'grandchild',
      name: { it: 'Grandchild' },
      parentId: 'child',
    });
    const other = term({ id: 'other', name: { it: 'Other' } });

    // The API refuses a term as its own descendant, and offering the
    // choice would be offering an error.
    it('never offers a term its own branch as a parent', () => {
      renderEditor(parent, [parent, child, grandchild, other]);

      expect(optionNames(screen.getByLabelText('Dentro'))).toEqual([
        'Primo livello',
        'Other',
      ]);
    });

    it('moves the term by its own call when the parent changed, after saving its fields', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue(child);
      vi.mocked(api.moveTerm).mockResolvedValue({ ...child, parentId: null });
      renderEditor(child, [parent, child, other]);

      fireEvent.click(screen.getByLabelText('Dentro'));
      fireEvent.click(screen.getByRole('option', { name: 'Primo livello' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.moveTerm).toHaveBeenCalledWith('child', null),
      );
      expect(api.updateTerm).toHaveBeenCalled();
    });

    it('does not move it when only something else changed', async () => {
      vi.mocked(api.updateTerm).mockResolvedValue(child);
      renderEditor(child, [parent, child]);

      fireEvent.change(language('IT').getByLabelText('Nome'), {
        target: { value: 'Figlio' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() => expect(api.updateTerm).toHaveBeenCalled());
      expect(api.moveTerm).not.toHaveBeenCalled();
    });

    it('asks for no parent in a category without a hierarchy', () => {
      renderEditor(macchine, [macchine], false);

      expect(screen.queryByLabelText('Dentro')).toBeNull();
    });
  });

  it('has its SEO in a dialog of its own, and says it saves on its own', () => {
    renderEditor();

    expect(
      screen.getAllByText('Si salva a parte, dalla sua finestra.'),
    ).toHaveLength(2);
    fireEvent.click(language('IT').getByRole('button', { name: 'SEO' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  describe('deleting', () => {
    it('asks first, and says that what is inside it is not deleted with it', () => {
      renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Elimina termine' }));

      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText(/salgono al primo livello/)).toBeTruthy();
      expect(api.deleteTerm).not.toHaveBeenCalled();
    });

    it('deletes it, says so, and goes back to the categories', async () => {
      const navigate = vi.fn();
      vi.mocked(router.useNavigate).mockReturnValue(navigate);
      vi.mocked(api.deleteTerm).mockResolvedValue(undefined);
      renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Elimina termine' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Elimina',
        }),
      );

      await waitFor(() =>
        expect(api.deleteTerm).toHaveBeenCalledWith('macchine'),
      );
      expect(
        await screen.findByText('Termine “Macchine” eliminato'),
      ).toBeTruthy();
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: '/taxonomies' }),
      );
    });

    it('says why it could not be deleted, and stays', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(api.deleteTerm).mockRejectedValue(
        new ApiError(500, { message: 'Database is unavailable' }),
      );
      renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Elimina termine' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Elimina',
        }),
      );

      expect(await screen.findByText('Database is unavailable')).toBeTruthy();
    });
  });
});
