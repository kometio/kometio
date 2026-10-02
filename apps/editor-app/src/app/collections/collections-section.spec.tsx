import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { chooseOption } from '../../test/select.test-fixture';
import { ApiError } from '../../lib/http-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCollectionRecord,
  buildReusableSectionListItem,
} from '@kometio/testing/records';
import { WithToasts } from '../../test/toasts.test-fixture';
import * as collectionsApi from '../../lib/collections-api-client';
import * as sectionsApi from '../../lib/reusable-sections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { CollectionsSection } from './collections-section';

vi.mock('../../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/reusable-sections-api-client')
    >();
  return { ...actual, listReusableSections: vi.fn() };
});

vi.mock('../../lib/collections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/collections-api-client')>();
  return {
    ...actual,
    listCollections: vi.fn(),
    updateCollection: vi.fn(),
    createCollection: vi.fn(),
  };
});

const news = buildCollectionRecord({
  id: 'news',
  defaultTemplateId: 'article',
});

function template(
  id: string,
  name: string,
): sectionsApi.ReusableSectionListItem {
  return buildReusableSectionListItem({
    id,
    name,
    kind: 'template',
    status: 'published',
    publishedContent: [],
  });
}

function renderSection(
  sections: sectionsApi.ReusableSectionListItem[] = [
    template('article', 'Articolo blog'),
    template('event', 'Evento'),
  ],
) {
  vi.mocked(collectionsApi.listCollections).mockResolvedValue([news]);
  vi.mocked(sectionsApi.listReusableSections).mockResolvedValue(sections);
  vi.mocked(collectionsApi.updateCollection).mockResolvedValue(news);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <CollectionsSection siteId="site-1" />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('CollectionsSection — default template', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows what new pages of each collection start from, and changes it', async () => {
    renderSection();

    const select = await screen.findByRole('combobox', {
      name: 'Nuove pagine da',
    });
    expect(select.textContent).toBe('Articolo blog');

    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Evento' }));

    await waitFor(() =>
      expect(collectionsApi.updateCollection).toHaveBeenCalledWith('news', {
        defaultTemplateId: 'event',
      }),
    );
    // Said, since the select alone does not tell that it was kept.
    expect(
      await screen.findByText('Punto di partenza di “News” cambiato'),
    ).toBeTruthy();
  });

  it('clears it with a blank page', async () => {
    renderSection();

    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Nuove pagine da' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Pagina vuota' }));

    await waitFor(() =>
      expect(collectionsApi.updateCollection).toHaveBeenCalledWith('news', {
        defaultTemplateId: null,
      }),
    );
  });

  /*
   * The database clears a default when its template is deleted, but a
   * cached collection can still carry the old id for a while. It must read
   * as a blank page, not as an empty box.
   */
  it('shows a default that is no longer a template as a blank page', async () => {
    renderSection([template('event', 'Evento')]);

    const select = await screen.findByRole('combobox', {
      name: 'Nuove pagine da',
    });
    expect(select.textContent).toBe('Pagina vuota');
  });

  it('asks nothing about templates on a site that has none', async () => {
    renderSection([]);

    await screen.findByDisplayValue('News');
    await waitFor(() =>
      expect(sectionsApi.listReusableSections).toHaveBeenCalled(),
    );
    expect(screen.queryByText('Nuove pagine da')).toBeNull();
  });
});

describe('CollectionsSection — a new collection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts from the default icon again after one is created with another', async () => {
    renderSection();
    vi.mocked(collectionsApi.createCollection).mockResolvedValue(
      buildCollectionRecord({ id: 'events', name: 'Eventi', icon: 'star' }),
    );
    // The row's own icon comes first; the one for the new collection is last.
    const newIcon = async () =>
      (await screen.findAllByRole('combobox', { name: 'Icona' })).at(-1);

    fireEvent.change(await screen.findByPlaceholderText('News'), {
      target: { value: 'Eventi' },
    });
    chooseOption((await newIcon()) as HTMLElement, 'In evidenza');
    expect((await newIcon())?.textContent).toContain('In evidenza');
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));

    await waitFor(() =>
      expect(collectionsApi.createCollection).toHaveBeenCalledWith({
        siteId: 'site-1',
        name: 'Eventi',
        icon: 'star',
      }),
    );
    await waitFor(async () =>
      expect((await newIcon())?.textContent).toContain('Notizie'),
    );
  });

  it('names each icon by what it is used for, not by its shape', async () => {
    renderSection();

    const icon = (await screen.findAllByRole('combobox', { name: 'Icona' })).at(
      -1,
    ) as HTMLElement;
    fireEvent.click(icon);

    const names = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(names).toContain('Eventi');
    expect(names).toContain('Portfolio');
    expect(names).not.toContain('Calendario');
  });
});

describe('CollectionsSection — changing a collection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const nameField = async () =>
    (await screen.findByLabelText('Nome')) as HTMLInputElement;

  it('does not save a name on leaving the field', async () => {
    renderSection();

    const name = await nameField();
    fireEvent.change(name, { target: { value: 'Notizie' } });
    fireEvent.blur(name);

    expect(collectionsApi.updateCollection).not.toHaveBeenCalled();
    // What there is to do about it, on the row.
    expect(screen.getByRole('button', { name: 'Salva' })).toBeTruthy();
  });

  it('saves a new name with the row’s own Save, and says so', async () => {
    renderSection();
    const renamed = { ...news, name: 'Notizie' };
    vi.mocked(collectionsApi.updateCollection).mockResolvedValue(renamed);
    // The list as the server has it once the save is in.
    vi.mocked(collectionsApi.listCollections).mockResolvedValue([renamed]);

    fireEvent.change(await nameField(), { target: { value: '  Notizie ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(collectionsApi.updateCollection).toHaveBeenCalledWith('news', {
        name: 'Notizie',
      }),
    );
    expect(
      await screen.findByText('Collezione “Notizie” aggiornata'),
    ).toBeTruthy();
    // Nothing left to save, so no button.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull(),
    );
  });

  it('changes the icon afterwards, from a list with names', async () => {
    renderSection();
    vi.mocked(collectionsApi.updateCollection).mockResolvedValue({
      ...news,
      icon: 'calendar-days',
    });

    // The row is there once its name is; its icon comes before the new one's.
    await nameField();
    const icons = await screen.findAllByRole('combobox', { name: 'Icona' });
    chooseOption(icons[0], 'Eventi');
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(collectionsApi.updateCollection).toHaveBeenCalledWith('news', {
        icon: 'calendar-days',
      }),
    );
  });

  it('sends the name and the icon together when both changed', async () => {
    vi.mocked(collectionsApi.updateCollection).mockResolvedValue(news);
    renderSection();

    fireEvent.change(await nameField(), { target: { value: 'Eventi' } });
    chooseOption(
      (await screen.findAllByRole('combobox', { name: 'Icona' }))[0],
      'Eventi',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(collectionsApi.updateCollection).toHaveBeenCalledWith('news', {
        name: 'Eventi',
        icon: 'calendar-days',
      }),
    );
  });

  it('puts the row back on Cancel', async () => {
    renderSection();

    const name = await nameField();
    fireEvent.change(name, { target: { value: 'Altro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(name.value).toBe('News');
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
  });

  it('will not save an empty name, and says so on the row', async () => {
    renderSection();

    const name = await nameField();
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(
      await screen.findByText('Scrivi il nome della collezione.'),
    ).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(collectionsApi.updateCollection).not.toHaveBeenCalled();
  });

  it('keeps what was typed, and says why, when the server refuses it', async () => {
    renderSection();
    vi.mocked(collectionsApi.updateCollection).mockRejectedValue(
      new ApiError(409, {
        message: 'Esiste già una collezione con questo nome',
      }),
    );

    const name = await nameField();
    fireEvent.change(name, { target: { value: 'Eventi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    expect(
      await screen.findByText('Esiste già una collezione con questo nome'),
    ).toBeTruthy();
    expect(name.value).toBe('Eventi');
    expect(screen.getByRole('button', { name: 'Salva' })).toBeTruthy();
  });

  it('writes the word on the delete button, and names the collection for a screen reader', async () => {
    renderSection();

    const del = await screen.findByRole('button', { name: 'Elimina News' });
    expect(del.textContent).toBe('Elimina');
  });
});

describe('CollectionsSection — before there is one', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('says what a collection is, and the button goes to the field that names the first', async () => {
    vi.mocked(collectionsApi.listCollections).mockResolvedValue([]);
    vi.mocked(sectionsApi.listReusableSections).mockResolvedValue([]);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <WithToasts>
          <CollectionsSection siteId="site-1" />
        </WithToasts>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        /una collezione tiene insieme pagine dello stesso tipo/i,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nuova collezione' }));

    expect(document.activeElement).toBe(screen.getByPlaceholderText('News'));
  });

  it('shows rows while the list loads', async () => {
    vi.mocked(collectionsApi.listCollections).mockReturnValue(
      new Promise(() => undefined),
    );
    vi.mocked(sectionsApi.listReusableSections).mockResolvedValue([]);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <WithToasts>
          <CollectionsSection siteId="site-1" />
        </WithToasts>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="skeleton-rows"]'),
      ).not.toBeNull(),
    );
    expect(screen.queryByText(/nessuna collezione/i)).toBeNull();
  });
});
