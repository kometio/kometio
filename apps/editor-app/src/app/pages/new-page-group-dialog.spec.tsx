import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import {
  buildCollectionRecord,
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildPageGroupRecord,
  buildPageTranslationRecord,
  buildReusableSectionListItem,
} from '@kometio/testing/records';
import * as collectionsApi from '../../lib/collections-api-client';
import * as generationApi from '../../lib/page-generation-api-client';
import { ApiError } from '../../lib/http-client';
import * as pageGroupsApi from '../../lib/page-groups-api-client';
import * as sectionsApi from '../../lib/reusable-sections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { NewPageGroupDialog } from './new-page-group-dialog';
import type { NewPageGroupInput } from './use-page-groups-list';

vi.mock('../../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/reusable-sections-api-client')
    >();
  return { ...actual, listReusableSections: vi.fn() };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroups: vi.fn(),
    getPageGroup: vi.fn(),
    listPageGroupTranslations: vi.fn(),
  };
});

vi.mock('../../lib/page-generation-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/page-generation-api-client')
  >()),
  getPageGenerationStatus: vi.fn(),
}));

vi.mock('../../lib/collections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/collections-api-client')>();
  return { ...actual, listCollections: vi.fn() };
});

function section(
  overrides: Partial<sectionsApi.ReusableSectionListItem>,
): sectionsApi.ReusableSectionListItem {
  const blocks = [{ id: 'hero-1', type: 'Hero', props: { title: 'Hi' } }];
  return buildReusableSectionListItem({
    kind: 'template',
    status: 'published',
    content: blocks,
    publishedContent: blocks,
    ...overrides,
  });
}

const serviceTemplate = section({ id: 'service', name: 'Scheda servizio' });
const articleTemplate = section({ id: 'article', name: 'Articolo blog' });

function renderDialog({
  sections = [serviceTemplate, articleTemplate],
  collectionId = null,
  defaultTemplateId = null,
  onCreate = vi.fn<(input: NewPageGroupInput) => Promise<unknown>>(() =>
    Promise.resolve(),
  ),
  existingPages = [],
  generation = 'not-configured',
}: {
  /** A promise to hold the answer back, for what the dialog does while it waits. */
  sections?:
    | sectionsApi.ReusableSectionListItem[]
    | Promise<sectionsApi.ReusableSectionListItem[]>;
  collectionId?: string | null;
  defaultTemplateId?: string | null;
  onCreate?: (input: NewPageGroupInput) => Promise<unknown>;
  /** What the parent choice offers — empty unless a test is about it. */
  existingPages?: PageGroupListItemRecord[];
  /** Whether the site can generate a page — off unless a test is about it. */
  generation?: 'ready' | 'not-configured';
} = {}) {
  vi.mocked(generationApi.getPageGenerationStatus).mockResolvedValue({
    availability: generation,
  });
  vi.mocked(sectionsApi.listReusableSections).mockReturnValue(
    Promise.resolve(sections),
  );
  vi.mocked(collectionsApi.listCollections).mockResolvedValue([
    buildCollectionRecord({ id: 'news', defaultTemplateId }),
  ]);
  vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
    items: existingPages,
    total: existingPages.length,
  });
  // What the full-address preview reads: a parent at the top of the tree
  // with no address of its own, unless a test is about the walk up.
  vi.mocked(pageGroupsApi.getPageGroup).mockImplementation((id) =>
    Promise.resolve(buildPageGroupRecord({ id })),
  );
  vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([]);
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <NewPageGroupDialog
        siteId="site-1"
        defaultLocale="it"
        collectionId={collectionId}
        open
        onOpenChange={vi.fn()}
        onCreate={onCreate}
      />
    </QueryClientProvider>,
  );
  return { onCreate };
}

function typeName(name: string) {
  fireEvent.change(screen.getByLabelText('Nome pagina'), {
    target: { value: name },
  });
}

describe('NewPageGroupDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * A page created inside another one starts at its address: until now
   * every new page landed at the root and the only way down was to move
   * it afterwards, which did not exist either (docs/adr/0074).
   */
  it('creates the page under the page chosen as its parent', async () => {
    const { onCreate } = renderDialog({
      sections: [],
      existingPages: [
        buildPageGroupListItemRecord({
          id: 'services',
          translations: [
            buildPageGroupListItemTranslation({
              slug: 'servizi',
              title: 'Servizi',
            }),
          ],
        }),
      ],
    });

    typeName('Idraulica');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagina genitore' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Servizi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Idraulica',
        templateId: null,
        parentId: 'services',
      }),
    );
  });

  /*
   * Under a parent a page's address is the parent's and then its own. The
   * preview used to say "/idraulica" and leave the person to find out.
   */
  it('previews the whole address of a page under a parent, from the top of the tree', async () => {
    renderDialog({
      sections: [],
      existingPages: [
        buildPageGroupListItemRecord({
          id: 'services',
          translations: [
            buildPageGroupListItemTranslation({
              slug: 'servizi',
              title: 'Servizi',
            }),
          ],
        }),
      ],
    });

    vi.mocked(pageGroupsApi.getPageGroup).mockImplementation((id) =>
      Promise.resolve(
        buildPageGroupRecord({
          id,
          parentId: id === 'services' ? 'about' : null,
        }),
      ),
    );
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockImplementation(
      (id) =>
        Promise.resolve([
          buildPageTranslationRecord({
            pageGroupId: id,
            locale: 'it',
            slug: id === 'services' ? 'servizi' : 'chi-siamo',
          }),
        ]),
    );
    typeName('Idraulica');
    expect(screen.getByText('URL: /idraulica')).toBeTruthy();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagina genitore' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Servizi/ }));

    expect(
      await screen.findByText('URL: /chi-siamo/servizi/idraulica'),
    ).toBeTruthy();
  });

  it('asks nothing about templates on a site that has none', async () => {
    const { onCreate } = renderDialog({ sections: [] });

    typeName('Chi siamo');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Crea' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    expect(screen.queryByText('Parti da')).toBeNull();
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Chi siamo',
        templateId: null,
        parentId: null,
      }),
    );
  });

  /*
   * Pressed before the templates have answered, Create would make a blank
   * page nobody chose — inside a collection whose default is a template.
   */
  it('keeps Create disabled until the templates and the collection have answered', async () => {
    let answerTemplates: (
      sections: sectionsApi.ReusableSectionListItem[],
    ) => void = () => undefined;
    renderDialog({
      collectionId: 'news',
      defaultTemplateId: 'article',
      sections: new Promise((resolve) => {
        answerTemplates = resolve;
      }),
    });

    typeName('Nuovo articolo');
    const create = screen.getByRole('button', { name: 'Crea' });
    expect(create.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      answerTemplates([articleTemplate]);
    });

    await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('combobox', { name: 'Parti da' }).textContent).toBe(
      'Articolo blog',
    );
  });

  it('offers only published templates — never a shared section, never a draft', async () => {
    renderDialog({
      sections: [
        serviceTemplate,
        section({ id: 'newsletter', name: 'Newsletter', kind: 'shared' }),
        section({
          id: 'unfinished',
          name: 'Bozza di template',
          status: 'draft',
          publishedContent: null,
        }),
      ],
    });

    fireEvent.click(await screen.findByRole('combobox', { name: 'Parti da' }));

    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Pagina vuota', 'Scheda servizio']);
  });

  it('starts blank on the Pages screen, and sends the template picked', async () => {
    const { onCreate } = renderDialog();

    const select = await screen.findByRole('combobox', { name: 'Parti da' });
    expect(select.textContent).toBe('Pagina vuota');
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Scheda servizio' }));
    typeName('Idraulico Milano');
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Idraulico Milano',
        templateId: 'service',
        parentId: null,
      }),
    );
  });

  it('offers to describe the page to AI where the site can generate one, and sends the description', async () => {
    const { onCreate } = renderDialog({ sections: [], generation: 'ready' });

    // No templates, but a choice all the same: blank, or written by AI.
    const select = await screen.findByRole('combobox', { name: 'Parti da' });
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: "Descrivila all'AI" }));
    typeName('Chi siamo');
    const create = screen.getByRole('button', { name: 'Crea' });
    expect(create.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Cosa deve dire la pagina?'), {
      target: { value: 'La storia del forno dal 1987' },
    });
    fireEvent.click(create);

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Chi siamo',
        templateId: null,
        parentId: null,
        generationPrompt: 'La storia del forno dal 1987',
      }),
    );
  });

  it('does not offer AI where the site has no provider', async () => {
    renderDialog({ generation: 'not-configured' });
    await waitFor(() =>
      expect(generationApi.getPageGenerationStatus).toHaveBeenCalledWith(
        'site-1',
      ),
    );

    fireEvent.click(await screen.findByRole('combobox', { name: 'Parti da' }));
    expect(
      screen.queryByRole('option', { name: "Descrivila all'AI" }),
    ).toBeNull();
  });

  it("preselects the collection's default, and still lets the page start blank", async () => {
    const { onCreate } = renderDialog({
      collectionId: 'news',
      defaultTemplateId: 'article',
    });

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Parti da' }).textContent,
      ).toBe('Articolo blog'),
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Parti da' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pagina vuota' }));
    typeName('Nuovo articolo');
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: 'Nuovo articolo',
        templateId: null,
        parentId: null,
      }),
    );
  });

  it('falls back to blank when the default is no longer on offer', async () => {
    renderDialog({ collectionId: 'news', defaultTemplateId: 'deleted' });

    await waitFor(() =>
      expect(collectionsApi.listCollections).toHaveBeenCalled(),
    );
    expect(
      (await screen.findByRole('combobox', { name: 'Parti da' })).textContent,
    ).toBe('Pagina vuota');
  });

  it('says a name is too long for an address before sending it', async () => {
    const { onCreate } = renderDialog({ sections: [] });

    typeName('x'.repeat(201));

    expect(
      await screen.findByText(
        'Il nome è troppo lungo per diventare un indirizzo: al massimo 200 caratteri.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Crea' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(onCreate).not.toHaveBeenCalled();
  });

  /*
   * A 400 is the request itself — a name too long to become an address,
   * say — and must not be blamed on the template that happens to be
   * selected.
   */
  it('does not blame the template for a request the server found malformed', async () => {
    renderDialog({
      onCreate: () =>
        Promise.reject(
          new ApiError(400, { message: 'slug must be at most 200 characters' }),
        ),
    });

    fireEvent.click(await screen.findByRole('combobox', { name: 'Parti da' }));
    fireEvent.click(screen.getByRole('option', { name: 'Scheda servizio' }));
    typeName('Idraulico Milano');
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    expect(
      await screen.findByText('slug must be at most 200 characters'),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Quel template non è più disponibile. Scegline un altro.',
      ),
    ).toBeNull();
  });

  it('says the template went away rather than printing the status', async () => {
    renderDialog({
      onCreate: () =>
        Promise.reject(
          new ApiError(404, { message: 'Reusable section not found: service' }),
        ),
    });

    fireEvent.click(await screen.findByRole('combobox', { name: 'Parti da' }));
    fireEvent.click(screen.getByRole('option', { name: 'Scheda servizio' }));
    typeName('Idraulico Milano');
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    expect(
      await screen.findByText(
        'Quel template non è più disponibile. Scegline un altro.',
      ),
    ).toBeTruthy();
  });

  /*
   * Asking the AI sends no template, but the collection's default stays
   * selected in the picker underneath: a 404 then said "that template is
   * no longer available" about a template nobody sent (audit B16).
   */
  it('does not blame a template it did not send when the AI was asked', async () => {
    renderDialog({
      collectionId: 'news',
      defaultTemplateId: 'service',
      generation: 'ready',
      onCreate: () =>
        Promise.reject(
          new ApiError(404, { message: 'Collection not found: news' }),
        ),
    });

    fireEvent.click(await screen.findByRole('combobox', { name: 'Parti da' }));
    fireEvent.click(screen.getByRole('option', { name: "Descrivila all'AI" }));
    typeName('Chi siamo');
    fireEvent.change(screen.getByLabelText('Cosa deve dire la pagina?'), {
      target: { value: 'La storia del forno dal 1987' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

    expect(await screen.findByText('Collection not found: news')).toBeTruthy();
    expect(
      screen.queryByText(
        'Quel template non è più disponibile. Scegline un altro.',
      ),
    ).toBeNull();
  });
});
