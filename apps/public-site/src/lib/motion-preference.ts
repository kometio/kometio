/**
 * Whether this page should hold still: the owner said the site does not
 * move (docs/adr/0142), or the reader asked their system for less.
 *
 * One answer for every script that would otherwise move something — an
 * entrance, a count-up, a smooth scroll — so a third way of asking for
 * stillness cannot be honoured by two of them and forgotten by the
 * fourth. CSS has the same two questions, written once in global.css.
 *
 * Read on every call and never cached: the system setting can change
 * while the page is open.
 */

/** Put on `<html>` by PageLayout when the site's motion switch is off. */
export const MOTION_ATTRIBUTE = 'data-kometio-motion';

/** What the attribute says when it is off; absent means "as the theme says". */
export const MOTION_OFF = 'off';

export function motionIsOff(): boolean {
  if (
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute(MOTION_ATTRIBUTE) === MOTION_OFF
  ) {
    return true;
  }
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
