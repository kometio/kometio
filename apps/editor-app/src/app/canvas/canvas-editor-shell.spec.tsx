import {
  fireEvent,
  within,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject, ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import type { Block } from '@kometio/shared-types';
import {
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
} from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '@kometio/block-registry';
import { TooltipProvider } from '../../components/ui/tooltip';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import {
  dispatchFromIframe,
  findCanvasIframe,
  markCanvasReady,
  selectBlockWithRect,
} from '../../test/preview-bridge.test-fixture';
import * as blockFragmentApi from '../../lib/block-fragment-api-client';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import { ToastProvider } from '../shell/toast-provider';
import { LayoutTemplate } from 'lucide-react';
import { CanvasEditorShell } from './canvas-editor-shell';
import type { CanvasPageMenuItem } from './canvas-top-bar';
import { PageListContext } from '../pages/page-list-context';
import { IconListContext, type IconListPort } from '../style/icon-list-context';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

// The shell needs it the same way production does: page links are picked
// through the editor's own dialog, which this context provides.
const pageListPort = { pick: () => Promise.resolve(null) };
// Likewise the icons: a theme that has every icon, unless a test says not.
const iconListPort: IconListPort = {
  pick: () => Promise.resolve(null),
  resolve: () => null,
  isMissingFromTheme: () => false,
};

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/preview-token-api-client')>();
  return { ...actual, createTranslationPreviewToken: vi.fn() };
});

vi.mock('../../lib/block-fragment-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/block-fragment-api-client')
    >();
  return { ...actual, renderBlockFragment: vi.fn() };
});

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: 'Titolo', subtitle: 'Sottotitolo' },
  fields: [
    { kind: 'text', key: 'title', label: 'Titolo', inlineEditable: true },
    { kind: 'text', key: 'subtitle', label: 'Sottotitolo' },
  ],
};
const textDescriptor: BlockDescriptor = {
  type: 'Text',
  label: 'Testo',
  category: 'content',
  defaultProps: { body: 'Corpo' },
  fields: [{ kind: 'text', key: 'body', label: 'Corpo', inlineEditable: true }],
};
const columnsDescriptor: BlockDescriptor = {
  type: 'Columns',
  label: 'Colonne',
  category: 'layout',
  defaultProps: {},
  fields: [],
  isContainer: true,
  allowedChildTypes: ['Column'],
};
const columnDescriptor: BlockDescriptor = {
  type: 'Column',
  label: 'Colonna',
  category: 'layout',
  defaultProps: {},
  fields: [],
};

// A type core does not have — what a theme's own block looks like to the
// shell, which gets it through `registry` like any other.
const themeBlockDescriptor: BlockDescriptor = {
  type: 'StatusBadge',
  label: 'Etichetta di stato',
  category: 'content',
  icon: 'badge',
  defaultProps: {},
  fields: [],
};

const featureDescriptor: BlockDescriptor = {
  type: 'Feature',
  label: 'Caratteristica',
  category: 'content',
  defaultProps: { icon: null },
  fields: [FieldBuilder.custom('icon', 'Icona', 'icon')],
};

const registry = [
  heroDescriptor,
  textDescriptor,
  columnsDescriptor,
  columnDescriptor,
  featureDescriptor,
  themeBlockDescriptor,
];
const categories = [
  { title: 'Contenuto', types: ['Hero', 'Text'] },
  { title: 'Layout', types: ['Columns', 'Column'] },
];

function renderShell(
  overrides: {
    blocks?: Block[];
    onChange?: (blocks: Block[]) => void;
    onPublish?: (blocks: Block[]) => unknown;
    pageMenu?: CanvasPageMenuItem[];
    flushRef?: MutableRefObject<(() => void) | null>;
    iconListPort?: IconListPort;
    /** The site being edited: what offers the Style page. */
    siteId?: string;
  } = {},
) {
  vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
  vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
    token: 'tok123',
    expiresAt: new Date().toISOString(),
  });

  const blocks: Block[] = overrides.blocks ?? [
    {
      id: 'hero-1',
      type: 'Hero',
      props: { title: 'Titolo', subtitle: 'Sottotitolo' },
    },
  ];
  const onChange = overrides.onChange ?? vi.fn();
  const onPublish = overrides.onPublish ?? vi.fn();
  const queryClient = createTestQueryClient();
  // Every render of the shell, first or not, sits under the same providers
  // production gives it.
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <PageListContext.Provider value={pageListPort}>
              <IconListContext.Provider
                value={overrides.iconListPort ?? iconListPort}
              >
                {children}
              </IconListContext.Provider>
            </PageListContext.Provider>
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  const utils = render(
    <Providers>
      <CanvasEditorShell
        backLink={<a href="/pages">Pagine</a>}
        statusText="Bozza salvata"
        registry={registry}
        categories={categories}
        blocks={blocks}
        onChange={onChange}
        onPublish={onPublish}
        pageId="page-1"
        pageMenu={overrides.pageMenu}
        flushRef={overrides.flushRef}
        siteId={overrides.siteId}
      />
    </Providers>,
  );

  /** Re-renders the SAME shell with another page — what switching language does (the shell is not remounted, it resyncs from props). */
  function switchPage(nextPageId: string, nextBlocks: Block[]) {
    utils.rerender(
      <Providers>
        <CanvasEditorShell
          backLink={<a href="/pages">Pagine</a>}
          statusText="Bozza salvata"
          registry={registry}
          categories={categories}
          blocks={nextBlocks}
          onChange={onChange}
          onPublish={onPublish}
          pageId={nextPageId}
        />
      </Providers>,
    );
  }

  /** Re-renders the SAME page after a version was restored — what the version history does once the server holds the restored draft. */
  function restore(restoredBlocks: Block[], restoredAt = 1) {
    utils.rerender(
      <Providers>
        <CanvasEditorShell
          backLink={<a href="/pages">Pagine</a>}
          statusText="Bozza salvata"
          registry={registry}
          categories={categories}
          blocks={restoredBlocks}
          onChange={onChange}
          onPublish={onPublish}
          pageId="page-1"
          restoredAt={restoredAt}
        />
      </Providers>,
    );
  }

  return { ...utils, onChange, onPublish, blocks, switchPage, restore };
}

const HERO_RECT = { top: 0, left: 0, width: 800, height: 100 };

/**
 * "Properties" in the block's toolbar: it puts the keyboard in the
 * Properties panel, opening the panel first if it was closed.
 */
function focusPropertiesPanel() {
  fireEvent.click(
    within(
      screen.getByRole('toolbar', { name: 'Azioni sul blocco' }),
    ).getByRole('button', { name: 'Proprietà' }),
  );
}

function rail() {
  return within(
    screen.getByRole('navigation', { name: "Strumenti dell'editor" }),
  );
}

/**
 * The block palette, opened from the rail's Add if it is not already the
 * left panel's view: the left panel opens on Layers.
 */
function openPalette() {
  if (!screen.queryByRole('complementary', { name: 'Inserisci blocco' })) {
    fireEvent.click(rail().getByRole('button', { name: 'Aggiungi' }));
  }
  return screen.getByRole('complementary', { name: 'Inserisci blocco' });
}

describe('CanvasEditorShell', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The panels remember their state (see side-panel-preferences.ts and
    // use-left-panel.ts), and localStorage outlives a test: without this,
    // the test that closes a panel leaves it closed for every test after.
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders the top bar (back link, status, publish) and no toolbar when nothing is selected', async () => {
    renderShell();
    await findCanvasIframe();

    expect(screen.getByRole('link', { name: 'Pagine' })).toBeTruthy();
    expect(screen.getByText('Bozza salvata')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pubblica' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^esci$/i })).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  /*
   * The left panel used to be the block palette, always, and Layers shared
   * a tab strip with Properties on the right. It is one panel now, showing
   * what the rail picks, opening on Layers.
   */
  it('opens Layers on the left by default, and the rail switches it to Add and closes it again', async () => {
    renderShell();
    await findCanvasIframe();

    expect(screen.getByRole('complementary', { name: 'Livelli' })).toBeTruthy();
    expect(
      rail()
        .getByRole('button', { name: 'Livelli' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(rail().getByRole('button', { name: 'Aggiungi' }));
    expect(
      screen.getByRole('complementary', { name: 'Inserisci blocco' }),
    ).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Livelli' })).toBeNull();

    // The open view's own button closes the panel: it takes no room then.
    fireEvent.click(rail().getByRole('button', { name: 'Aggiungi' }));
    expect(
      screen.queryByRole('complementary', { name: 'Inserisci blocco' }),
    ).toBeNull();
    expect(
      rail()
        .getByRole('button', { name: 'Aggiungi' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(rail().getByRole('button', { name: 'Livelli' }));
    expect(screen.getByRole('complementary', { name: 'Livelli' })).toBeTruthy();
  });

  it('closes the left panel from its own close button too, not only from the rail', async () => {
    renderShell();
    await findCanvasIframe();

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il pannello' }));

    expect(screen.queryByRole('complementary', { name: 'Livelli' })).toBeNull();
    expect(
      screen.getByRole('complementary', { name: 'Proprietà' }),
    ).toBeTruthy();
  });

  it('closing the Properties panel leaves the left panel as it was', async () => {
    renderShell();
    await findCanvasIframe();

    fireEvent.click(
      screen.getByRole('button', { name: 'Chiudi il pannello Proprietà' }),
    );
    expect(
      screen.queryByRole('heading', { name: 'Nessun blocco selezionato' }),
    ).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Livelli' })).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Apri il pannello Proprietà' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Nessun blocco selezionato' }),
    ).toBeTruthy();
  });

  it('selecting a block on the canvas shows the toolbar, with its actions written', async () => {
    renderShell();
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    const toolbar = within(
      screen.getByRole('toolbar', { name: 'Azioni sul blocco' }),
    );
    for (const name of ['Proprietà', 'Duplica', 'Elimina']) {
      expect(toolbar.getByRole('button', { name }).textContent).toBe(name);
    }
    expect(
      screen.getByRole('button', { name: 'Aggiungi un blocco qui' }),
    ).toBeTruthy();

    focusPropertiesPanel();
    expect(screen.getByDisplayValue('Titolo')).toBeTruthy();
  });

  it("names a theme's block in Layers from the registry it was given, not by its type", () => {
    renderShell({
      blocks: [{ id: 'badge-1', type: 'StatusBadge', props: {} }],
    });

    expect(screen.getByTestId('layer-row').textContent).toBe(
      'Etichetta di stato',
    );
  });

  it('marks in Layers each block whose icon the active theme does not have (ADR-0090)', () => {
    renderShell({
      blocks: [
        { id: 'feature-1', type: 'Feature', props: { icon: 'palette' } },
        { id: 'feature-2', type: 'Feature', props: { icon: 'globe' } },
      ],
      iconListPort: {
        pick: () => Promise.resolve(null),
        resolve: () => null,
        isMissingFromTheme: (name) => name === 'palette',
      },
    });

    const [missing, present] = screen.getAllByTestId('layer-row');
    expect(missing?.textContent).toContain(
      'Assente nel tema, quindi non si vede sul sito: palette',
    );
    expect(present?.textContent).not.toContain('Assente nel tema');
  });

  it('clicking a block in the Layers panel selects it and asks the iframe to scroll it into view', async () => {
    renderShell();
    const iframe = await findCanvasIframe();
    if (!iframe.contentWindow) {
      throw new Error('Test fixture iframe has no contentWindow');
    }
    const postMessageSpy = vi.spyOn(iframe.contentWindow, 'postMessage');

    fireEvent.click(screen.getByTestId('layer-row'));

    expect(screen.getByTestId('layer-row').getAttribute('data-state')).toBe(
      'selected',
    );
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:scroll-to-block',
        payload: { blockId: 'hero-1' },
      },
      '*',
    );
  });

  /*
   * Selecting a block used to switch the right panel from its Layers tab to
   * its Properties tab: the tree went away at the moment you wanted to know
   * where the block sat. Both are on screen now.
   */
  it('selecting a block brings up its properties, and Layers stays in view beside them', async () => {
    renderShell();
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    expect(screen.getByDisplayValue('Titolo')).toBeTruthy();
    expect(screen.getByTestId('layer-row').getAttribute('data-state')).toBe(
      'selected',
    );
  });

  /*
   * A closed panel renders none of its content, so while it was the
   * panel's own private state the button quietly did nothing when the panel
   * happened to be shut: the focus landed on a forty-pixel strip.
   */
  it('the properties button opens the Properties panel when it is closed', async () => {
    renderShell();
    const iframe = await findCanvasIframe();

    fireEvent.click(
      screen.getByRole('button', { name: 'Chiudi il pannello Proprietà' }),
    );
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    expect(screen.queryByDisplayValue('Titolo')).toBeNull();

    focusPropertiesPanel();

    expect(screen.getByDisplayValue('Titolo')).toBeTruthy();
  });

  /*
   * With nothing selected the panel used to hold one grey sentence. The
   * page is what you are working on then, so it offers the page's actions,
   * and a way to add the first block.
   */
  it('with nothing selected, the Properties panel offers the page actions and a way to add a block', async () => {
    const onSelect = vi.fn();
    renderShell({
      pageMenu: [{ label: 'SEO', icon: LayoutTemplate, onSelect }],
    });
    await findCanvasIframe();
    const panel = within(
      screen.getByRole('complementary', { name: 'Proprietà' }),
    );

    fireEvent.click(panel.getByRole('button', { name: 'SEO' }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(panel.getByRole('button', { name: 'Aggiungi un blocco' }));
    expect(
      screen.getByRole('complementary', { name: 'Inserisci blocco' }),
    ).toBeTruthy();
  });

  /*
   * The panels were a fixed `w-64` whose collapsed state reset on every
   * mount: on a small screen the canvas stayed narrow, and closing a panel
   * to get room had to be redone on the next page.
   */
  it("remembers a closed panel, and the left panel's view, across a remount", async () => {
    const first = renderShell();
    await findCanvasIframe();

    fireEvent.click(
      screen.getByRole('button', { name: 'Chiudi il pannello Proprietà' }),
    );
    fireEvent.click(rail().getByRole('button', { name: 'Aggiungi' }));
    first.unmount();

    renderShell();
    await findCanvasIframe();

    expect(
      screen.getByRole('button', { name: 'Apri il pannello Proprietà' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Inserisci blocco' }),
    ).toBeTruthy();
  });

  /*
   * Every shortcut is the fast way to a button that is on screen — never
   * the only way to anything.
   */
  it('"/" opens Add, and mod+K opens the search, which can insert a block', async () => {
    const { onChange } = renderShell({ blocks: [] });
    const iframe = await findCanvasIframe();
    markCanvasReady(iframe);

    fireEvent.keyDown(window, { key: '/' });
    expect(
      screen.getByRole('complementary', { name: 'Inserisci blocco' }),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = await screen.findByRole('combobox', {
      name: 'Cerca blocchi e comandi',
    });
    fireEvent.change(search, { target: { value: 'testo' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ type: 'Text' }),
      ]),
    );
  });

  /*
   * At 390px the palette took the whole width, the right panel was cut in
   * half, and the page being edited was not on screen at all. Below `md`
   * the canvas is the whole screen and each panel is a sheet over it.
   */
  it('on a phone-narrow window, puts the panels behind a bar at the bottom and opens them as sheets', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(max-width: 767px)',
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    try {
      renderShell();
      const iframe = await findCanvasIframe();

      expect(
        screen.queryByRole('navigation', { name: "Strumenti dell'editor" }),
      ).toBeNull();
      expect(
        screen.queryByRole('complementary', { name: 'Livelli' }),
      ).toBeNull();
      const bar = within(
        screen.getByRole('navigation', { name: "Pannelli dell'editor" }),
      );

      fireEvent.click(bar.getByRole('button', { name: 'Livelli' }));
      expect(
        screen.getByRole('complementary', { name: 'Livelli' }),
      ).toBeTruthy();

      // The toolbar's Properties opens the Properties sheet in its place.
      selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
      focusPropertiesPanel();
      expect(
        screen.queryByRole('complementary', { name: 'Livelli' }),
      ).toBeNull();
      expect(screen.getByDisplayValue('Titolo')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
      expect(screen.queryByDisplayValue('Titolo')).toBeNull();
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('the search box in the bar opens the same search, for people who never press its shortcut', async () => {
    renderShell();
    await findCanvasIframe();

    fireEvent.click(
      screen.getByRole('button', { name: /Cerca blocchi e comandi/ }),
    );

    expect(
      await screen.findByRole('combobox', { name: 'Cerca blocchi e comandi' }),
    ).toBeTruthy();
  });

  /*
   * Leaving the editor by a link is not leaving the browser: the app is
   * still running, so a save fired on the way out reaches the server
   * exactly as it would have when its timer expired. This is why in-app
   * navigation asks no question — the change goes with you — and it is the
   * half of "nothing is lost" that a beforeunload prompt cannot cover.
   */
  it('writes a change still inside the debounce when the editor is left', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const { onChange, unmount } = renderShell();
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.change(screen.getByDisplayValue('Titolo'), {
      target: { value: 'Scritto e subito via' },
    });
    // Nothing has been written yet: the timer has not run.
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Scritto e subito via', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  /*
   * "Save as template" copies the page on the server. Run over a change
   * still waiting out the debounce, it would copy the page minus the edit
   * made a moment before — so the change is sent first, for every page
   * action (the one that needs it to land then waits for the save).
   */
  it('writes a change still inside the debounce before a page action runs', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const order: string[] = [];
    const onChange = vi.fn(() => {
      order.push('written');
    });
    const onSelect = vi.fn(() => {
      order.push('action');
    });
    renderShell({
      onChange,
      pageMenu: [
        { label: 'Salva come template', icon: LayoutTemplate, onSelect },
      ],
    });
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.change(screen.getByDisplayValue('Titolo'), {
      target: { value: 'Ultima modifica' },
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pagina' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Salva come template' }),
    );

    expect(order).toEqual(['written', 'action']);
    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Ultima modifica', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  /*
   * A view's own history dialog lives outside the shell. A restore there
   * waits for the saves already queued; a change still in the debounce is
   * not queued yet, and would land after the restore and undo it — so the
   * shell hands the view its flush.
   */
  it('hands the view a flush that writes a change still inside the debounce', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const flushRef: MutableRefObject<(() => void) | null> = { current: null };
    const { onChange } = renderShell({ flushRef });
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.change(screen.getByDisplayValue('Titolo'), {
      target: { value: 'Ultima modifica' },
    });
    expect(onChange).not.toHaveBeenCalled();

    flushRef.current?.();

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Ultima modifica', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  it('changing a property in the Inspector updates onChange after the debounce, and patches the fragment', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div>patched</div>',
    );
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    focusPropertiesPanel();

    const input = screen.getByDisplayValue('Titolo');
    fireEvent.change(input, { target: { value: 'Nuovo titolo' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Nuovo titolo', subtitle: 'Sottotitolo' },
      },
    ]);
    expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: 'hero-1',
        blockType: 'Hero',
        props: { title: 'Nuovo titolo', subtitle: 'Sottotitolo' },
      }),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'editor:patch-block' }),
        '*',
      ),
    );
  });

  it('removing the selected block calls onChange with it gone, and patches the canvas to actually remove it', async () => {
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:remove-block',
        payload: { blockId: 'hero-1' },
      },
      '*',
    );
  });

  it('removing a NESTED block re-patches its parent instead of a plain editor:remove-block, so the parent chrome (e.g. an empty-state hint) updates too', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne di nuovo vuote</div>',
    );
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'columns-1',
          type: 'Columns',
          props: {},
          children: [{ id: 'column-1', type: 'Column', props: {} }],
        },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'column-1', {
      top: 0,
      left: 0,
      width: 400,
      height: 40,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'columns-1', children: [] }),
    ]);
    await waitFor(() =>
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({
          blockId: 'columns-1',
          blockType: 'Columns',
          children: [],
        }),
      ),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:patch-block',
          payload: expect.objectContaining({
            blockId: 'columns-1',
            html: '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne di nuovo vuote</div>',
          }),
        }),
        '*',
      ),
    );
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'editor:remove-block' }),
      '*',
    );
  });

  /*
   * A block inserted before the page in the iframe listens was saved but
   * never drawn, until a reload: the message telling the canvas about it
   * was lost. So the palette waits, and the canvas says it is loading.
   */
  it('keeps the palette off, and says the page is loading, until the canvas is ready', async () => {
    const { onChange } = renderShell({ blocks: [] });
    const iframe = await findCanvasIframe();
    const testoButton = within(openPalette()).getByRole('button', {
      name: 'Testo',
    });

    expect(testoButton.matches(':disabled')).toBe(true);
    expect(
      screen.getByText('Caricamento della pagina…').getAttribute('role'),
    ).toBe('status');
    fireEvent.pointerDown(testoButton, { pointerId: 1 });
    fireEvent.pointerUp(testoButton, { pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    markCanvasReady(iframe);

    expect(testoButton.matches(':disabled')).toBe(false);
    expect(screen.queryByText('Caricamento della pagina…')).toBeNull();
  });

  it('inserting a block from the picker appends it at the root', async () => {
    const { onChange } = renderShell({ blocks: [] });
    markCanvasReady(await findCanvasIframe());

    // The block button is draggable (block-picker.tsx) — it uses Pointer
    // Events rather than a plain click: a down+up with no movement in
    // between is the correct simulation of an ordinary click (no drag
    // threshold crossed).
    // Scoped to the inserter: since the layers tree started naming blocks
    // the way a person picked them, a Text block on the canvas is also
    // called "Testo", and an unscoped query cannot tell the tile from
    // the row.
    const testoButton = within(openPalette()).getByRole('button', {
      name: 'Testo',
    });
    fireEvent.pointerDown(testoButton, { pointerId: 1 });
    fireEvent.pointerUp(testoButton, { pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'Text', props: { body: 'Corpo' } }),
    ]);
  });

  it('inserting a block from the picker also renders and patches it into the canvas (the reported bug: a new block used to stay invisible until reload)', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="new-text">Corpo</div>',
    );
    renderShell({ blocks: [] });
    const iframe = await findCanvasIframe();
    markCanvasReady(iframe);
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    // Scoped to the inserter: since the layers tree started naming blocks
    // the way a person picked them, a Text block on the canvas is also
    // called "Testo", and an unscoped query cannot tell the tile from
    // the row.
    const testoButton = within(openPalette()).getByRole('button', {
      name: 'Testo',
    });
    fireEvent.pointerDown(testoButton, { pointerId: 1 });
    fireEvent.pointerUp(testoButton, { pointerId: 1 });

    await waitFor(() =>
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({
          blockType: 'Text',
          props: { body: 'Corpo' },
        }),
      ),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:insert-block',
          payload: expect.objectContaining({
            html: '<div data-kometio-block-id="new-text">Corpo</div>',
            parentId: null,
            beforeBlockId: null,
          }),
        }),
        '*',
      ),
    );
  });

  it('duplicating a block renders and patches the clone into the canvas', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="hero-copy">Titolo</div>',
    );
    renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Duplica' }));

    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:insert-block',
          payload: expect.objectContaining({
            parentId: null,
            beforeBlockId: null,
          }),
        }),
        '*',
      ),
    );
  });

  it('dragging a block from the picker onto the canvas inserts it at the computed drop position', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="new-text">Corpo</div>',
    );
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'hero-1',
          type: 'Hero',
          props: { title: 'Titolo', subtitle: 'Sottotitolo' },
        },
        { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    act(() => {
      dispatchFromIframe(iframe, 'preview:ready', {
        blockRects: [
          { id: 'hero-1', top: 0, left: 0, width: 800, height: 100 },
          { id: 'text-1', top: 100, left: 0, width: 800, height: 100 },
        ],
        scrollHeight: 200,
      });
    });

    // The sidebar/BlockPicker always measures {top:0,left:0,width:0} in
    // this test environment (no real layout in jsdom, and this file does
    // not mock the iframe's getBoundingClientRect the way
    // overlay-layer.spec.tsx does) — pageX 0 is therefore "inside" the
    // canvas by construction, consistent with isOverCanvas in
    // canvas-editor-shell.tsx.
    // Scoped to the inserter: since the layers tree started naming blocks
    // the way a person picked them, a Text block on the canvas is also
    // called "Testo", and an unscoped query cannot tell the tile from
    // the row.
    const testoButton = within(openPalette()).getByRole('button', {
      name: 'Testo',
    });
    fireEvent.pointerDown(testoButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    });
    // Past text-1's midpoint (150) — the drop has to land at the end.
    fireEvent.pointerMove(testoButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 180,
    });
    fireEvent.pointerUp(testoButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 180,
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'hero-1' }),
        expect.objectContaining({ id: 'text-1' }),
        expect.objectContaining({ type: 'Text', props: { body: 'Corpo' } }),
      ]),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:insert-block',
          payload: expect.objectContaining({
            html: '<div data-kometio-block-id="new-text">Corpo</div>',
            parentId: null,
            beforeBlockId: null,
          }),
        }),
        '*',
      ),
    );
  });

  it('dragging a block from the picker while a container is selected nests it as a child, instead of landing at root', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne aggiornate</div>',
    );
    const { onChange } = renderShell({
      blocks: [{ id: 'columns-1', type: 'Columns', props: {}, children: [] }],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'columns-1', {
      top: 0,
      left: 0,
      width: 800,
      height: 40,
    });

    const colonnaButton = within(openPalette()).getByRole('button', {
      name: 'Colonna',
    });
    fireEvent.pointerDown(colonnaButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    });
    // The same (0,0) point as the root-insert test above — "inside the
    // canvas" by construction in this test environment. The point does not
    // matter here for the position (a selected container always nests at
    // the end of its children, the same rule resolveInsertTarget uses for a
    // click), only for crossing the 4px threshold that starts the drag.
    fireEvent.pointerMove(colonnaButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 5,
    });
    fireEvent.pointerUp(colonnaButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 5,
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'columns-1',
          type: 'Columns',
          children: [expect.objectContaining({ type: 'Column' })],
        }),
      ]),
    );
    // Not "editor:insert-block" for the new child on its own: the PARENT
    // (Columns) has to be regenerated and re-patched in full through
    // "editor:patch-block" — otherwise the container-resolution heuristic
    // in preview-bridge-client.ts would assume <slot/> is the sole content
    // of the container block's root, which is false for blocks like
    // Testimonials (navigation buttons plus a placeholder around the slot).
    await waitFor(() =>
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({
          blockId: 'columns-1',
          blockType: 'Columns',
          children: [expect.objectContaining({ type: 'Column' })],
        }),
      ),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:patch-block',
          payload: expect.objectContaining({
            blockId: 'columns-1',
            html: '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne aggiornate</div>',
          }),
        }),
        '*',
      ),
    );
  });

  it('the "Aggiungi elemento" button on a selected collection container adds one more child of its canonical type, no picker needed', async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne con due colonne</div>',
    );
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'columns-1',
          type: 'Columns',
          props: {},
          children: [{ id: 'column-1', type: 'Column', props: {} }],
        },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'columns-1', {
      top: 0,
      left: 0,
      width: 800,
      height: 80,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi elemento' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'columns-1',
          children: [
            expect.objectContaining({ id: 'column-1', type: 'Column' }),
            expect.objectContaining({ type: 'Column' }),
          ],
        }),
      ]),
    );
    await waitFor(() =>
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({
          blockId: 'columns-1',
          blockType: 'Columns',
          children: expect.arrayContaining([
            expect.objectContaining({ id: 'column-1' }),
            expect.objectContaining({ type: 'Column' }),
          ]),
        }),
      ),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:patch-block',
          payload: expect.objectContaining({ blockId: 'columns-1' }),
        }),
        '*',
      ),
    );
  });

  it('the "Aggiungi elemento" button is absent for a block that is not a container, and for a generic container with no single canonical child type', async () => {
    renderShell({
      blocks: [{ id: 'hero-1', type: 'Hero', props: { title: 'Titolo' } }],
    });
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    expect(
      screen.queryByRole('button', { name: 'Aggiungi elemento' }),
    ).toBeNull();
  });

  it('dragging a block from the picker but releasing outside the canvas cancels the insert', async () => {
    const { onChange } = renderShell({ blocks: [] });
    await findCanvasIframe();

    // Scoped to the inserter: since the layers tree started naming blocks
    // the way a person picked them, a Text block on the canvas is also
    // called "Testo", and an unscoped query cannot tell the tile from
    // the row.
    const testoButton = within(openPalette()).getByRole('button', {
      name: 'Testo',
    });
    fireEvent.pointerDown(testoButton, {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    });
    // The iframe's width is 0 in this test environment — any positive
    // clientX therefore falls outside its bounds by construction.
    fireEvent.pointerMove(testoButton, {
      pointerId: 1,
      clientX: 999,
      clientY: 50,
    });
    fireEvent.pointerUp(testoButton, {
      pointerId: 1,
      clientX: 999,
      clientY: 50,
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("moving the selected block down via the toolbar's arrows reorders it and patches the canvas", async () => {
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'hero-1',
          type: 'Hero',
          props: { title: 'Titolo', subtitle: 'Sottotitolo' },
        },
        { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Sposta giù' }));

    expect(onChange).toHaveBeenCalledWith([
      { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo', subtitle: 'Sottotitolo' },
      },
    ]);
    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:reorder-blocks',
        payload: { parentId: null, orderedIds: ['text-1', 'hero-1'] },
      },
      '*',
    );
  });

  it("moving a NESTED block via the toolbar's arrows re-patches its parent instead of editor:reorder-blocks", async () => {
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<div data-kometio-block-id="columns-1" data-kometio-block-type="Columns">colonne riordinate</div>',
    );
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'columns-1',
          type: 'Columns',
          props: {},
          children: [
            { id: 'column-1', type: 'Column', props: {} },
            { id: 'column-2', type: 'Column', props: {} },
          ],
        },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    selectBlockWithRect(iframe, 'column-1', {
      top: 0,
      left: 0,
      width: 400,
      height: 40,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sposta giù' }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'columns-1',
        children: [
          expect.objectContaining({ id: 'column-2' }),
          expect.objectContaining({ id: 'column-1' }),
        ],
      }),
    ]);
    await waitFor(() =>
      expect(blockFragmentApi.renderBlockFragment).toHaveBeenCalledWith(
        expect.objectContaining({
          blockId: 'columns-1',
          blockType: 'Columns',
          children: [
            expect.objectContaining({ id: 'column-2' }),
            expect.objectContaining({ id: 'column-1' }),
          ],
        }),
      ),
    );
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'editor:patch-block',
          payload: expect.objectContaining({ blockId: 'columns-1' }),
        }),
        '*',
      ),
    );
    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'editor:reorder-blocks' }),
      '*',
    );
  });

  it('publish sends the current local block tree', async () => {
    const { onPublish, blocks } = renderShell();
    await findCanvasIframe();

    fireEvent.click(screen.getByRole('button', { name: 'Pubblica' }));

    expect(onPublish).toHaveBeenCalledWith(blocks);
  });

  it('double-clicking an inlineEditable field enters text edit on the iframe', async () => {
    renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    act(() => {
      dispatchFromIframe(iframe, 'preview:dblclick', {
        blockId: 'hero-1',
        field: 'title',
      });
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:enter-text-edit',
        payload: {
          blockId: 'hero-1',
          field: 'title',
          richText: false,
          // Translated on this side: the preview document is a rendered
          // site in the visitor's language, not the editor's.
          labels: expect.objectContaining({ bold: expect.any(String) }),
        },
      },
      '*',
    );
  });

  it('double-clicking a field that is not inlineEditable does nothing', async () => {
    renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    act(() => {
      dispatchFromIframe(iframe, 'preview:dblclick', {
        blockId: 'hero-1',
        field: 'subtitle',
      });
    });

    expect(postMessageSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'editor:enter-text-edit' }),
      expect.anything(),
    );
  });

  it('typing live in TipTap updates the tree optically and saves after its own debounce', async () => {
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();

    act(() => {
      dispatchFromIframe(iframe, 'preview:text-changed', {
        blockId: 'hero-1',
        field: 'title',
        text: 'Digitato dal vivo',
      });
    });

    // Visible immediately, before the save debounce.
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    focusPropertiesPanel();
    expect(screen.getByDisplayValue('Digitato dal vivo')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Digitato dal vivo', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  it('dragging a block past another on the canvas reorders the root blocks', async () => {
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'hero-1',
          type: 'Hero',
          props: { title: 'Titolo', subtitle: 'Sottotitolo' },
        },
        { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      ],
    });
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    act(() => {
      dispatchFromIframe(iframe, 'preview:ready', {
        blockRects: [
          { id: 'hero-1', top: 0, left: 0, width: 800, height: 100 },
          { id: 'text-1', top: 100, left: 0, width: 800, height: 100 },
        ],
        scrollHeight: 200,
      });
    });

    // Drag hero-1 (at the top) past text-1's midpoint (150) — it has to
    // end up after it.
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-start', {
        blockId: 'hero-1',
        pointer: { x: 10, y: 10 },
      });
    });
    expect(screen.queryByTestId('drop-indicator')).toBeTruthy();

    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-move', {
        pointer: { x: 10, y: 180 },
      });
    });
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-end', {});
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo', subtitle: 'Sottotitolo' },
      },
    ]);
    expect(screen.queryByTestId('drop-indicator')).toBeNull();
    await waitFor(() =>
      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: PREVIEW_BRIDGE_SOURCE,
          v: PREVIEW_BRIDGE_VERSION,
          type: 'editor:reorder-blocks',
          payload: { parentId: null, orderedIds: ['text-1', 'hero-1'] },
        },
        '*',
      ),
    );
  });

  it('dragging without crossing any midpoint leaves the root order unchanged (no spurious onChange)', async () => {
    const { onChange } = renderShell({
      blocks: [
        {
          id: 'hero-1',
          type: 'Hero',
          props: { title: 'Titolo', subtitle: 'Sottotitolo' },
        },
        { id: 'text-1', type: 'Text', props: { body: 'Corpo' } },
      ],
    });
    const iframe = await findCanvasIframe();

    act(() => {
      dispatchFromIframe(iframe, 'preview:ready', {
        blockRects: [
          { id: 'hero-1', top: 0, left: 0, width: 800, height: 100 },
          { id: 'text-1', top: 100, left: 0, width: 800, height: 100 },
        ],
        scrollHeight: 200,
      });
    });

    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-start', {
        blockId: 'hero-1',
        pointer: { x: 10, y: 10 },
      });
    });
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-end', {});
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pressing Escape exits text edit on the iframe', async () => {
    renderShell();
    const iframe = await findCanvasIframe();
    const postMessageSpy = vi.spyOn(
      iframe.contentWindow as Window,
      'postMessage',
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:exit-text-edit',
        payload: {},
      },
      '*',
    );
  });

  it('the undo/redo buttons start disabled, and undo becomes enabled after a change', async () => {
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    expect(
      screen.getByRole('button', { name: 'Annulla' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Ripeti' }).hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(onChange).toHaveBeenCalledWith([]);
    expect(
      screen.getByRole('button', { name: 'Annulla' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('clicking Annulla restores the block removed by the previous action', async () => {
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    vi.mocked(onChange).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  it('Ctrl+Z triggers undo', async () => {
    const { onChange } = renderShell();
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    vi.mocked(onChange).mockClear();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Titolo', subtitle: 'Sottotitolo' },
      },
    ]);
  });

  it('Ctrl+Z is ignored while typing in a text input, leaving the browser its own native undo', async () => {
    renderShell();
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    // The Undo button stays enabled: the shortcut was not taken up by this
    // listener (or the stack would already be empty).
    expect(
      screen.getByRole('button', { name: 'Annulla' }).hasAttribute('disabled'),
    ).toBe(false);
    input.remove();
  });

  // A debounced save belongs to the page it was scheduled on. The shell is
  // NOT remounted when you switch language (it resyncs `blocks` from props),
  // so a timer still in flight used to fire against whatever tree had
  // meanwhile taken its place. Two blocks on purpose: the edited one looks
  // identical either way, the SIBLING is what says which page was saved.
  it('saves an in-flight edit against the page it was made on, not the one switched to', async () => {
    const italian: Block[] = [
      { id: 'hero-1', type: 'Hero', props: { title: 'Ciao', subtitle: 'S' } },
      { id: 'text-1', type: 'Text', props: { body: 'IT' } },
    ];
    const english: Block[] = [
      { id: 'hero-1', type: 'Hero', props: { title: 'Hello', subtitle: 'S' } },
      { id: 'text-1', type: 'Text', props: { body: 'EN' } },
    ];
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<section>hero</section>',
    );
    const onChange = vi.fn();
    const { switchPage } = renderShell({ blocks: italian, onChange });
    const iframe = await findCanvasIframe();

    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);
    focusPropertiesPanel();
    fireEvent.change(screen.getByDisplayValue('Ciao'), {
      target: { value: 'Ciao a tutti' },
    });

    // Switch language well inside the 300ms debounce window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => switchPage('page-2', english));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const saved = onChange.mock.calls
      .map(([tree]) => tree as Block[])
      .filter((tree) => tree[0]?.props?.title === 'Ciao a tutti');
    expect(saved.length).toBeGreaterThan(0);
    for (const tree of saved) {
      expect(tree[1]?.props?.body).toBe('IT');
    }
  });

  /*
   * The canvas draws the draft the server renders. A restore used to reset
   * only the local tree: the layers showed the restored page, the canvas
   * the one before it, until the page was reloaded by hand.
   */
  it('redraws the canvas from the server after a restore', async () => {
    const { restore } = renderShell();
    const before = await findCanvasIframe();

    act(() =>
      restore([
        {
          id: 'hero-1',
          type: 'Hero',
          props: { title: 'Prima', subtitle: 'S' },
        },
      ]),
    );

    const after = await findCanvasIframe();
    expect(after).not.toBe(before);
  });
});

/*
 * Two shortcuts existed before Fase 7 — undo and redo — and every other
 * gesture needed the mouse. These are the ones the plan asks for, plus
 * the guard that keeps them out of the way of ordinary typing.
 */
describe('CanvasEditorShell keyboard shortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The panels remember being collapsed now (see
    // side-panel-preferences.ts), and localStorage outlives a test: without
    // this, the test that collapses the right panel leaves it collapsed for
    // every test after it.
    localStorage.clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('deletes the selected block with Delete', async () => {
    const onChange = vi.fn();
    renderShell({ onChange });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('duplicates the selected block with Cmd+D', async () => {
    const onChange = vi.fn();
    renderShell({ onChange });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    fireEvent.keyDown(window, { key: 'd', metaKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(2);
    // A copy, not the same block twice: the ids key the per-instance style
    // rule and the translation overlay.
    expect(next[1].id).not.toBe('hero-1');
    expect(next[1].props).toEqual(next[0].props);
  });

  /*
   * Copy/paste is the editor's own clipboard, not the system one: reading
   * that needs a permission prompt, and writing a block to it as text
   * would put a wall of JSON into whatever the person pastes into next.
   */
  it('copies and pastes a block with Cmd+C then Cmd+V', async () => {
    const onChange = vi.fn();
    renderShell({ onChange });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'v', metaKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(2);
    expect(next[1].id).not.toBe('hero-1');
  });

  it('pastes nothing when nothing was copied', async () => {
    const onChange = vi.fn();
    renderShell({ onChange });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    fireEvent.keyDown(window, { key: 'v', metaKey: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  /*
   * Alt, not a bare arrow: the arrows scroll, and taking that away from
   * somebody reading a long page would be the wrong trade.
   */
  it('moves the selected block with Alt+Arrow', async () => {
    const onChange = vi.fn();
    renderShell({
      onChange,
      blocks: [
        { id: 'hero-1', type: 'Hero', props: { title: 'A', subtitle: '' } },
        { id: 'hero-2', type: 'Hero', props: { title: 'B', subtitle: '' } },
      ],
    });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-2', HERO_RECT);

    fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next.map((block) => block.id)).toEqual(['hero-2', 'hero-1']);
  });

  /*
   * The guard that matters: Delete has to delete a character in the
   * editor's own inputs, not the block behind the dialog.
   */
  it('leaves the editor’s own inputs alone', async () => {
    const onChange = vi.fn();
    renderShell({ onChange });
    const iframe = await findCanvasIframe();
    selectBlockWithRect(iframe, 'hero-1', HERO_RECT);

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(onChange).not.toHaveBeenCalled();

    input.remove();
  });
});

/*
 * Dragging on the canvas used to be top-level only, which meant the three
 * columns of a Columns could be reordered from the Layers panel and not
 * from the page they were on — the editor disagreeing with itself about
 * one gesture (Fase 7).
 */
describe('CanvasEditorShell nested canvas drag', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The panels remember being collapsed now (see
    // side-panel-preferences.ts), and localStorage outlives a test: without
    // this, the test that collapses the right panel leaves it collapsed for
    // every test after it.
    localStorage.clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const nested: Block[] = [
    {
      id: 'cols-1',
      type: 'Columns',
      props: {},
      children: [
        { id: 'col-a', type: 'Column', props: {}, children: [] },
        { id: 'col-b', type: 'Column', props: {}, children: [] },
      ],
    },
  ];

  it('reorders a nested block among its own siblings, not at the root', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: nested });
    const iframe = await findCanvasIframe();

    // Rects for both columns, then a drag of the first past the second's
    // midpoint. The block ids are the tree's, so the shell resolves the
    // parent from `locateBlock` rather than assuming the root.
    act(() => {
      dispatchFromIframe(iframe, 'preview:ready', {
        blockRects: [
          { id: 'cols-1', top: 0, left: 0, width: 800, height: 400 },
          { id: 'col-a', top: 0, left: 0, width: 400, height: 200 },
          { id: 'col-b', top: 200, left: 0, width: 400, height: 200 },
        ],
        scrollHeight: 400,
      });
    });
    // `preview:drag-end` carries no payload: the block and the pointer come
    // from the drag already in flight, so a start has to precede it.
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-start', {
        blockId: 'col-a',
        pointer: { x: 10, y: 10 },
      });
    });
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-move', {
        blockId: 'col-a',
        pointer: { x: 10, y: 380 },
      });
    });
    act(() => {
      dispatchFromIframe(iframe, 'preview:drag-end', {});
    });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(1);
    expect(next[0].children?.map((child) => child.id)).toEqual([
      'col-b',
      'col-a',
    ]);
  });
});

/*
 * The bridge carried one `selectedBlockId` and every overlay, toolbar and
 * mutation read it — the change of model the plan warned about (Fase 7).
 * The primary stays that field; the set is what bulk operations act on.
 */
describe('CanvasEditorShell multi-select', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The panels remember being collapsed now (see
    // side-panel-preferences.ts), and localStorage outlives a test: without
    // this, the test that collapses the right panel leaves it collapsed for
    // every test after it.
    localStorage.clear();
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const three: Block[] = [
    { id: 'a', type: 'Hero', props: { title: 'A', subtitle: '' } },
    { id: 'b', type: 'Hero', props: { title: 'B', subtitle: '' } },
    { id: 'c', type: 'Hero', props: { title: 'C', subtitle: '' } },
  ];

  function selectMany(iframe: HTMLIFrameElement, ids: string[]) {
    act(() => {
      dispatchFromIframe(iframe, 'preview:ready', {
        blockRects: ids.map((id, index) => ({
          id,
          top: index * 100,
          left: 0,
          width: 800,
          height: 100,
        })),
        scrollHeight: ids.length * 100,
      });
    });
    ids.forEach((id, index) => {
      act(() => {
        dispatchFromIframe(iframe, 'preview:click', {
          blockId: id,
          additive: index > 0,
        });
      });
    });
  }

  it('deletes every selected block in one go', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'b']);

    fireEvent.keyDown(window, { key: 'Delete' });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next.map((block) => block.id)).toEqual(['c']);
  });

  it('undoes a multi-delete in one step, not one per block', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'b']);

    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    // Somebody who selected two things and pressed Delete asked for one
    // action; two undos to get back would be two surprises.
    expect(next.map((block) => block.id)).toEqual(['a', 'b', 'c']);
  });

  it('duplicates every selected block, each after itself', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'c']);

    fireEvent.keyDown(window, { key: 'd', metaKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(5);
    expect(next[0].id).toBe('a');
    expect(next[1].id).not.toBe('a');
    expect(next[1].props).toEqual(next[0].props);
    expect(next[3].id).toBe('c');
  });

  it('copies and pastes a whole selection, in the order it was copied', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'b']);

    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    fireEvent.keyDown(window, { key: 'v', metaKey: true });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next).toHaveLength(5);
    expect(
      (next[2].props as { title: string }).title +
        (next[3].props as { title: string }).title,
    ).toBe('AB');
  });

  /*
   * Cmd+click on an already-selected block removes it — what every file
   * manager does, and what makes a mis-click recoverable without starting
   * the selection over.
   */
  it('toggles a block out of the selection when it is picked again', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'b']);
    act(() => {
      dispatchFromIframe(iframe, 'preview:click', {
        blockId: 'b',
        additive: true,
      });
    });

    fireEvent.keyDown(window, { key: 'Delete' });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next.map((block) => block.id)).toEqual(['b', 'c']);
  });

  it('a plain click replaces the selection instead of adding to it', async () => {
    const onChange = vi.fn();
    renderShell({ onChange, blocks: three });
    const iframe = await findCanvasIframe();
    selectMany(iframe, ['a', 'b']);
    act(() => {
      dispatchFromIframe(iframe, 'preview:click', { blockId: 'c' });
    });

    fireEvent.keyDown(window, { key: 'Delete' });

    const next = onChange.mock.calls.at(-1)?.[0] as Block[];
    expect(next.map((block) => block.id)).toEqual(['a', 'b']);
  });
});

describe('CanvasEditorShell — what each role is offered (docs/roles.md)', () => {
  it('offers an editor no Publish, and says who publishes instead', async () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderShell();
    await findCanvasIframe();

    expect(screen.queryByRole('button', { name: 'Pubblica' })).toBeNull();
    expect(screen.getByText('La mette online un Publisher')).toBeTruthy();
  });

  it('offers a publisher Publish but not the Style page, which is for who configures the site', async () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('publisher'));
    renderShell({ siteId: 'site-1' });
    await findCanvasIframe();

    expect(screen.getByRole('button', { name: 'Pubblica' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Stili/ })).toBeNull();
  });
});

/*
 * The colours, the theme and the style of every block type used to be in a
 * panel here, a smaller second copy of the Style page. There is one home
 * for them now, and the canvas points at it.
 */
describe('CanvasEditorShell — the Style page', () => {
  it('has a Styles link in the rail that opens the Style page in another tab, so the work here is not interrupted', async () => {
    renderShell({ siteId: 'site-1' });
    await findCanvasIframe();

    const link = screen.getByRole('link', { name: /^Stili/ });
    expect(link.getAttribute('href')).toBe('/style');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // The word stays under the picture; the arrow says it leaves.
    expect(link.textContent).toContain('Stili');
  });

  it('opens the Style page from the search too', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderShell({ siteId: 'site-1' });
    await findCanvasIframe();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const search = await screen.findByRole('combobox', {
      name: 'Cerca blocchi e comandi',
    });
    fireEvent.change(search, { target: { value: 'stili' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        '/style',
        '_blank',
        'noopener,noreferrer',
      ),
    );
    open.mockRestore();
  });
});
