import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import {
  buildCollectionRecord,
  buildPageGroupRecord,
  buildPageGroupVersionRecord,
  buildPageTranslationRecord,
  buildPageTranslationVersionRecord,
  buildReusableSectionRecord,
} from '@kometio/testing/records';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ApiError } from '../../lib/http-client';
import * as api from '../../lib/page-groups-api-client';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import type { CollectionRecord } from '../../lib/collections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { collectionsQueryOptions } from '../collections/collections-queries';
import { ToastProvider } from '../shell/toast-provider';
import {
  pageGroupQueryOptions,
  pageGroupTranslationsQueryOptions,
} from './page-groups-queries';
import { PageGroupEditorView } from './page-group-editor-view';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    updatePageTranslationSeoMeta: vi.fn(),
    listPageGroupVersions: vi.fn(),
    rollbackPageGroupToVersion: vi.fn(),
    listPageTranslationVersions: vi.fn(),
    rollbackPageTranslationToVersion: vi.fn(),
    relinkPageTranslation: vi.fn(),
    createPageGroupTranslation: vi.fn(),
    savePageGroupAsTemplate: vi.fn(),
  };
});

const hasFailedSave = vi.hoisted(() => vi.fn(() => false));

// The real hook, with one answer taken over: making a save fail for real
// would need an edit on the canvas iframe, and what is under test here is
// only what the view does with that answer.
vi.mock('./use-page-group-editor', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./use-page-group-editor')>();
  return {
    ...actual,
    usePageGroupEditor: (
      ...args: Parameters<typeof actual.usePageGroupEditor>
    ) => ({ ...actual.usePageGroupEditor(...args), hasFailedSave }),
  };
});

vi.mock('../../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/preview-token-api-client')>();
  return { ...actual, createTranslationPreviewToken: vi.fn() };
});

const groupContent: Block[] = [
  { id: 'hero-1', type: 'Hero', props: { title: 'Hello' } },
];

const sampleGroup = buildPageGroupRecord({ content: groupContent });

const enTranslation = buildPageTranslationRecord({
  id: 'translation-en',
  locale: 'en',
  seoMeta: { title: 'Home', description: 'The home page' },
});

function renderView(
  translations: api.PageTranslationRecord[] = [enTranslation],
  enabledLocales: string[] = ['en', 'it'],
  group: api.PageGroupRecord = sampleGroup,
  collections: CollectionRecord[] = [],
  initialLocale = 'en',
) {
  vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
    token: 'tok123',
    expiresAt: new Date().toISOString(),
  });

  const queryClient = createTestQueryClient();
  queryClient.setQueryData(pageGroupQueryOptions('group-1').queryKey, group);
  queryClient.setQueryData(
    collectionsQueryOptions(group.siteId).queryKey,
    collections,
  );
  queryClient.setQueryData(
    pageGroupTranslationsQueryOptions('group-1').queryKey,
    translations,
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <PageGroupEditorView
            groupId="group-1"
            initialLocale={initialLocale}
            defaultLocale="en"
            enabledLocales={enabledLocales}
          />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/**
 * The page's own actions used to be six unlabelled icons on the bar. They
 * are a labelled menu now, so every one of them is one click further in —
 * and finally readable.
 */
async function openPageMenu() {
  fireEvent.click(await screen.findByRole('button', { name: 'Pagina' }));
}

/**
 * One entry of that menu. Scoped to the menu itself: the same actions are
 * also buttons in the Properties panel while no block is selected.
 */
async function pickFromPageMenu(name: string) {
  await openPageMenu();
  const menu = within(await screen.findByRole('dialog'));
  fireEvent.click(await menu.findByRole('button', { name }));
}

describe('PageGroupEditorView', () => {
  beforeEach(() => {
    vi.mocked(api.listPageTranslationVersions).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the SEO dialog pre-filled with the active translation and saves an edit', async () => {
    vi.mocked(api.updatePageTranslationSeoMeta).mockResolvedValue({
      ...enTranslation,
      seoMeta: { title: 'New title', description: 'The home page' },
    });
    renderView();

    await pickFromPageMenu('SEO');

    const titleInput = await screen.findByLabelText('Titolo SEO');
    expect(titleInput).toHaveProperty('value', 'Home');

    fireEvent.change(titleInput, { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(api.updatePageTranslationSeoMeta).toHaveBeenCalledWith(
        'translation-en',
        { title: 'New title', description: 'The home page' },
      ),
    );
  });

  it('opens version history and restores a previous version', async () => {
    vi.mocked(api.listPageGroupVersions).mockResolvedValue([
      buildPageGroupVersionRecord({
        id: 'v1',
        content: groupContent,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      buildPageGroupVersionRecord({
        id: 'v2',
        content: [{ id: 'hero-1', type: 'Hero', props: { title: 'Old' } }],
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);
    vi.mocked(api.rollbackPageGroupToVersion).mockResolvedValue({
      ...sampleGroup,
      content: [{ id: 'hero-1', type: 'Hero', props: { title: 'Old' } }],
    });
    renderView();

    await pickFromPageMenu('Cronologia versioni');

    const restoreButtons = await screen.findAllByRole('button', {
      name: /^ripristina$/i,
    });
    expect(restoreButtons).toHaveLength(1);
    fireEvent.click(restoreButtons[0]);

    await waitFor(() =>
      expect(api.rollbackPageGroupToVersion).toHaveBeenCalledWith(
        'group-1',
        'v1',
      ),
    );
  });

  it('opens the translations dialog, creates a translation for a missing locale, and switches to it', async () => {
    const itTranslation: api.PageTranslationRecord = {
      ...enTranslation,
      id: 'translation-it',
      locale: 'it',
      slug: 'home-it',
    };
    vi.mocked(api.createPageGroupTranslation).mockResolvedValue(itTranslation);
    renderView();

    await pickFromPageMenu('Traduzioni');

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('en')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'IT' }));
    fireEvent.change(dialog.getByLabelText('URL'), {
      target: { value: 'home-it' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Crea traduzione' }));

    await waitFor(() =>
      expect(api.createPageGroupTranslation).toHaveBeenCalledWith('group-1', {
        locale: 'it',
        slug: 'home-it',
        seoMeta: { title: '', description: '' },
      }),
    );
    // Switching to the newly-created locale shows it as active in the
    // language switcher (uppercase locale code in the top bar).
    await waitFor(() => expect(screen.getByText('it')).toBeTruthy());
  });

  describe('save as template', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const savedTemplate = buildReusableSectionRecord({
      id: 'template-1',
      name: 'Scheda servizio',
      kind: 'template',
      status: 'published',
      content: groupContent,
      publishedContent: groupContent,
    });

    /** Opens the dialog from the page menu and sends `name`. */
    async function saveAsTemplateNamed(name: string) {
      await pickFromPageMenu('Salva come template');
      const field = await screen.findByLabelText('Nome del template');
      fireEvent.change(field, { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'Salva template' }));
      return field;
    }

    it("asks for a name, starting from the default language's title, and says where the template went", async () => {
      vi.mocked(api.savePageGroupAsTemplate).mockResolvedValue(savedTemplate);
      renderView();

      await pickFromPageMenu('Salva come template');
      expect(await screen.findByLabelText('Nome del template')).toHaveProperty(
        'value',
        'Home',
      );
      fireEvent.change(screen.getByLabelText('Nome del template'), {
        target: { value: '  Scheda servizio  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva template' }));

      await waitFor(() =>
        expect(api.savePageGroupAsTemplate).toHaveBeenCalledWith(
          'group-1',
          'Scheda servizio',
        ),
      );
      expect(
        await screen.findByText(
          'Template “Scheda servizio” salvato: lo trovi quando crei una nuova pagina.',
        ),
      ).toBeTruthy();
      await waitFor(() =>
        expect(screen.queryByLabelText('Nome del template')).toBeNull(),
      );
    });

    it('cannot be sent without a name, and closing it saves nothing', async () => {
      renderView();

      await pickFromPageMenu('Salva come template');
      fireEvent.change(await screen.findByLabelText('Nome del template'), {
        target: { value: '   ' },
      });
      expect(
        screen.getByRole('button', { name: 'Salva template' }),
      ).toHaveProperty('disabled', true);
      fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

      await waitFor(() =>
        expect(screen.queryByLabelText('Nome del template')).toBeNull(),
      );
      expect(api.savePageGroupAsTemplate).not.toHaveBeenCalled();
    });

    it('refuses when the last edit never reached the server, instead of copying the page without it', async () => {
      hasFailedSave.mockReturnValueOnce(true);
      renderView();

      await saveAsTemplateNamed('Scheda servizio');

      expect((await screen.findByRole('alert')).textContent).toBe(
        'L’ultima modifica non è arrivata al server, quindi il template non la conterrebbe. Fai una piccola modifica alla pagina per salvarla di nuovo, poi riprova.',
      );
      expect(api.savePageGroupAsTemplate).not.toHaveBeenCalled();
    });

    it('says the name is taken under the name, which stays typed', async () => {
      vi.mocked(api.savePageGroupAsTemplate).mockRejectedValue(
        new ApiError(409, { message: 'taken' }),
      );
      renderView();

      const field = await saveAsTemplateNamed('Scheda servizio');

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Esiste già una sezione con questo nome.',
      );
      expect(field).toHaveProperty('value', 'Scheda servizio');
    });
  });

  describe('an unlinked language', () => {
    const fork: Block[] = [
      { id: 'hero-1', type: 'Hero', props: { title: 'Ciao' } },
      { id: 'only-here', type: 'Text', props: { body: '<p>Solo qui</p>' } },
    ];
    const itUnlinked = buildPageTranslationRecord({
      id: 'translation-it',
      locale: 'it',
      isDiverged: true,
      divergedContent: fork,
    });

    function renderUnlinked() {
      return renderView(
        [enTranslation, itUnlinked],
        ['en', 'it'],
        sampleGroup,
        [],
        'it',
      );
    }

    /*
     * Unlinking used to be for good. The way back keeps the text of every
     * block the shared structure still has, and says first what it drops.
     */
    it('relinks it with the text of the blocks the shared structure still has, saying first what it drops', async () => {
      vi.mocked(api.relinkPageTranslation).mockResolvedValue({
        ...itUnlinked,
        isDiverged: false,
        divergedContent: null,
        fieldValues: { 'hero-1': { title: 'Ciao' } },
      });
      renderUnlinked();

      await openPageMenu();
      const menu = within(await screen.findByRole('dialog'));
      expect(
        menu.queryByRole('button', { name: 'Scollega questa lingua' }),
      ).toBeNull();
      fireEvent.click(
        await menu.findByRole('button', { name: 'Ricollega questa lingua' }),
      );

      const dialog = await screen.findByRole('alertdialog');
      expect(
        within(dialog).getByText('Ricollegare IT alla struttura condivisa?'),
      ).toBeTruthy();
      expect(dialog.textContent).toContain(
        '1 blocco esiste solo in questa lingua e verrà tolto.',
      );
      expect(dialog.textContent).toContain(
        'resta nella cronologia di questa lingua',
      );
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Ricollega' }),
      );

      await waitFor(() =>
        expect(api.relinkPageTranslation).toHaveBeenCalledWith(
          'translation-it',
          { 'hero-1': { title: 'Ciao' } },
        ),
      );
      expect(
        await screen.findByText('IT segue di nuovo la struttura condivisa.'),
      ).toBeTruthy();
    });

    it('does not relink when the last edit never reached the server', async () => {
      hasFailedSave.mockReturnValueOnce(true);
      renderUnlinked();

      await pickFromPageMenu('Ricollega questa lingua');
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Ricollega',
        }),
      );

      expect(
        await screen.findByText(/la lingua non è stata ricollegata/),
      ).toBeTruthy();
      expect(api.relinkPageTranslation).not.toHaveBeenCalled();
    });

    it('shows only its own history, and restores the fork from it', async () => {
      vi.mocked(api.listPageTranslationVersions).mockResolvedValue([
        buildPageTranslationVersionRecord({
          id: 'linked-text',
          pageTranslationId: 'translation-it',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        buildPageTranslationVersionRecord({
          id: 'older-fork',
          pageTranslationId: 'translation-it',
          divergedContent: fork.slice(0, 1),
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
        buildPageTranslationVersionRecord({
          id: 'current-fork',
          pageTranslationId: 'translation-it',
          divergedContent: fork,
          createdAt: '2026-01-03T00:00:00.000Z',
        }),
      ]);
      vi.mocked(api.rollbackPageTranslationToVersion).mockResolvedValue({
        ...itUnlinked,
        divergedContent: fork.slice(0, 1),
      });
      renderUnlinked();

      await pickFromPageMenu('Cronologia versioni');

      const restoreButtons = await screen.findAllByRole('button', {
        name: /^ripristina$/i,
      });
      expect(restoreButtons).toHaveLength(2);
      // The structure's history is not offered: it no longer reaches this
      // language at all.
      expect(screen.queryByRole('tablist')).toBeNull();
      expect(api.listPageGroupVersions).not.toHaveBeenCalled();
      expect(
        screen.getAllByText(
          'Scollegata: ripristinarla scollega di nuovo la lingua',
        ),
      ).toHaveLength(2);

      fireEvent.click(restoreButtons[0]);

      await waitFor(() =>
        expect(api.rollbackPageTranslationToVersion).toHaveBeenCalledWith(
          'translation-it',
          'older-fork',
        ),
      );
    });
  });

  it("offers a linked language both the structure's history and its own", async () => {
    const itLinked = buildPageTranslationRecord({
      id: 'translation-it',
      locale: 'it',
    });
    vi.mocked(api.listPageGroupVersions).mockResolvedValue([
      buildPageGroupVersionRecord({ id: 'structure-v1' }),
    ]);
    vi.mocked(api.listPageTranslationVersions).mockResolvedValue([
      buildPageTranslationVersionRecord({
        id: 'text-v1',
        pageTranslationId: 'translation-it',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      buildPageTranslationVersionRecord({
        id: 'text-v2',
        pageTranslationId: 'translation-it',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);
    vi.mocked(api.rollbackPageTranslationToVersion).mockResolvedValue(itLinked);
    renderView([enTranslation, itLinked], ['en', 'it'], sampleGroup, [], 'it');

    await pickFromPageMenu('Cronologia versioni');
    fireEvent.click(await screen.findByRole('tab', { name: 'Solo IT' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^ripristina$/i }),
    );

    await waitFor(() =>
      expect(api.rollbackPageTranslationToVersion).toHaveBeenCalledWith(
        'translation-it',
        'text-v1',
      ),
    );
    expect(
      screen.queryByRole('tab', { name: 'Struttura (tutte le lingue)' }),
    ).toBeNull();
  });

  /*
   * A page filed in a section belongs to that section's screen. Sending
   * somebody who opened an article from News back to Pages drops them
   * somewhere they were not, with their article nowhere in the list.
   */
  it('goes back to the section the page is filed in, by its name', async () => {
    renderView(
      [enTranslation],
      ['en', 'it'],
      { ...sampleGroup, collectionId: 'collection-1' },
      [
        buildCollectionRecord({
          id: 'collection-1',
          siteId: sampleGroup.siteId,
          name: 'News',
        }),
      ],
    );

    const back = await screen.findByRole('link', { name: /News/ });
    expect(back.getAttribute('href')).toBe('/collections/collection-1');
  });

  it('goes back to Pages for a page that is in no section', async () => {
    renderView();

    const back = await screen.findByRole('link', { name: /Pagine/ });
    expect(back.getAttribute('href')).toBe('/pages');
  });
});
