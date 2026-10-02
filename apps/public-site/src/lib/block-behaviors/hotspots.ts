import type { BlockBehavior } from './types';

const INITIALIZED_ATTR = 'data-kometio-hotspots-initialized';

/**
 * What <details> does not do on its own for a set of points on a picture:
 * one open at a time, and Escape or a click elsewhere closing it.
 *
 * Scoped to one picture, not the page — `<details name>` would do the
 * first part natively, but for every picture at once, so opening a point
 * in one gallery would close another gallery's.
 */
function wireHotspots(root: HTMLElement): void {
  if (root.hasAttribute(INITIALIZED_ATTR)) return;
  root.setAttribute(INITIALIZED_ATTR, '');
  const doc = root.ownerDocument;
  const points = () =>
    Array.from(root.querySelectorAll<HTMLDetailsElement>('.kometio-hotspot'));

  // `toggle` does not bubble, so it is listened for on the way down.
  root.addEventListener(
    'toggle',
    (event) => {
      const opened = event.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
      for (const point of points()) {
        if (point !== opened) point.open = false;
      }
    },
    true,
  );

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = points().find((point) => point.open);
    if (!open) return;
    open.open = false;
    open.querySelector<HTMLElement>('summary')?.focus();
  });

  listenForClicksOutside(doc);
}

/**
 * One listener for the whole document, however many pictures there are
 * and however often they are wired again: it was added once per wiring,
 * and every re-render in the canvas left another one behind, still
 * closing points on pictures that were no longer on the page.
 */
const documentsListening = new WeakSet<Document>();

function listenForClicksOutside(doc: Document): void {
  if (documentsListening.has(doc)) return;
  documentsListening.add(doc);
  doc.addEventListener('click', (event) => {
    const target = event.target;
    const inPoint =
      target instanceof Element ? target.closest('.kometio-hotspot') : null;
    for (const point of doc.querySelectorAll<HTMLDetailsElement>(
      '.kometio-image-hotspots .kometio-hotspot[open]',
    )) {
      if (point !== inPoint) point.open = false;
    }
  });
}

export const hotspotBehaviors: BlockBehavior[] = [
  { selector: '.kometio-image-hotspots', wire: wireHotspots },
];
