import { BLOCK_BEHAVIOR_REGISTRY } from './block-behavior-registry';
import { runBlockBehaviors } from './run-block-behaviors';

// Called by init-preview-bridge.ts right after a block is live-inserted
// or live-patched into the iframe's DOM. `root` is always a
// [data-kometio-block-id] wrapper (RenderSingleBlock.astro/BlockRenderer.astro
// stamp one on every block when editable=true, which the single-block-
// fragment endpoint always sets) — `root` itself can match, and so can any
// descendant (a live-inserted CONTAINER, e.g. dragging a Columns full of
// blocks onto the canvas in one shot, carries every child's own wrapper
// too).
//
// This exists because a DOM update via outerHTML/insertAdjacentHTML never
// executes any <script> the new markup contains (a well-known HTML parsing
// quirk: a script parsed this way is flagged "already started" and never
// runs, even once connected to the live document) — every block's own
// interactive behavior (Tabs' tab bar, a click listener, ...) has to be
// re-wired explicitly instead of relying on its <script> tag to just work
// again.
export function runBlockBehaviorsInSubtree(root: Element): void {
  const wrappers = [
    ...(root.matches('[data-kometio-block-type]') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('[data-kometio-block-type]'),
  ];

  for (const wrapper of wrappers) {
    const blockType = wrapper.getAttribute('data-kometio-block-type');
    const behaviors = blockType
      ? BLOCK_BEHAVIOR_REGISTRY[blockType]
      : undefined;
    if (behaviors) runBlockBehaviors(wrapper, behaviors);
  }
}
