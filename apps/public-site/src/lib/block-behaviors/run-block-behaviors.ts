import type { BlockBehavior } from './types';

// Shared by every block's own <script> (at initial page load, root =
// document) and by the preview-bridge dispatcher (root = one
// [data-kometio-block-type] wrapper, after a live insert/patch — see
// block-behavior-registry.ts). `wire` is called once per matched element
// each time this runs, which is why every behavior's own `wire` must be
// idempotent: a live-patched block can legitimately have its behaviors
// re-run on an element that was already wired up once before.
export function runBlockBehaviors(
  root: ParentNode,
  behaviors: BlockBehavior[],
): void {
  for (const { selector, wire } of behaviors) {
    root.querySelectorAll<HTMLElement>(selector).forEach(wire);
  }
}
