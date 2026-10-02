// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_BRIDGE_SOURCE,
  PREVIEW_BRIDGE_VERSION,
} from '@kometio/shared-types';
import { initPreviewBridge } from './init-preview-bridge';

const EDITOR_APP_URL = 'http://localhost:4200';

class FakeResizeObserver {
  observe(): void {
    /* no-op — layout measurement isn't exercised in jsdom */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

/**
 * `initPreviewBridge()` attaches its listeners directly to the shared
 * `document`/`window` (by design — it's meant to run once per real page
 * load, see its own doc comment) — across tests in the SAME jsdom instance
 * that would silently accumulate duplicate listeners. Tracked and removed
 * per test so each `it()` gets a clean slate, same guarantee a real page
 * load gives it.
 */
function trackListeners() {
  const originalDocAdd = document.addEventListener.bind(document);
  const originalWinAdd = window.addEventListener.bind(window);
  const added: {
    target: EventTarget;
    type: string;
    handler: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }[] = [];

  document.addEventListener = ((
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push({ target: document, type, handler, options });
    return originalDocAdd(type, handler, options);
  }) as typeof document.addEventListener;

  window.addEventListener = ((
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push({ target: window, type, handler, options });
    return originalWinAdd(type, handler, options);
  }) as typeof window.addEventListener;

  return {
    cleanup(): void {
      for (const { target, type, handler, options } of added) {
        target.removeEventListener(type, handler, options);
      }
      document.addEventListener = originalDocAdd;
      window.addEventListener = originalWinAdd;
    },
  };
}

function heroFixture(): string {
  return (
    '<div class="mx-auto">' +
    '<div data-kometio-block-id="hero-1" data-kometio-block-type="Hero" style="display:contents">' +
    '<h1 data-kometio-field="title">Titolo</h1>' +
    '</div>' +
    '</div>'
  );
}

function dispatchPostMessage(
  data: unknown,
  origin: string = EDITOR_APP_URL,
): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

function messagesOfType(
  spy: { mock: { calls: unknown[][] } },
  type: string,
): unknown[] {
  return spy.mock.calls
    .map(([msg]) => msg as { type?: string })
    .filter((msg) => msg?.type === type);
}

describe('initPreviewBridge', () => {
  let tracker: ReturnType<typeof trackListeners>;
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    // jsdom doesn't implement Range.getBoundingClientRect at all — assigned
    // directly rather than spied on (spyOn requires the method to
    // pre-exist), same fix as preview-bridge-client.spec.ts's own
    // toBlockRects tests.
    Range.prototype.getBoundingClientRect = vi.fn(
      () => ({ top: 0, left: 0, width: 100, height: 20 }) as DOMRect,
    );
    document.body.innerHTML = heroFixture();
    document.body.dataset['kometioEditorAppUrl'] = EDITOR_APP_URL;
    tracker = trackListeners();
    postMessageSpy = vi.spyOn(window, 'postMessage');
  });

  afterEach(() => {
    tracker.cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete document.body.dataset['kometioEditorAppUrl'];
    window.history.replaceState({}, '', '/');
  });

  it('does nothing when the editor app URL is not set on the body', () => {
    delete document.body.dataset['kometioEditorAppUrl'];

    initPreviewBridge();

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('sends preview:ready on init, with the block rects collected from the document', () => {
    initPreviewBridge();

    const [ready] = messagesOfType(postMessageSpy, 'preview:ready') as {
      payload: { blockRects: { id: string }[] };
    }[];
    expect(ready?.payload.blockRects.map((r) => r.id)).toEqual(['hero-1']);
  });

  it('sends preview:hover with the hovered block id, but only when it changes', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;

    title.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 6 }),
    );
    title.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 6 }),
    );

    const hovers = messagesOfType(postMessageSpy, 'preview:hover') as {
      payload: { blockId: string | null };
    }[];
    expect(hovers).toHaveLength(1);
    expect(hovers[0]?.payload.blockId).toBe('hero-1');
  });

  it('sends preview:hover with blockId null when the pointer leaves every tracked block', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;
    title.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const hovers = messagesOfType(postMessageSpy, 'preview:hover') as {
      payload: { blockId: string | null };
    }[];
    expect(hovers.at(-1)?.payload.blockId).toBeNull();
  });

  it('sends preview:click for a block, and prevents default on a real link inside it', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="link-1" style="display:contents">' +
      '<a href="/somewhere">Vai</a>' +
      '</div>';
    initPreviewBridge();
    const anchor = document.querySelector('a') as HTMLAnchorElement;

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const prevented = !anchor.dispatchEvent(event);

    expect(prevented).toBe(true);
    const clicks = messagesOfType(postMessageSpy, 'preview:click') as {
      payload: { blockId: string };
    }[];
    expect(clicks[0]?.payload.blockId).toBe('link-1');
  });

  it('sends preview:dblclick with the field under the pointer', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;

    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    const dblclicks = messagesOfType(postMessageSpy, 'preview:dblclick') as {
      payload: { blockId: string; field: string | null };
    }[];
    expect(dblclicks[0]?.payload).toEqual({
      blockId: 'hero-1',
      field: 'title',
    });
  });

  it('does not start a drag on mousedown+mouseup alone (a plain click)', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;

    title.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    );
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(messagesOfType(postMessageSpy, 'preview:drag-start')).toHaveLength(
      0,
    );
  });

  it('does not start a drag when the pointer moves less than the threshold', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;

    title.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 11, clientY: 10 }),
    );

    expect(messagesOfType(postMessageSpy, 'preview:drag-start')).toHaveLength(
      0,
    );
  });

  it('starts a drag once the pointer moves past the threshold, and ends it on mouseup', () => {
    initPreviewBridge();
    const title = document.querySelector('h1') as HTMLElement;

    title.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 10,
      }),
    );

    const starts = messagesOfType(postMessageSpy, 'preview:drag-start') as {
      payload: { blockId: string; pointer: { x: number; y: number } };
    }[];
    expect(starts).toHaveLength(1);
    expect(starts[0]?.payload).toEqual({
      blockId: 'hero-1',
      pointer: { x: 30, y: 10 },
    });

    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(messagesOfType(postMessageSpy, 'preview:drag-end')).toHaveLength(1);
  });

  /*
   * The rule this used to assert was the opposite one, and it was the
   * reason the editor disagreed with itself: the three columns of a
   * Columns could be reordered from the Layers panel and not from the page
   * they were on. Depth is decided on the editor's side now, from the
   * tree, so the iframe no longer has an opinion about it (Fase 7).
   */
  it('starts a drag for a nested block too, reporting the block it started on', () => {
    document.body.innerHTML =
      '<div data-kometio-block-id="container-1" style="display:contents">' +
      '<div data-kometio-block-id="text-1" style="display:contents"><p>Testo</p></div>' +
      '</div>';
    initPreviewBridge();
    const paragraph = document.querySelector('p') as HTMLElement;

    paragraph.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY: 10,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 40 }),
    );

    const started = messagesOfType(postMessageSpy, 'preview:drag-start') as {
      payload: { blockId: string };
    }[];
    expect(started).toHaveLength(1);
    expect(started[0]?.payload.blockId).toBe('text-1');
  });

  it('applies editor:patch-block and re-sends block-rects, ignoring a message from the wrong origin', () => {
    initPreviewBridge();
    postMessageSpy.mockClear();

    dispatchPostMessage(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:patch-block',
        payload: {
          blockId: 'hero-1',
          html: '<div data-kometio-block-id="hero-1"><h1 data-kometio-field="title">Nuovo</h1></div>',
        },
      },
      'http://evil.example',
    );
    expect(document.querySelector('h1')?.textContent).toBe('Titolo');

    dispatchPostMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      v: PREVIEW_BRIDGE_VERSION,
      type: 'editor:patch-block',
      payload: {
        blockId: 'hero-1',
        html: '<div data-kometio-block-id="hero-1"><h1 data-kometio-field="title">Nuovo</h1></div>',
      },
    });

    expect(document.querySelector('h1')?.textContent).toBe('Nuovo');
    expect(messagesOfType(postMessageSpy, 'preview:block-rects')).toHaveLength(
      1,
    );
  });

  it('applies editor:insert-block, appending to the page root blocks list', () => {
    document.body.innerHTML =
      '<div data-kometio-root-blocks="page">' +
      '<div data-kometio-block-id="hero-1" data-kometio-block-type="Hero" style="display:contents">' +
      '<h1 data-kometio-field="title">Titolo</h1>' +
      '</div>' +
      '</div>';
    initPreviewBridge();
    postMessageSpy.mockClear();

    dispatchPostMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      v: PREVIEW_BRIDGE_VERSION,
      type: 'editor:insert-block',
      payload: {
        html: '<div data-kometio-block-id="text-1" data-kometio-block-type="Text" style="display:contents"><p data-kometio-field="body">Nuovo</p></div>',
        parentId: null,
        beforeBlockId: null,
      },
    });

    const inserted = document.querySelector('[data-kometio-block-id="text-1"]');
    expect(inserted?.textContent).toBe('Nuovo');
    expect(messagesOfType(postMessageSpy, 'preview:block-rects')).toHaveLength(
      1,
    );
  });

  it('builds the root wrapper of an inserted block from the layout the message carries', () => {
    document.body.innerHTML = '<main data-kometio-root-blocks="page"></main>';
    initPreviewBridge();

    dispatchPostMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      v: PREVIEW_BRIDGE_VERSION,
      type: 'editor:insert-block',
      payload: {
        html: '<div data-kometio-block-id="wide-1" data-kometio-block-type="Text" style="display:contents"><p>Wide</p></div>',
        parentId: null,
        beforeBlockId: null,
        rootLayout: { align: 'wide' },
      },
    });

    const wrapper = document.querySelector(
      '[data-kometio-block-id="wide-1"]',
    )?.parentElement;
    expect(wrapper?.getAttribute('data-kometio-align')).toBe('wide');
  });

  it('scrolls the window to center the matching block on editor:scroll-to-block, ignoring a message from the wrong origin', () => {
    initPreviewBridge();
    // heroFixture's block is measured via the shared Range mock from
    // beforeEach (top: 0, height: 20) — a direct scrollIntoView on it would
    // be a no-op (display:contents wrapper), see scrollBlockIntoView's own
    // comment in preview-bridge-client.ts.
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(500);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    dispatchPostMessage(
      {
        source: PREVIEW_BRIDGE_SOURCE,
        v: PREVIEW_BRIDGE_VERSION,
        type: 'editor:scroll-to-block',
        payload: { blockId: 'hero-1' },
      },
      'http://evil.example',
    );
    expect(scrollToSpy).not.toHaveBeenCalled();

    dispatchPostMessage({
      source: PREVIEW_BRIDGE_SOURCE,
      v: PREVIEW_BRIDGE_VERSION,
      type: 'editor:scroll-to-block',
      payload: { blockId: 'hero-1' },
    });

    // scrollY(500) + rect.top(0) - (innerHeight(800) - rect.height(20)) / 2
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 110, behavior: 'smooth' });
  });

  it('prevents the default form submission', () => {
    document.body.innerHTML = '<form></form>';
    initPreviewBridge();
    const form = document.querySelector('form') as HTMLFormElement;

    const event = new Event('submit', { bubbles: true, cancelable: true });
    const prevented = !form.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});
