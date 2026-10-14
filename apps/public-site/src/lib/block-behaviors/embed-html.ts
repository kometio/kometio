import type { BlockBehavior } from './types';

// Idempotency guard: re-running this on the SAME iframe would attach a
// second `message` listener, double-setting the same height — harmless
// but wasteful. See run-block-behaviors.ts.
const INITIALIZED_ATTR = 'data-kometio-embed-html-initialized';

// One listener per iframe instance (not one page-level listener matching
// by `event.source`) — several EmbedHtml blocks can coexist, and this
// shape is what lets a live-inserted block get wired up on its own too,
// the same as every other block behavior.
function wireEmbedHtmlResize(frame: HTMLElement): void {
  if (
    !(frame instanceof HTMLIFrameElement) ||
    frame.hasAttribute(INITIALIZED_ATTR)
  ) {
    return;
  }
  frame.setAttribute(INITIALIZED_ATTR, '');

  window.addEventListener('message', (event) => {
    const data = event.data as { kometioEmbedHtmlHeight?: unknown } | null;
    if (!data || typeof data.kometioEmbedHtmlHeight !== 'number') return;
    if (frame.contentWindow === event.source) {
      frame.style.height = `${data.kometioEmbedHtmlHeight}px`;
    }
  });
}

export const embedHtmlBehaviors: BlockBehavior[] = [
  { selector: '.kometio-embed-html__frame', wire: wireEmbedHtmlResize },
];

/**
 * An embed that waits for the banner shows a note where it will be, with a
 * way to open the preferences. Once the embed itself is there the note is
 * gone: it had nothing left to say (docs/adr/0131).
 */
export function settleEmbeds(root: ParentNode): void {
  for (const note of root.querySelectorAll('.kometio-embed-html__consent')) {
    const embed = note.closest('.kometio-embed-html');
    if (embed?.querySelector('.kometio-embed-html__frame')) {
      note.remove();
    }
  }
}
