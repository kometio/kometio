/**
 * The scroll behaviour to ask for, given what the reader asked for
 * (docs/adr/0060).
 *
 * `scroll-behavior: auto !important` in a `prefers-reduced-motion` block
 * does NOT cover these calls: an explicit `behavior: 'smooth'` passed to
 * `scrollTo`/`scrollIntoView` is a JavaScript argument, not a CSS
 * declaration, and no stylesheet can override it. Every such call has to
 * ask, which is why this is one function rather than the same three lines
 * repeated at each site.
 *
 * Read on every call and never cached: the setting can change while the
 * page is open, and a value captured at load would keep animating for a
 * reader who just turned it off.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
