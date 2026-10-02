import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import type { BlockRect } from '@kometio/shared-types';

export interface OverlayLayerProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  blockRects: BlockRect[];
  hoveredBlockId: string | null;
  selectedBlockId: string | null;
  /** The Y (iframe-relative, see compute-drop-target.ts) at which to draw the drop line during a direct canvas reorder — `null`/absent when no drag is in progress. */
  dropIndicatorTop?: number | null;
  /** Set only for a drop inside a container — see toDropIndicatorStyle. */
  dropIndicatorLeft?: number;
  dropIndicatorWidth?: number;
}

export interface IframeGeometry {
  top: number;
  left: number;
  width: number;
  height: number;
}

const ZERO_GEOMETRY: IframeGeometry = { top: 0, left: 0, width: 0, height: 0 };

/**
 * `rect` is viewport-relative INSIDE the iframe (the same coordinate system
 * `getBoundingClientRect()` uses in there) — it stays valid even when the
 * block is scrolled out of the iframe's visible area (a long page scrolls
 * INSIDE the iframe itself, which has a fixed height, see canvas-frame.tsx).
 * Without this check, a `position: fixed` overlay (the selection border, the
 * drop indicator, or the whole contextual toolbar) for such a block ended up
 * rendered outside the canvas frame, on top of the rest of the editor's page
 * — a bug found live while filling a container at the bottom of a long page:
 * the "Add element" button appeared detached, far from the container it
 * belonged to.
 *
 * A `geometry` still at `ZERO_GEOMETRY` (never measured — on the first
 * render, before `useIframeGeometry` finds the iframe in the DOM, or in
 * jsdom tests that do not mock `getBoundingClientRect`) is treated as
 * "visibility unknown" and always passes: a false negative here (hiding the
 * toolbar when the iframe is in fact full-size but not yet measured) would
 * be worse than the opposite false positive.
 */
export function isRectVisibleInIframe(
  geometry: IframeGeometry,
  rect: { top: number; left: number; width: number; height: number },
): boolean {
  if (geometry.width === 0 && geometry.height === 0) {
    return true;
  }
  return (
    rect.top + rect.height > 0 &&
    rect.top < geometry.height &&
    rect.left + rect.width > 0 &&
    rect.left < geometry.width
  );
}

/**
 * Every `BlockRect` arrives viewport-relative to the DOCUMENT INSIDE the
 * iframe (the same semantics as `getBoundingClientRect()`, see
 * apps/public-site/src/lib/get-block-rect.ts) — it has to be added to the
 * iframe's own position in the parent page to draw the overlay in the right
 * place.
 */
/**
 * `position: 'fixed'`, not `'absolute'` — the overlay lives inside a
 * container that is itself already co-located with the iframe's box (no
 * padding or margin between the two), so an `absolute` would add the
 * iframe's offset a second time on top of the one the positioned parent
 * already gives. `fixed` ignores the ancestor hierarchy and uses
 * `geometry`/`rect`'s viewport coordinates directly (the same semantics as
 * `getBoundingClientRect()`), which is the only thing that makes the
 * translation below correct.
 */
export function toOverlayStyle(
  geometry: IframeGeometry,
  rect: BlockRect,
): CSSProperties {
  return {
    position: 'fixed',
    top: geometry.top + rect.top,
    left: geometry.left + rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** The same translation as `toOverlayStyle` but for a horizontal line spanning the iframe's full width rather than a box — the drop indicator for direct canvas reordering. */
export function toDropIndicatorStyle(
  geometry: IframeGeometry,
  top: number,
  /** A drop INSIDE a container draws the line across that container alone, so "in here" and "between these two" never look the same. */
  span?: { left: number; width: number },
): CSSProperties {
  return {
    position: 'fixed',
    top: geometry.top + top - 1,
    left: geometry.left + (span?.left ?? 0),
    width: span?.width ?? geometry.width,
    height: 2,
  };
}

/**
 * The four functions below come from `block-toolbar-overlay.tsx` (the
 * selected block's contextual toolbar) — moved here because they are pure
 * and do exactly the same kind of geometry+rect->CSSProperties translation
 * as `toOverlayStyle`/`toDropIndicatorStyle` above, not because they
 * conceptually belong to "OverlayLayer": the same "pure positioning maths
 * next to useIframeGeometry" co-location, not a new invention for these
 * four.
 */

/**
 * `position: 'fixed'` — the toolbar lives inside a container
 * (canvas-editor-shell.tsx) that is itself already co-located with the
 * iframe's box, so an `absolute` would add the iframe's offset a second
 * time on top of the one the positioned parent already gives. `fixed`
 * ignores the ancestor hierarchy and uses `geometry`/`rect`'s viewport
 * coordinates directly (the same semantics as `getBoundingClientRect()`,
 * see `useIframeGeometry`), which is the only thing that makes this
 * translation correct.
 */
export function toPillStyle(
  geometry: IframeGeometry,
  rect: BlockRect,
): CSSProperties {
  return {
    position: 'fixed',
    top: geometry.top + rect.top - 28,
    left: geometry.left + rect.left,
  };
}

/** How far above the block the toolbar floats — clear of the insert pill straddling the block's top edge. */
const TOOLBAR_GAP_PX = 18;
/** Room the toolbar needs above a block before it is drawn inside the block instead: its own height plus the gap. */
const TOOLBAR_CLEARANCE_PX = 56;
/** Roughly the toolbar's width with its words on; used only to choose which edge to align to, never for layout. */
const TOOLBAR_MIN_ROOM_PX = 360;

/**
 * The selected block's toolbar sits ABOVE the block, aligned to its right
 * edge, in a row — the way a person reads it, with its actions written.
 *
 * It used to be a column of icons beside the block, which for a full-width
 * block (most of them) was clamped onto the block itself, over its content.
 * Its width is not known here (the words are translated), so it is placed
 * by an edge plus a CSS translate rather than by a computed left:
 *
 * - right-aligned to the block, unless the block ends too close to the
 *   canvas's left edge for the row to fit, and then left-aligned;
 * - above the block, unless the block starts too close to the top of the
 *   canvas, and then just inside it.
 */
export function toToolbarStyle(
  geometry: IframeGeometry,
  rect: BlockRect,
): CSSProperties {
  const right =
    geometry.left + Math.min(rect.left + rect.width, geometry.width);
  const alignRight = right - geometry.left >= TOOLBAR_MIN_ROOM_PX;
  const hasRoomAbove = rect.top >= TOOLBAR_CLEARANCE_PX;
  const translate = [alignRight ? '-100%' : '0', hasRoomAbove ? '-100%' : '0'];
  return {
    position: 'fixed',
    top: hasRoomAbove
      ? geometry.top + rect.top - TOOLBAR_GAP_PX
      : geometry.top + rect.top + 8,
    left: alignRight ? right : geometry.left + Math.max(rect.left, 0),
    transform: `translate(${translate[0]}, ${translate[1]})`,
  };
}

/**
 * The point where a new block goes, centred on the block's top or bottom
 * edge. It is a pill with words on it now, of a width only the browser
 * knows, so it is centred with a translate rather than by subtracting a
 * fixed half-width.
 */
export function toInsertPointStyle(
  geometry: IframeGeometry,
  rect: BlockRect,
  edge: 'top' | 'bottom',
): CSSProperties {
  return {
    position: 'fixed',
    top: geometry.top + (edge === 'top' ? rect.top : rect.top + rect.height),
    left: geometry.left + rect.left + rect.width / 2,
    transform: 'translate(-50%, -50%)',
  };
}

/**
 * Unlike `toInsertPointStyle` (which STRADDLES the block's edge, for a
 * page-level sibling — and for a top-level block appears right on the
 * BOTTOM edge), this one stays INSIDE the container's own rectangle, in the
 * top-right corner: visually "add in here", not "insert a sibling
 * elsewhere". Centred on the right edge (rather than in the corner) it
 * almost always ended up overlapping Testimonials' navigation buttons
 * (which are vertically centred there too); on the bottom edge it
 * overlapped a top-level block's root "+" instead — both observed live.
 */
export function toAddChildStyle(
  geometry: IframeGeometry,
  rect: BlockRect,
): CSSProperties {
  // Right-aligned by a translate: the control has its words on it now,
  // and their width depends on the language.
  return {
    position: 'fixed',
    top: geometry.top + rect.top + 4,
    left: geometry.left + rect.left + rect.width - 4,
    transform: 'translateX(-100%)',
  };
}

/**
 * Recomputes the iframe's position and width within the parent's document
 * on every resize/scroll — otherwise the overlay drifts whenever the
 * parent's own page scrolls. Exported: `block-toolbar-overlay.tsx` shares
 * it rather than recomputing the same thing a second time.
 */
export function useIframeGeometry(
  iframeRef: RefObject<HTMLIFrameElement | null>,
): IframeGeometry {
  const [geometry, setGeometry] = useState<IframeGeometry>(ZERO_GEOMETRY);

  useEffect(() => {
    let resizeObserver: ResizeObserver | undefined;
    let rafId: number | undefined;

    function recompute(): void {
      const rect = iframeRef.current?.getBoundingClientRect();
      if (rect) {
        setGeometry({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    /**
     * CanvasFrame mounts the `<iframe>` only after the preview token
     * arrives (async) — on this effect's first run `iframeRef.current` is
     * almost always still `null`. Without this retry `recompute()` would
     * find nothing and stay stuck on ZERO_GEOMETRY forever (the
     * resize/scroll listeners alone never notice, because neither fires
     * when the iframe appears later).
     */
    function attach(): void {
      const el = iframeRef.current;
      if (!el) {
        rafId = requestAnimationFrame(attach);
        return;
      }
      recompute();
      resizeObserver = new ResizeObserver(recompute);
      resizeObserver.observe(el);
    }

    attach();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [iframeRef]);

  return geometry;
}

/**
 * Draws the hover/selection box on top of the iframe — read-only for now
 * (Day 2): no interaction of its own, it just shows the state arriving from
 * the bridge (usePreviewBridge). `pointer-events-none` on the container
 * lets every real click and hover through to the iframe underneath.
 */
export function OverlayLayer({
  iframeRef,
  blockRects,
  hoveredBlockId,
  selectedBlockId,
  dropIndicatorTop,
  dropIndicatorLeft,
  dropIndicatorWidth,
}: OverlayLayerProps) {
  const geometry = useIframeGeometry(iframeRef);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {blockRects.map((rect) => {
        const isSelected = rect.id === selectedBlockId;
        const isHovered = rect.id === hoveredBlockId;
        if (!isSelected && !isHovered) {
          return null;
        }
        if (!isRectVisibleInIframe(geometry, rect)) {
          return null;
        }
        return (
          <div
            key={rect.id}
            data-testid="overlay-box"
            data-block-id={rect.id}
            data-state={isSelected ? 'selected' : 'hovered'}
            className={
              isSelected
                ? 'absolute rounded-md border-2 border-primary'
                : 'absolute rounded-md border-2 border-primary/50'
            }
            style={toOverlayStyle(geometry, rect)}
          />
        );
      })}
      {dropIndicatorTop != null && (
        <div
          data-testid="drop-indicator"
          className="absolute rounded-full bg-primary"
          style={toDropIndicatorStyle(
            geometry,
            dropIndicatorTop,
            dropIndicatorLeft != null && dropIndicatorWidth != null
              ? { left: dropIndicatorLeft, width: dropIndicatorWidth }
              : undefined,
          )}
        />
      )}
    </div>
  );
}
