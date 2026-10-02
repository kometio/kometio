import type { Block, BlockAlign } from './content-model';

/**
 * The postMessage protocol between the canvas (apps/editor-app, the parent)
 * and the real page rendered in the iframe (apps/public-site) — see the
 * visual editor plan, Day 2/3. Every message carries the same
 * `{ source, v, type, payload }` envelope; both sides check `event.origin`
 * before reading `event.data` (see use-preview-bridge.ts /
 * preview-bridge-client.ts).
 *
 */
export const PREVIEW_BRIDGE_SOURCE = 'kometio-preview-bridge' as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;

/** Always viewport-relative (the same semantics as `getBoundingClientRect()`), never document-relative — the parent combines them with its own `<iframe>`'s position to draw the overlay. */
export interface BlockRect {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PreviewBridgeEnvelope<Type extends string, Payload> {
  source: typeof PREVIEW_BRIDGE_SOURCE;
  v: typeof PREVIEW_BRIDGE_VERSION;
  type: Type;
  payload: Payload;
}

export type PreviewReadyMessage = PreviewBridgeEnvelope<
  'preview:ready',
  { blockRects: BlockRect[]; scrollHeight: number }
>;

/** Re-sent on every ResizeObserver/scroll/resize — never only at mount. */
export type PreviewBlockRectsMessage = PreviewBridgeEnvelope<
  'preview:block-rects',
  { blockRects: BlockRect[] }
>;

/** `blockId: null` when the pointer leaves every tracked block (or a block outside the current editable scope, see editingSection). */
export type PreviewHoverMessage = PreviewBridgeEnvelope<
  'preview:hover',
  { blockId: string | null; pointer: { x: number; y: number } }
>;

/** Never sent for a block outside the current editable scope (see editingSection in preview-bridge-client.ts). */
export type PreviewClickMessage = PreviewBridgeEnvelope<
  'preview:click',
  {
    blockId: string;
    /**
     * True when Cmd (or Ctrl) was held (Fase 7) — the block joins the
     * selection instead of replacing it.
     *
     * Reported by the iframe rather than read on the editor's side,
     * because the modifier belongs to the event that actually happened:
     * the parent document never sees that click, and a key-state flag kept
     * in the editor would go stale the moment focus moved between the two
     * documents.
     */
    additive?: boolean;
  }
>;

/**
 * Double click — the trigger for entering inline text editing (Day 4):
 * `field` is the nearest `data-kometio-field` value under the cursor, `null`
 * when the double click landed on the block but outside every
 * `inlineEditable` field (a padding area, say). Never emitted for a block
 * outside the current editable scope, the same rule as preview:click.
 */
export type PreviewDblClickMessage = PreviewBridgeEnvelope<
  'preview:dblclick',
  { blockId: string; field: string | null }
>;

/**
 * Keeps TipTap in sync with text typed live (Day 4), debounced on the
 * parent side before the draft is saved. `text`, not `html`: every
 * `inlineEditable` field in this codebase is a plain `z.string()` at the
 * domain level (title/subtitle/body/..., see content-model.ts) — never
 * HTML. TipTap is constrained here to a single paragraph with no marks (see
 * preview-bridge-client.ts), so `editor.getText()` is the correct read, not
 * `editor.getHTML()`: that second one would only apply to a field the
 * domain genuinely modelled as HTML, which none does today.
 */
export type PreviewTextChangedMessage = PreviewBridgeEnvelope<
  'preview:text-changed',
  { blockId: string; field: string; text: string }
>;

/**
 * The start of a drag simulated on the parent side (Day 3/4: direct
 * reordering on the canvas) — on `mousedown` on a block within the current
 * editable scope. The iframe never receives a real native drag event (HTML5
 * drag-and-drop does not cross the iframe boundary reliably across
 * browsers, see the visual editor plan): the parent owns the entire drag
 * state, and the iframe merely reports `mousedown`/`mousemove`/`mouseup` as
 * it already does for hover/click. The parent decides where the block
 * lands — among its siblings at any depth, or inside another container
 * (`computeContainerDrop`) — and ignores an unknown `blockId`, the same
 * "an unknown blockId crashes nothing" principle as use-block-tree.ts.
 */
export type PreviewDragStartMessage = PreviewBridgeEnvelope<
  'preview:drag-start',
  { blockId: string; pointer: { x: number; y: number } }
>;

/**
 * Re-sent on every `mousemove` while a drag is in progress (throttled to
 * one frame through requestAnimationFrame, the same performance care as the
 * ResizeObserver already in preview-bridge-client.ts) — it covers ONLY the
 * stretch where the pointer is over the iframe: while it is over the
 * parent's document, the parent already tracks it natively with its own
 * `mousemove`, so no bridging is needed for that stretch.
 */
export type PreviewDragMoveMessage = PreviewBridgeEnvelope<
  'preview:drag-move',
  { pointer: { x: number; y: number } }
>;

/** `mouseup` while a drag is in progress, wherever it lands — the parent computes the final drop position and applies it to its own `Block[]`; the iframe knows nothing of the outcome. */
export type PreviewDragEndMessage = PreviewBridgeEnvelope<
  'preview:drag-end',
  Record<string, never>
>;

/**
 * The bubble menu's "link to a page" button, which cannot do its own job.
 *
 * Picking a page means opening the editor's page picker, and that lives
 * in the parent: the iframe has no access to it, and could not render a
 * dialog over the editor's own chrome anyway. So it asks, keeps the
 * selection it had, and waits for `editor:apply-page-link`.
 */
export type PreviewRequestPageLinkMessage = PreviewBridgeEnvelope<
  'preview:request-page-link',
  Record<string, never>
>;

export type PreviewToParentMessage =
  | PreviewReadyMessage
  | PreviewBlockRectsMessage
  | PreviewHoverMessage
  | PreviewClickMessage
  | PreviewDblClickMessage
  | PreviewTextChangedMessage
  | PreviewDragStartMessage
  | PreviewDragMoveMessage
  | PreviewDragEndMessage
  | PreviewRequestPageLinkMessage;

/**
 * Targeted replacement after render-block-fragment (Day 3): `html` already
 * carries its own `data-kometio-block-id`/`data-kometio-block-type` wrapper
 * (RenderSingleBlock.astro builds it with `editable` always true), and the
 * script in the iframe replaces the existing node through a targeted
 * `outerHTML` — no reload, no flash.
 */
export type EditorPatchBlockMessage = PreviewBridgeEnvelope<
  'editor:patch-block',
  { blockId: string; html: string }
>;

/**
 * Mounts TipTap "in place" (Day 4) on the `[data-kometio-field=field]` node
 * inside block `blockId` — TipTap takes ownership of the existing node and
 * handles its own reconciliation, which is a structural fix for Puck's
 * caret bug (no React re-render drives that node any more), not a
 * workaround.
 */
export type EditorEnterTextEditMessage = PreviewBridgeEnvelope<
  'editor:enter-text-edit',
  {
    blockId: string;
    field: string;
    /**
     * Whether this field holds rich text (`kind: 'richtext'`, ADR-0046)
     * or a plain string. The iframe cannot tell: it sees a DOM node, not
     * a descriptor. The editor can, so it says.
     *
     * It decides both which extensions are mounted and what comes back in
     * `preview:text-changed` — HTML for one, plain text for the other.
     * Getting it wrong is not cosmetic: HTML sent for a plain field would
     * be stored as literal `<p>` characters and shown as such on the
     * page.
     */
    richText: boolean;
    /**
     * The bubble menu's button labels, already translated.
     *
     * They come from the parent rather than being looked up in the
     * iframe because that is where i18n lives: the preview document is a
     * rendered SITE, in the visitor's language, not the editor's. Its
     * chrome has to speak the editor's — and duplicating the catalogue
     * across the frame to say "Bold" twice would be a second place to
     * keep in step. Absent for a plain field, which has no menu.
     */
    labels?: RichTextMenuLabels;
  }
>;

/** Button labels for the canvas bubble menu, translated by the editor. */
export interface RichTextMenuLabels {
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  bulletList: string;
  orderedList: string;
  linkToPage: string;
  linkToUrl: string;
  unlink: string;
  urlPrompt: string;
}

/**
 * Blur/Escape, or another block selected while this one is being edited —
 * unmounts the current TipTap instance, if there is one. No payload: which
 * block/field is being edited has been entirely the iframe's business (see
 * `activeTextEditor` in preview-bridge-client.ts), and the parent only asks
 * "exit, whatever is active".
 */
export type EditorExitTextEditMessage = PreviewBridgeEnvelope<
  'editor:exit-text-edit',
  Record<string, never>
>;

/**
 * A block the iframe has NEVER seen before (insert/duplicate) — unlike
 * `editor:patch-block` (which replaces an existing node), this one has to
 * create a new node and insert it in the right place. `html` already
 * carries its own wrapper (the same RenderSingleBlock.astro as patch-block,
 * including the whole subtree when the block has children — a single
 * `container.renderToString` renders the nested ones too). `parentId: null`
 * = the page root; `beforeBlockId: null` = at the end of the list (root or
 * inside the parent) rather than before a specific sibling.
 *
 * `rootLayout` is what the wrapper around a ROOT block reads — its width on
 * the page and its hover effect. The fragment is the block alone and the
 * wrapper is built in the iframe, so without these a block arriving with
 * either showed at content width, with no hover, until a reload. Ignored
 * for a nested insert, which has no wrapper.
 */
export type EditorInsertBlockMessage = PreviewBridgeEnvelope<
  'editor:insert-block',
  {
    html: string;
    parentId: string | null;
    beforeBlockId: string | null;
    rootLayout?: RootBlockLayout;
  }
>;

/** See EditorInsertBlockMessage. */
export type RootBlockLayout = Pick<Block, 'align' | 'styleOverride'>;

/** A deleted block (the toolbar's "Remove block") — the iframe removes the `[data-kometio-block-id=blockId]` node from its own DOM, with no reload. */
export type EditorRemoveBlockMessage = PreviewBridgeEnvelope<
  'editor:remove-block',
  { blockId: string }
>;

/**
 * A reorder that has been applied (a canvas drag, the move up/down arrows,
 * a drag in the Layers panel) — `orderedIds` is the complete, final list of
 * siblings at that point in the tree, in the desired order. The iframe only
 * re-appends the EXISTING nodes in that order (`appendChild` on a node
 * already in the DOM moves it rather than cloning it) — no new rendering,
 * since every block involved is already visible.
 */
export type EditorReorderBlocksMessage = PreviewBridgeEnvelope<
  'editor:reorder-blocks',
  { parentId: string | null; orderedIds: string[] }
>;

/**
 * A "component-level" override just saved from the "Style" button
 * (docs/adr/0022) — `css` is already the result of
 * `buildBlockStyleOverridesCss` on the parent side (which knows the whole
 * updated map after the mutation), and the iframe only writes that text
 * into a dedicated `<style>` in its own `<head>` (creating it if there is
 * none yet). Unlike `editor:patch-block`, this touches the whole document's
 * styling rather than one node: every already-visible instance of that type
 * updates in one go, with no iframe reload.
 */
export type EditorUpdateBlockStyleCssMessage = PreviewBridgeEnvelope<
  'editor:update-block-style-css',
  { css: string }
>;

/**
 * A block selected from the Layers panel (right-hand column) — unlike the
 * other parent -> iframe messages, this one does not change the DOM: it
 * only asks the iframe to bring block `blockId` into view, so the panel's
 * selection stays visible even on a long page with many blocks. A silent
 * no-op when the block is no longer in the DOM, the same discipline as
 * `editor:patch-block`/`editor:remove-block`.
 */
export type EditorScrollToBlockMessage = PreviewBridgeEnvelope<
  'editor:scroll-to-block',
  { blockId: string }
>;

/**
 * The answer to `preview:request-page-link` — the page the editor's
 * picker returned, or `null` if it was dismissed. The iframe applies it
 * to the selection it deliberately kept alive in the meantime.
 *
 * A page GROUP id, not a path: what gets stored is a reference the render
 * step resolves in the locale being read (see KOMETIO_PAGE_LINK_PREFIX), so
 * the link keeps working when the page is renamed and points at the right
 * translation for each reader.
 */
export type EditorApplyPageLinkMessage = PreviewBridgeEnvelope<
  'editor:apply-page-link',
  { pageGroupId: string | null }
>;

/**
 * How much of the page's width a ROOT-level block claims (ADR-0049).
 *
 * Its own message rather than a re-render through `editor:patch-block`,
 * because the value does not live on the block's own element: it is an
 * attribute on the `.kometio-root-block` wrapper around it
 * (PublicPageContent.astro), which a patch replacing the block's HTML
 * leaves untouched. Sending it separately also means changing an
 * alignment costs no render round trip at all — the iframe sets one
 * attribute and the CSS does the rest.
 *
 * `align: null` is the default content column, matching how the renderer
 * writes it: the attribute is removed rather than set to a value.
 */
export type EditorSetRootLayoutMessage = PreviewBridgeEnvelope<
  'editor:set-root-layout',
  {
    blockId: string;
    align: BlockAlign | null;
    /** The hover effect's own value (`lift`, `grow`, `dim`), `null` for none. */
    hover: string | null;
  }
>;

export type ParentToPreviewMessage =
  | EditorPatchBlockMessage
  | EditorEnterTextEditMessage
  | EditorExitTextEditMessage
  | EditorRemoveBlockMessage
  | EditorReorderBlocksMessage
  | EditorInsertBlockMessage
  | EditorUpdateBlockStyleCssMessage
  | EditorScrollToBlockMessage
  | EditorApplyPageLinkMessage
  | EditorSetRootLayoutMessage;

export type AnyPreviewBridgeMessage =
  PreviewToParentMessage | ParentToPreviewMessage;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The type guard both sides use before trusting `event.data` — a third-party `postMessage` (browser extensions, other scripts on the same page) does not carry this envelope and is discarded silently rather than thrown on. */
export function isPreviewBridgeMessage(
  data: unknown,
): data is AnyPreviewBridgeMessage {
  return (
    isPlainObject(data) &&
    data['source'] === PREVIEW_BRIDGE_SOURCE &&
    data['v'] === PREVIEW_BRIDGE_VERSION &&
    typeof data['type'] === 'string'
  );
}
