import type { BlockBehavior } from './types';

// Guarded so a canvas re-run does not add a second click listener to the
// same thumbnail (see run-block-behaviors.ts on why `wire` is idempotent).
const INITIALIZED_ATTR = 'data-kometio-product-gallery-initialized';

/**
 * The next thumbnail an arrow key moves to, wrapping at both ends.
 *
 * "Next" is the way the row reads: in a right-to-left page the left arrow
 * moves forward, because that is where the next picture is.
 */
export function nextThumbnailIndex(
  current: number,
  count: number,
  key: string,
  direction: 'ltr' | 'rtl',
): number | null {
  const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return (current + 1) % count;
  if (key === backward) return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

function wireProductGallery(root: HTMLElement): void {
  if (root.hasAttribute(INITIALIZED_ATTR)) return;
  root.setAttribute(INITIALIZED_ATTR, '');

  const slides = Array.from(
    root.querySelectorAll<HTMLElement>('.kometio-product-gallery__slide'),
  );
  const thumbs = Array.from(
    root.querySelectorAll<HTMLButtonElement>('.kometio-product-gallery__thumb'),
  );
  if (thumbs.length !== slides.length) return;

  const show = (index: number) => {
    slides.forEach((slide, i) => {
      slide.hidden = i !== index;
    });
    thumbs.forEach((thumb, i) => {
      thumb.setAttribute('aria-pressed', String(i === index));
    });
  };

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => show(index));
    thumb.addEventListener('keydown', (event) => {
      const direction =
        getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr';
      const next = nextThumbnailIndex(
        index,
        thumbs.length,
        event.key,
        direction,
      );
      if (next === null) return;
      event.preventDefault();
      show(next);
      thumbs[next]?.focus();
    });
  });
}

export const productGalleryBehaviors: BlockBehavior[] = [
  { selector: '[data-kometio-product-gallery]', wire: wireProductGallery },
];
