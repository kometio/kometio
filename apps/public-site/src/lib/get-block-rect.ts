export interface SimpleRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function toSimpleRect(rect: DOMRect): SimpleRect {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * `getBoundingClientRect()` on a `display:contents` element is always empty
 * (browsers never generate a box for it) — BlockRenderer.astro's wrapper div
 * uses `display:contents` on purpose (see its own comment: a real box there
 * would break Columns/FeatureGrid/etc.'s CSS grid, the same bug this
 * codebase already fixed once in Column.astro). A `Range` spanning the
 * wrapper's children measures its rendered content instead, and works
 * identically for an ordinary (non `display:contents`) element too, so
 * callers never need to special-case either shape.
 */
export function getBlockRect(element: Element): SimpleRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return toSimpleRect(range.getBoundingClientRect());
}
