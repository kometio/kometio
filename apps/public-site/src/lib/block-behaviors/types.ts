// A block's client-side behavior is a CSS selector (scoped to whatever root
// it's queried against — `document` at initial page load, or a single
// `[data-kometio-block-type]` wrapper when re-run after a live canvas
// insert/patch, see run-block-behaviors.ts) plus the function that wires up
// one matched element. `wire` must be safe to call more than once on the
// SAME element — see each block's own file for why (idempotency guards).
export interface BlockBehavior {
  selector: string;
  wire: (element: HTMLElement) => void;
}
