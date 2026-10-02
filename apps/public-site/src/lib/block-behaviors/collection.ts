import type { BlockBehavior } from './types';
import { carouselScrollSign } from './carousel-scroll-direction';
import { preferredScrollBehavior } from '../scroll-behavior';

/**
 * Prev/next for every scrolling collection (ADR-0052).
 *
 * This replaces `image-slider.ts` and `testimonials.ts`, which were the
 * same thirty lines twice: they differed by the class they queried and by
 * whether one press moved a card's width or the track's. Both differences
 * are now data — the class is shared, and the step is an attribute the
 * block sets.
 *
 * Native CSS scroll-snap already makes the track swipeable and scrollable
 * with no JS at all; these buttons are a progressive-enhancement layer on
 * top, not the only way to move it.
 */
const INITIALIZED_ATTR = 'data-kometio-collection-initialized';

/** The gap between items, so a step lands on an item rather than drifting by the gap each press. */
function trackGap(track: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(track).columnGap);
  return Number.isFinite(gap) ? gap : 0;
}

function wireCollection(collection: HTMLElement): void {
  // Idempotency guard: re-running this on an already-wired collection
  // would attach a second pair of click listeners to the same buttons.
  // See run-block-behaviors.ts.
  if (collection.hasAttribute(INITIALIZED_ATTR)) return;
  collection.setAttribute(INITIALIZED_ATTR, '');

  const track = collection.querySelector<HTMLElement>(
    '.kometio-collection__track',
  );
  if (!track) return;

  const step = collection.dataset.kometioCollectionStep ?? 'item';
  const scrollByOneStep = (direction: 1 | -1) => {
    // `item` measures a real child rather than assuming a width: the
    // items are grid-sized (`grid-auto-columns`), so the number lives in
    // the stylesheet, not here.
    const firstItem = track.firstElementChild as HTMLElement | null;
    const distance =
      step === 'track'
        ? track.clientWidth
        : (firstItem?.offsetWidth ?? track.clientWidth) + trackGap(track);
    track.scrollBy({
      left: carouselScrollSign(track, direction) * distance,
      behavior: preferredScrollBehavior(),
    });
  };

  collection
    .querySelector('.kometio-collection__nav--prev')
    ?.addEventListener('click', () => scrollByOneStep(-1));
  collection
    .querySelector('.kometio-collection__nav--next')
    ?.addEventListener('click', () => scrollByOneStep(1));
}

export const collectionBehaviors: BlockBehavior[] = [
  // Only the arrangements that scroll — a grid has no nav buttons to wire.
  {
    selector: '.kometio-collection--slider, .kometio-collection--carousel',
    wire: wireCollection,
  },
];
