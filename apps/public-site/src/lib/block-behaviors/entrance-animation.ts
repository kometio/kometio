/**
 * The entrance animations of docs/adr/0060 — the generalisation of the
 * pattern `stat.ts` already had right: an `IntersectionObserver` that
 * `unobserve`s an element the first time it arrives, because an entrance
 * happens once.
 *
 * Not a `BlockBehavior`: those are keyed by block TYPE and matched inside
 * a block's own markup, and what animates here is the WRAPPER around a
 * root block, which belongs to no block at all (PublicPageContent.astro).
 *
 * The CSS does all the animating. This file only decides *when*, and
 * whether at all.
 */

/**
 * Put on `<html>` before anything is observed. Every animation rule in
 * global.css hangs off it, which is what makes the whole feature
 * fail-safe: with JavaScript off, or before this runs, no rule matches and
 * every block is simply visible. The animation's first frame is
 * `opacity: 0`, so the opposite order — animate by default, release with
 * JS — would hide an entire page from a reader without JavaScript.
 */
const READY_CLASS = 'kometio-motion-ready';

/** Set on a wrapper once it has arrived; the CSS starts the animation. */
const IN_VIEW_ATTR = 'data-kometio-in-view';

/** Idempotency guard — see run-block-behaviors.ts on why every wiring needs one. */
const OBSERVED_ATTR = 'data-kometio-motion-observed';

/**
 * A tenth of the block, and 80px before the bottom edge.
 *
 * The margin is what stops the animation happening where nobody can see
 * it: without it a block a pixel inside the viewport starts fading in
 * while it is still under the fold, and the reader scrolls onto content
 * that has already finished arriving. The threshold is low because a tall
 * block — a hero, a section — may never have 40% of itself on screen at
 * once, and `stat.ts`'s 0.4 would leave it invisible forever.
 */
const OBSERVER_OPTIONS: IntersectionObserverInit = {
  threshold: 0.1,
  rootMargin: '0px 0px -80px 0px',
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Starts every root block's entrance animation as it arrives.
 *
 * Returns without marking anything when the reader asked for less motion:
 * the CSS drops the animation under `prefers-reduced-motion` anyway, and
 * this saves an observer nobody needs. Both halves are deliberate — CSS
 * alone would leave the observer running, JS alone would miss a reader who
 * changes the setting after load.
 */
export function initEntranceAnimations(root: ParentNode = document): void {
  if (prefersReducedMotion()) {
    return;
  }
  // `IntersectionObserver` is everywhere this product supports, but the
  // check costs nothing and the failure it prevents is a blank page:
  // without it, the ready class would be set, the blocks would sit on
  // their first frame, and nothing would ever release them.
  if (typeof IntersectionObserver !== 'function') {
    return;
  }

  document.documentElement.classList.add(READY_CLASS);

  const observer = new IntersectionObserver((entries, self) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      entry.target.setAttribute(IN_VIEW_ATTR, '');
      // Once. An entrance that replayed on every scroll past would be a
      // page that will not sit still.
      self.unobserve(entry.target);
    }
  }, OBSERVER_OPTIONS);

  for (const wrapper of root.querySelectorAll<HTMLElement>(
    '.kometio-root-block',
  )) {
    if (wrapper.hasAttribute(OBSERVED_ATTR)) {
      continue;
    }
    wrapper.setAttribute(OBSERVED_ATTR, '');
    // Already on screen when the page loaded — the observer would report
    // it on its first callback anyway, so this is only about not making
    // the first screenful wait a frame for that callback.
    if (isAlreadyInView(wrapper)) {
      wrapper.setAttribute(IN_VIEW_ATTR, '');
      continue;
    }
    observer.observe(wrapper);
  }
}

function isAlreadyInView(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}
