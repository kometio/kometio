import {
  type BlockAlign,
  type BlockRect,
  type RootBlockLayout,
  type SiteLayoutSectionKind,
} from '@kometio/shared-types';
import { getBlockRect } from './get-block-rect';
import { ROOT_BLOCK_CLASS, rootBlockWrapper } from './root-block-layout';
import { preferredScrollBehavior } from './scroll-behavior';

/**
 * Pure parsing/predicate and DOM-patching functions — deliberately kept
 * apart from the orchestrator proper (`initPreviewBridge`, in
 * init-preview-bridge.ts) precisely so each can be tested on its own
 * without mounting the whole bridge (see preview-bridge-client.spec.ts
 * against init-preview-bridge.spec.ts). No module-level state here — every
 * function takes its own `root`/`blockId`/etc. explicitly.
 */

export type EditingSection = SiteLayoutSectionKind;

/**
 * `null` = the page's content is being edited — see the visual editor plan,
 * Day 1/2: the same page-preview route also serves the header/footer,
 * distinguished only by this query param.
 */
export function parseEditingSection(search: string): EditingSection | null {
  const value = new URLSearchParams(search).get('editingSection');
  return value === 'header' || value === 'footer' ? value : null;
}

/**
 * A block is selectable and hoverable only inside the scope currently
 * being edited: inside `<header>` while editing the header, inside
 * `<footer>` while editing the footer, and otherwise — the page itself
 * being edited — only outside both. The rest stays visible for context
 * but inert: never a `preview:hover` or `preview:click` for a block out of
 * scope.
 */
export function isBlockInteractive(
  blockEl: Element,
  editingSection: EditingSection | null,
): boolean {
  const insideHeader = blockEl.closest('header') !== null;
  const insideFooter = blockEl.closest('footer') !== null;
  if (editingSection === 'header') return insideHeader;
  if (editingSection === 'footer') return insideFooter;
  return !insideHeader && !insideFooter;
}

/**
 * Every wrapper BlockRenderer.astro marks when editable=true — minus
 * everything standing inside a section instance.
 *
 * Those blocks are real blocks with real ids (they need them: their
 * per-instance style rules are keyed by id), but they belong to the
 * SECTION and not to this page. They are not in the editor's block tree,
 * so selecting one would highlight something the Inspector cannot show and
 * the Layers panel does not list; dragging one would ask the page to
 * reorder blocks it does not own.
 *
 * Filtered here, at the single place every canvas behaviour gets its
 * elements from, rather than in each of them — that is what makes "you
 * cannot edit a section from a page" (docs/adr/0059) true by construction
 * instead of true in the three code paths somebody remembered.
 */
/**
 * Gives a clickable box to a block that rendered to nothing.
 *
 * Nineteen block types render their root conditionally — an Icon with no
 * icon picked, a Video with no URL, a Social link with no address — and
 * the editor's own wrapper is `display: contents`, which has no box of
 * its own. So a freshly inserted block of those types occupied zero
 * pixels: it could not be selected, edited, or deleted from the canvas,
 * and the only sign it existed at all was a row in the Layers panel.
 * Measured on a page holding one of every type: six of them, including
 * the two that were reported.
 *
 * Marked here rather than fixed in nineteen components: what the public
 * page does is right — an empty block should print nothing for a
 * visitor. It is only the EDITOR that needs to show the thing you are
 * about to fill in, and only the editor runs this.
 */
export function markEmptyBlocks(root: ParentNode): void {
  for (const element of collectBlockElements(root)) {
    if (!(element instanceof HTMLElement)) continue;
    const isEmpty = rendersNothing(element);
    // Written only when it would change something. This function runs
    // from a ResizeObserver watching these very elements, so a write on
    // every pass is a write that schedules the next pass: measured at
    // ~900 attribute changes a second on a seven-block page, which is
    // what a flickering canvas is made of.
    const display = isEmpty ? 'block' : 'contents';
    if (element.style.display !== display) {
      // The wrapper is `display: contents` in the markup, which is what
      // keeps a real block's layout untouched. An empty one has to take
      // up room instead.
      element.style.display = display;
    }
    const marked = element.dataset['kometioEmpty'] !== undefined;
    if (isEmpty && !marked) {
      element.dataset['kometioEmpty'] = '';
    } else if (!isEmpty && marked) {
      delete element.dataset['kometioEmpty'];
    }
  }
}

/**
 * Whether this block put anything on the page, asked without touching it.
 *
 * The wrapper is `display: contents`, so it has no box of its own to
 * measure — the previous answer was to strip the property, read the
 * height and put it back, which is two layout changes per block per
 * pass, and the pass is triggered by layout changes. Reading the
 * DESCENDANTS instead answers the same question: a block that rendered
 * something has something with a box under it, however deeply nested,
 * and a block marked empty stays empty because its placeholder is a
 * pseudo-element rather than a child.
 *
 * Width OR height, not height alone: a rule that draws as a hairline is
 * a real thing on the page.
 */
function rendersNothing(element: HTMLElement): boolean {
  if (element.textContent?.trim()) return false;
  for (const descendant of element.querySelectorAll('*')) {
    const rect = descendant.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return false;
  }
  return true;
}

export function collectBlockElements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('[data-kometio-block-id]')).filter(
    (element) => element.closest('[data-kometio-section-content]') === null,
  );
}

/**
 * The nearest genuinely interactive element (link/button/form/details), if
 * there is one — without intercepting it, the first click on one of these
 * would navigate the iframe away and kill the editing session (Puck did not
 * have this problem: a React portal-rendered canvas, never real anchors).
 */
export function findRealInteractiveAncestor(target: Element): Element | null {
  return target.closest('a, button, details');
}

export function blockIdOf(el: Element): string | null {
  return (el as HTMLElement).dataset['kometioBlockId'] ?? null;
}

/** The nearest `data-kometio-field` value under a click point, within the block's own bounds — `null` when the double click landed on the block but outside every `inlineEditable` field (a padding area, say). */
export function findFieldUnderPointer(
  blockEl: Element,
  target: Element,
): string | null {
  const fieldEl = target.closest('[data-kometio-field]');
  if (!fieldEl || !blockEl.contains(fieldEl)) {
    return null;
  }
  return (fieldEl as HTMLElement).dataset['kometioField'] ?? null;
}

export function toBlockRects(elements: Element[]): BlockRect[] {
  return elements.flatMap((el) => {
    const id = blockIdOf(el);
    if (!id) return [];
    return [{ id, ...getBlockRect(el) }];
  });
}

/**
 * Targeted replacement after render-block-fragment (Day 3) — `html` already
 * carries its own `data-kometio-block-id` wrapper (RenderSingleBlock.astro
 * builds it with the same id), so `outerHTML` replaces exactly the right
 * node. Returns the new element (to re-observe it with the ResizeObserver)
 * or `null` when the block is no longer in the document — removed in the
 * meantime by another action, say, which is not an error worth reporting.
 */
export function applyBlockPatch(
  root: ParentNode,
  blockId: string,
  html: string,
): Element | null {
  const target = root.querySelector(`[data-kometio-block-id="${blockId}"]`);
  if (!target) {
    return null;
  }
  target.outerHTML = html;
  return root.querySelector(`[data-kometio-block-id="${blockId}"]`);
}

/**
 * The wrapper a root block lives in, built to match the one
 * PublicPageContent.astro renders server-side.
 *
 * The new block goes in as the LAST one (that is where an append puts it,
 * and an insert-before hands its own position to the sibling), so it takes
 * the last block's spacing: no default gap below it.
 */
function wrapRootBlock(blockEl: Element, layout: RootBlockLayout): Element {
  const { classNames, align, hover } = rootBlockWrapper({
    id: blockEl.getAttribute('data-kometio-block-id') ?? undefined,
    ...layout,
  });
  const wrapper = document.createElement('div');
  wrapper.className = classNames.join(' ');
  if (align) {
    wrapper.setAttribute('data-kometio-align', align);
  }
  if (hover) {
    wrapper.setAttribute('data-kometio-hover', hover);
  }
  wrapper.appendChild(blockEl);
  return wrapper;
}

/**
 * The `.kometio-root-block` wrapper `el` sits directly inside, if any.
 *
 * A root block is the only block with one as its immediate parent — a
 * nested block has a root wrapper somewhere up the tree too, which is why
 * this checks the parent rather than using `closest`.
 */
function rootWrapperOf(el: Element): Element | null {
  const parent = el.parentElement;
  return parent?.classList.contains(ROOT_BLOCK_CLASS) ? parent : null;
}

/**
 * Sets how much width a root block claims (ADR-0049) — see
 * EditorSetBlockAlignMessage.
 *
 * The attribute goes on the wrapper, not the block: that is where the CSS
 * reads it, and it is also why this is its own message rather than a
 * re-render — patching the block's HTML would replace the element inside
 * the wrapper and leave the wrapper's own attributes exactly as they were.
 *
 * A silent no-op for a block that is not root-level, the same discipline
 * as the rest of the bridge: the editor only offers the control at the top
 * level, and a message arriving for anything else asks for something the
 * page has no way to express.
 */
export function applyRootLayout(
  root: ParentNode,
  blockId: string,
  align: BlockAlign | null,
  hover: string | null,
): boolean {
  const target = root.querySelector(`[data-kometio-block-id="${blockId}"]`);
  const wrapper = target ? rootWrapperOf(target) : null;
  if (!wrapper) {
    return false;
  }
  // Both are written as the ABSENCE of the attribute at their default
  // value, matching how the server renders them — anything else leaves two
  // ways to express the same page, and the canvas showing one while a
  // reload shows the other.
  setOrRemove(
    wrapper,
    'data-kometio-align',
    align && align !== 'content' ? align : null,
  );
  setOrRemove(wrapper, 'data-kometio-hover', hover);
  return true;
}

function setOrRemove(
  el: Element,
  attribute: string,
  value: string | null,
): void {
  if (value) {
    el.setAttribute(attribute, value);
  } else {
    el.removeAttribute(attribute);
  }
}

/**
 * Inserts a block the iframe has NEVER seen before (insert/duplicate) — see
 * EditorInsertBlockMessage. It finds the right DOM container without having
 * to know the internal structure of every container block type
 * (Container/Columns/Accordion/...): if a sibling already exists
 * (`beforeBlockId`), ITS `parentElement` is by construction the right
 * container (every block is a `display:contents` wrapper placed directly as
 * a child of that container, never wrapped in anything else — see
 * BlockRenderer.astro). Otherwise (an empty container, or the root) an
 * explicit reference is needed: the first child of the container block's
 * wrapper (every container block renders `<slot/>` as the sole content of
 * its own root element) for a nested insert, or the
 * `data-kometio-root-blocks="page"/"header"/"footer"` marker
 * (PublicPageContent.astro/PageLayout.astro) for the root, distinguished by
 * scope because the three root lists can coexist on the same page.
 */
export function applyBlockInsert(
  root: ParentNode,
  html: string,
  parentId: string | null,
  beforeBlockId: string | null,
  editingSection: EditingSection | null,
  rootLayout: RootBlockLayout = {},
): Element | null {
  const beforeBlockEl = beforeBlockId
    ? root.querySelector(`[data-kometio-block-id="${beforeBlockId}"]`)
    : null;

  // A ROOT block is not a direct child of its list: PublicPageContent.astro
  // puts every one of them inside a `.kometio-root-block` wrapper carrying
  // the spacing and, since ADR-0049, the width and alignment that used to
  // sit on `<main>`. So the sibling to insert before is that WRAPPER, and
  // the container is the wrapper's parent — using the block element's own
  // parent, as this did, made the new block a CHILD of its neighbour's
  // wrapper: nested inside the block it was supposed to sit above, sharing
  // its spacing and its width.
  //
  // `closest` and not "is the parent a root wrapper": a nested block is
  // inside a root wrapper too, several levels down, and only the one whose
  // wrapper is its immediate parent is a root block.
  const beforeEl = beforeBlockEl
    ? (rootWrapperOf(beforeBlockEl) ?? beforeBlockEl)
    : null;

  const container = beforeEl?.parentElement
    ? beforeEl.parentElement
    : parentId
      ? (root.querySelector(`[data-kometio-block-id="${parentId}"]`)
          ?.firstElementChild ?? null)
      : root.querySelector(
          `[data-kometio-root-blocks="${editingSection ?? 'page'}"]`,
        );
  if (!container) {
    return null;
  }
  // Whether this insert lands in the PAGE's root list, whichever branch
  // above found it — an append with no sibling finds the marker directly,
  // an insert-before finds it as the wrapper's parent.
  //
  // `'page'` specifically, not "any root list": the header and footer lists
  // space their blocks with a flex `gap` on the list itself
  // (PageLayout.astro) and have no per-block wrapper at all. Wrapping a
  // block inserted there would put a div nothing styles between the flex
  // container and its item.
  const isRootInsert =
    container.getAttribute('data-kometio-root-blocks') === 'page';

  const template = document.createElement('template');
  template.innerHTML = html.trim();

  // The real wrapper is not necessarily the fragment's first child: some
  // blocks (Countdown, Form, MapEmbed...) have their own <script> rendered
  // as a sibling of the wrapper — RenderSingleBlock has no shared page to
  // "hang it off", unlike a whole-page render.
  const newNode = template.content.querySelector('[data-kometio-block-id]');
  if (!newNode) {
    return null;
  }

  // A <script> moved here through innerHTML/<template> is flagged "already
  // started" by the spec and NEVER runs on its own, not even once
  // reconnected to the document — it has to be recreated from scratch (the
  // same reason Countdown/Stat/ImageSlider/Tabs/Testimonials/BeforeAfter/
  // Form/MapEmbed stayed empty until the page was reloaded; for Form/
  // NewsletterSignup this also restarts Turnstile's <script src>, which
  // self-renders on every .cf-turnstile it finds). Replaced in place, before
  // any node is moved: if it is nested inside newNode it reconnects by
  // itself when newNode enters the document (the whole subtree connects in
  // one go, before any script inside it runs); if it is a sibling of
  // newNode it stays inside `template.content` and has to be moved
  // separately, immediately afterwards.
  for (const oldScript of Array.from(
    template.content.querySelectorAll('script'),
  )) {
    const freshScript = document.createElement('script');
    for (const { name, value } of Array.from(oldScript.attributes)) {
      freshScript.setAttribute(name, value);
    }
    freshScript.textContent = oldScript.textContent;
    oldScript.replaceWith(freshScript);
  }

  // A root block travels in its wrapper. Building it here rather than
  // asking the server for it keeps the insert a single round trip, and
  // root-block-layout.ts is shared with the page renderer precisely so the
  // two agree: a wrapper missing here is a block rendered outside the
  // content column until the next reload.
  const insertedNode: Element = isRootInsert
    ? wrapRootBlock(newNode, rootLayout)
    : newNode;

  if (beforeEl) {
    container.insertBefore(insertedNode, beforeEl);
  } else {
    // No re-spacing to do on the block that was last (ADR-0050): the gap
    // is `.kometio-root-block:last-child` in CSS now, so moving the last
    // position to another element is something the stylesheet notices on
    // its own. It used to be an inline style computed per block, which
    // meant every insert and delete had to recompute its neighbours'.
    container.appendChild(insertedNode);
  }

  // Every sibling node left in `template.content` (typically the <script>
  // recreated above, when it is a sibling rather than nested) is reattached
  // right after newNode, in the same relative order as the original HTML.
  // `newNode`, not the wrapper around it: a server-rendered page puts the
  // block's sibling <script> inside the same root wrapper as the block
  // itself (the wrapper encloses BlockRenderer's whole output), and the
  // canvas has to match that or the two DOMs differ.
  let anchor: ChildNode = newNode;
  for (const sibling of Array.from(template.content.childNodes)) {
    anchor.after(sibling);
    anchor = sibling;
  }

  return newNode;
}

/**
 * The fixed id of the `<style>` injected for the "component-level" override
 * (docs/adr/0022) — a single element, rewritten in full on every save from
 * the "Style" button (the parent already sends the whole updated
 * `blockStyles` map, not a delta), never accumulated.
 */
const BLOCK_STYLE_CSS_ELEMENT_ID = 'kometio-block-style-overrides';

/** Writes or replaces the `<style>` holding the per-type overrides (docs/adr/0022) — see EditorUpdateBlockStyleCssMessage. It creates the element if there is none yet (the session's first save), and reuses it otherwise. */
export function applyBlockStyleCss(root: Document, css: string): void {
  let styleEl = root.getElementById(BLOCK_STYLE_CSS_ELEMENT_ID);
  if (!styleEl) {
    styleEl = root.createElement('style');
    styleEl.id = BLOCK_STYLE_CSS_ELEMENT_ID;
    root.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/** Removes a deleted block from the iframe's DOM — `true` when a node was actually removed, `false` when it was no longer there (not an error: an earlier action may have taken it out already). */
export function applyBlockRemove(root: ParentNode, blockId: string): boolean {
  const target = root.querySelector(`[data-kometio-block-id="${blockId}"]`);
  if (!target) {
    return false;
  }
  // A root block leaves with its wrapper. Removing the block alone left an
  // empty `.kometio-root-block` behind, still carrying the gap below it — a
  // blank band where the block used to be, until the next reload. It also
  // takes any sibling <script> the block rendered alongside itself, which
  // lives in that same wrapper.
  const wrapper = rootWrapperOf(target);
  // The wrapper goes with the block — see ADR-0049. Nothing to re-space
  // afterwards: the promoted last block picks up `:last-child` by itself.
  (wrapper ?? target).remove();
  return true;
}

/**
 * Reorders the EXISTING siblings (all already rendered) to match
 * `orderedIds` — see EditorReorderBlocksMessage. The container is found
 * through the FIRST sibling still present in the DOM (its `parentElement`,
 * the same heuristic as `applyBlockInsert`): no knowledge of the container
 * block's internal structure is needed. An id in `orderedIds` that is no
 * longer in the DOM is ignored silently — not every sibling necessarily
 * still exists (a removal just applied may not yet be reflected in the list
 * the caller built).
 */
export function applyBlockReorder(
  root: ParentNode,
  parentId: string | null,
  orderedIds: string[],
  editingSection: EditingSection | null,
): void {
  const existing = orderedIds
    .map((id) => root.querySelector(`[data-kometio-block-id="${id}"]`))
    .filter((el): el is Element => el !== null)
    // What moves is the WRAPPER, for a root block: reordering the block
    // elements themselves took the first block's wrapper as the container
    // and then appended every other block INTO it, collapsing the whole
    // page into one wrapper and emptying the rest.
    .map((el) => rootWrapperOf(el) ?? el);
  const [firstBlock] = existing;
  if (firstBlock === undefined) {
    return;
  }

  const container = firstBlock.parentElement
    ? firstBlock.parentElement
    : parentId
      ? (root.querySelector(`[data-kometio-block-id="${parentId}"]`)
          ?.firstElementChild ?? null)
      : root.querySelector(
          `[data-kometio-root-blocks="${editingSection ?? 'page'}"]`,
        );
  if (!container) {
    return;
  }

  // `appendChild` on a node already in the DOM MOVES it (no clone) — so
  // re-appending them in the desired sequence leaves them in that final
  // order.
  for (const el of existing) {
    container.appendChild(el);
  }
}

/** The exact node of an `inlineEditable` field inside a block — marked by hand in the block's Astro component (see Hero.astro). `null` when the block or the field does not exist (never an error worth reporting: a blockId/field that has gone stale, after a fragment patch for instance, is a normal case). */
export function findFieldElement(
  root: ParentNode,
  blockId: string,
  field: string,
): HTMLElement | null {
  const blockEl = root.querySelector(`[data-kometio-block-id="${blockId}"]`);
  if (!blockEl) {
    return null;
  }
  return blockEl.querySelector(`[data-kometio-field="${field}"]`);
}

/**
 * Brings block `blockId` into view (Layers panel, right-hand column) —
 * `true` when the block was found and the scroll started, `false` when it
 * is no longer in the DOM (just removed by another action, say): the same
 * "not an error worth reporting" case as `applyBlockPatch`/
 * `applyBlockRemove`.
 *
 * NOT a plain `target.scrollIntoView()`: `target` is BlockRenderer.astro's
 * `display:contents` wrapper (see get-block-rect.ts), so it never has a box
 * of its own — `scrollIntoView()` on such an element is a no-op in most
 * browsers (a live-verified bug: clicking in the Layers panel selected the
 * block but the canvas never moved). `getBlockRect` measures the rendered
 * content through a `Range` instead (which works identically for an
 * ordinary element), and the scroll is then computed by hand to centre it
 * vertically — the same semantics as `scrollIntoView({block:'center'})` on
 * an element with a real box.
 */
export function scrollBlockIntoView(
  root: ParentNode,
  blockId: string,
): boolean {
  const target = root.querySelector(`[data-kometio-block-id="${blockId}"]`);
  if (!target) {
    return false;
  }
  const rect = getBlockRect(target);
  const targetTop =
    window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: preferredScrollBehavior(),
  });
  return true;
}

/** TipTap parses `content` as HTML — a title containing `&`/`<`/`>` has to be escaped first, or it would be read as markup rather than literal text. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
