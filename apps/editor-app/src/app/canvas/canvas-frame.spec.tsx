import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { BREAKPOINT_WIDTHS } from './breakpoint-selector';
import { findCanvasIframe } from '../../test/preview-bridge.test-fixture';
import {
  buildPreviewUrl,
  CanvasFrame,
  READY_AFTER_LOAD_MS,
  READY_TIMEOUT_MS,
} from './canvas-frame';
import type { PreviewBridgeState } from './use-preview-bridge';

vi.mock('../../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/preview-token-api-client')>();
  return {
    ...actual,
    createTranslationPreviewToken: vi.fn(),
    createReusableSectionPreviewToken: vi.fn(),
  };
});

const emptyBridge: PreviewBridgeState = {
  blockRects: [],
  isReady: false,
  hoveredBlockId: null,
  selectedBlockId: null,
  selectedBlockIds: [],
  lastDblClick: null,
  pageLinkRequest: null,
  lastTextChange: null,
  activeDrag: null,
  dragEnded: null,
  patchBlock: vi.fn(),
  insertBlock: vi.fn(),
  removeBlock: vi.fn(),
  reorderBlocks: vi.fn(),
  enterTextEdit: vi.fn(),
  exitTextEdit: vi.fn(),
  selectBlock: vi.fn(),
  updateBlockStyleCss: vi.fn(),
  setRootLayout: vi.fn(),
  scrollToBlock: vi.fn(),
  applyPageLink: vi.fn(),
  markLoading: vi.fn(),
};

describe('buildPreviewUrl', () => {
  it('builds a plain page preview URL with just the token', () => {
    const url = buildPreviewUrl('page-1', 'tok123');
    expect(url).toBe(`${PUBLIC_SITE_URL}/preview/page-1?token=tok123`);
  });

  it('adds editingSection when editing header/footer', () => {
    const url = buildPreviewUrl('page-1', 'tok123', 'header');
    expect(url).toBe(
      `${PUBLIC_SITE_URL}/preview/page-1?token=tok123&editingSection=header`,
    );
  });

  it('adds embedded=1 only when explicitly true (the canvas iframe, not the standalone preview button)', () => {
    const embeddedUrl = buildPreviewUrl('page-1', 'tok123', undefined, true);
    expect(embeddedUrl).toBe(
      `${PUBLIC_SITE_URL}/preview/page-1?token=tok123&embedded=1`,
    );

    const standaloneUrl = buildPreviewUrl('page-1', 'tok123');
    expect(standaloneUrl).not.toContain('embedded');
  });
});

describe('CanvasFrame', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  type FrameProps = Partial<Parameters<typeof CanvasFrame>[0]>;

  /** One frame, re-rendered with other props the way its caller would — same iframe ref throughout. */
  function renderFrame(props: FrameProps = {}) {
    const iframeRef = createRef<HTMLIFrameElement>();
    const element = (next: FrameProps) => (
      <CanvasFrame
        pageId="page-1"
        iframeRef={iframeRef}
        bridge={emptyBridge}
        {...next}
      />
    );
    const utils = render(element(props));
    return {
      ...utils,
      rerenderWith: (next: FrameProps) => utils.rerender(element(next)),
    };
  }

  function mockPageTokens(...tokens: string[]) {
    for (const token of tokens) {
      vi.mocked(
        previewTokenApi.createTranslationPreviewToken,
      ).mockResolvedValueOnce({ token, expiresAt: new Date().toISOString() });
    }
  }

  const LOADING = 'Caricamento della pagina…';
  const NOT_LOADED = 'Non è stato possibile caricare la pagina nel canvas.';

  it('creates a preview token and loads the iframe at the resulting URL', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame();

    await waitFor(() =>
      expect(screen.getByTitle('Anteprima pagina').getAttribute('src')).toBe(
        `${PUBLIC_SITE_URL}/preview/page-1?token=tok123&embedded=1`,
      ),
    );
    expect(previewTokenApi.createTranslationPreviewToken).toHaveBeenCalledWith(
      'page-1',
    );
  });

  it('says the page is loading until it answers, and is not ready again from the moment the page changes', async () => {
    mockPageTokens('tok1', 'tok2');

    const { rerenderWith } = renderFrame();

    expect(screen.getByText(LOADING).getAttribute('role')).toBe('status');
    await findCanvasIframe();
    expect(emptyBridge.markLoading).toHaveBeenCalledTimes(1);

    rerenderWith({ bridge: { ...emptyBridge, isReady: true } });
    expect(screen.queryByText(LOADING)).toBeNull();

    // Another language: the page on screen is the wrong one already,
    // before the new token has come back.
    rerenderWith({
      pageId: 'page-2',
      bridge: { ...emptyBridge, isReady: true },
    });
    expect(emptyBridge.markLoading).toHaveBeenCalledTimes(2);
  });

  /*
   * The section editor builds its `sectionPreview` afresh on every render.
   * Depending on the object minted a new token on every save, and so
   * reloaded the page in the canvas every time.
   */
  it('mints one token for a section however often its editor re-renders', async () => {
    vi.mocked(
      previewTokenApi.createReusableSectionPreviewToken,
    ).mockResolvedValue({ token: 'sec', expiresAt: new Date().toISOString() });

    const { rerenderWith } = renderFrame({
      sectionPreview: { sectionId: 'section-1', locale: 'it' },
    });
    await findCanvasIframe();
    rerenderWith({ sectionPreview: { sectionId: 'section-1', locale: 'it' } });
    rerenderWith({ sectionPreview: { sectionId: 'section-1', locale: 'it' } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      previewTokenApi.createReusableSectionPreviewToken,
    ).toHaveBeenCalledTimes(1);
    expect(emptyBridge.markLoading).toHaveBeenCalledTimes(1);
  });

  it('says the page did not load when it loaded with nothing answering, and loads it again on Retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPageTokens('tok1', 'tok2');

    renderFrame();
    fireEvent.load(await findCanvasIframe());
    await act(() => vi.advanceTimersByTimeAsync(READY_AFTER_LOAD_MS - 100));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(screen.getByRole('alert').textContent).toContain(NOT_LOADED);

    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));

    expect(screen.getByText(LOADING)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByTitle('Anteprima pagina').getAttribute('src') ?? '',
      ).toContain('token=tok2'),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the page did not load when it never finished loading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPageTokens('tok1');

    renderFrame();
    await findCanvasIframe();
    await act(() => vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS));

    expect(screen.getByRole('alert').textContent).toContain(NOT_LOADED);
  });

  it('raises no alarm for a page that answers in time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPageTokens('tok1');

    const { rerenderWith } = renderFrame();
    fireEvent.load(await findCanvasIframe());
    rerenderWith({ bridge: { ...emptyBridge, isReady: true } });
    await act(() => vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sandboxes the iframe without allow-same-origin — the preview can render untrusted user-authored blocks, and allow-same-origin combined with allow-scripts would neutralize the sandbox', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame();

    await waitFor(() =>
      expect(
        screen.getByTitle('Anteprima pagina').getAttribute('sandbox'),
      ).toBe('allow-scripts allow-forms'),
    );
  });

  it('passes editingSection through to the iframe URL', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame({ editingSection: 'footer' });

    await waitFor(() =>
      expect(screen.getByTitle('Anteprima pagina').getAttribute('src')).toBe(
        `${PUBLIC_SITE_URL}/preview/page-1?token=tok123&editingSection=footer&embedded=1`,
      ),
    );
  });

  it('says the page did not load when its token is refused, and asks again on Retry', async () => {
    vi.mocked(
      previewTokenApi.createTranslationPreviewToken,
    ).mockRejectedValueOnce(new Error('boom'));
    mockPageTokens('tok2');

    renderFrame();

    expect((await screen.findByRole('alert')).textContent).toContain(
      NOT_LOADED,
    );
    expect(screen.queryByTitle('Anteprima pagina')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));

    await findCanvasIframe();
    expect(previewTokenApi.createTranslationPreviewToken).toHaveBeenCalledTimes(
      2,
    );
  });

  it('defaults to full width when no breakpoint is given', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame();

    const iframe = await waitFor(() => screen.getByTitle('Anteprima pagina'));
    // Full width, with the stage showing around it: the width comes from
    // the frame's margins rather than from a fixed 100%.
    const frame = iframe.parentElement as HTMLElement;
    expect(frame.style.width).toBe('');
    expect(frame.className).toContain('mx-6');
  });

  it('constrains the iframe to a fixed width for the tablet breakpoint', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame({ breakpoint: 'tablet' });

    const iframe = await waitFor(() => screen.getByTitle('Anteprima pagina'));
    // Read from the table rather than repeated here: the width moved once
    // already (ADR-0047 lifted tablet to the top of its band) and a copy
    // in the assertion only turns that into a failing test to edit.
    expect((iframe.parentElement as HTMLElement).style.width).toBe(
      `${BREAKPOINT_WIDTHS.tablet}px`,
    );
  });

  it('constrains the iframe to a fixed width for the mobile breakpoint', async () => {
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });

    renderFrame({ breakpoint: 'mobile' });

    const iframe = await waitFor(() => screen.getByTitle('Anteprima pagina'));
    expect((iframe.parentElement as HTMLElement).style.width).toBe('375px');
  });
});
