import type { BlockBehavior } from './types';

// One scroll listener per bar, guarded so a canvas re-run does not add a
// second (see run-block-behaviors.ts on why `wire` must be idempotent).
const INITIALIZED_ATTR = 'data-kometio-reading-progress-initialized';

/** How far down the page the reader is, from 0 to 1. A page that does not scroll is fully read. */
export function readingProgress(
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const scrollable = scrollHeight - viewportHeight;
  if (scrollable <= 0) return 1;
  return Math.min(Math.max(scrollTop / scrollable, 0), 1);
}

function wireReadingProgress(bar: HTMLElement): void {
  if (bar.hasAttribute(INITIALIZED_ATTR)) return;
  bar.setAttribute(INITIALIZED_ATTR, '');
  const view = bar.ownerDocument.defaultView;
  const root = bar.ownerDocument.documentElement;
  if (!view) return;

  let scheduled = false;
  const update = () => {
    scheduled = false;
    bar.style.setProperty(
      '--kometio-reading-progress',
      String(
        readingProgress(view.scrollY, root.scrollHeight, view.innerHeight),
      ),
    );
  };
  // Once per frame at most: a scroll event fires far more often than the
  // screen can show the difference.
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    view.requestAnimationFrame(update);
  };
  update();
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', schedule, { passive: true });
}

export const readingProgressBehaviors: BlockBehavior[] = [
  { selector: '.kometio-reading-progress', wire: wireReadingProgress },
];
