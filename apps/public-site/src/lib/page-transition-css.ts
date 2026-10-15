/**
 * What a theme with `pageTransitions` in its manifest adds to every page
 * (ADR-0141): going from one page to the next is a cross-fade with a few
 * pixels of rise, and the header and the footer, which are the same on both,
 * do not take part in it.
 *
 * Cross-document view transitions, so nothing runs in the page: no script,
 * no router, and a browser that does not know `@view-transition` (Firefox, at
 * the time of writing) simply cuts, as it always did. Written as a string
 * and emitted by PageLayout rather than kept in global.css because an
 * `@view-transition` rule cannot be switched on by an attribute: a rule that
 * is there is on for every theme.
 *
 * Everything is inside `prefers-reduced-motion: no-preference`: for a reader
 * who asked for less, the rule is not there at all, and global.css drops
 * what is left of the pseudo-elements if the setting changes while the page
 * is open.
 */
export const PAGE_TRANSITION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @view-transition { navigation: auto; }
  body > header { view-transition-name: kometio-header; }
  body > footer { view-transition-name: kometio-footer; }
  ::view-transition-old(root) {
    animation: kometio-page-out var(--kometio-motion-duration, 250ms) var(--kometio-motion-ease, ease-out) both;
  }
  ::view-transition-new(root) {
    animation: kometio-page-in var(--kometio-motion-duration-slow, 600ms) var(--kometio-motion-ease, ease-out) both;
  }
}
@keyframes kometio-page-out { to { opacity: 0; } }
@keyframes kometio-page-in { from { opacity: 0; transform: translateY(12px); } }
`.trim();
