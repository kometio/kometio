import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
} from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
} from 'lucide-react';
import { IconButton } from '../common/icon-button';
import {
  clampPanelWidth,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
} from './side-panel-preferences';
import type { SidePanelState } from './use-side-panel';

export interface CollapsibleSidePanelProps {
  /** Which edge of the canvas it sits on — decides the border, the icons, where the toggle aligns and which way a drag widens it. */
  side: 'left' | 'right';
  /** Names the landmark for a screen reader, and heads the panel when it has no header of its own. */
  title: string;
  expandLabel: string;
  collapseLabel: string;
  /** The drag handle's accessible name. */
  resizeLabel: string;
  /**
   * Collapsed state and width, owned by the caller (see useSidePanel).
   *
   * Not internal state: a collapsed panel renders neither header nor
   * content, so the toolbar's way into the Properties tab did nothing at
   * all when the panel happened to be shut — and nothing outside the panel
   * could open it, because nothing outside could see that it was.
   */
  panel: SidePanelState;
  /** Replaces the plain title. */
  header?: ReactNode;
  /**
   * `closable` is the left panel's: the rail beside it opens it, so closed
   * it takes no room at all, and open it has a title and a close button
   * on one row instead of a toggle on a row of its own.
   */
  mode?: 'collapsible' | 'closable';
  /** The DOM id the rail's buttons point `aria-controls` at. */
  id?: string;
  children: ReactNode;
}

/**
 * One of the two panels either side of the canvas — whatever the rail
 * opened on the left (Add, Layers, Templates), Properties on the right.
 *
 * Both are collapsible and resizable, and both remember how they were left.
 * They used to be a fixed `w-64` with collapsed state that reset on every
 * mount, so on a thirteen-inch screen the canvas stayed narrow and the
 * collapsing had to be redone on the next page. Width is what changed the
 * stakes: the right panel holds the selected block's properties now, and a
 * Hero's seven fields in 256 pixels is a column of half-visible controls.
 *
 * They were the same thirty lines written twice, differing only in which
 * edge they sit on; the resize handle is the same one, mirrored.
 */
export function CollapsibleSidePanel({
  side,
  title,
  expandLabel,
  collapseLabel,
  resizeLabel,
  panel,
  header,
  mode = 'collapsible',
  id,
  children,
}: CollapsibleSidePanelProps) {
  const { isCollapsed, width, toggleCollapsed, setWidth, commitWidth } = panel;
  // The width at the moment the drag started, plus where the pointer was:
  // reading the panel's live box on every move would feed its own resizing
  // back into the calculation.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const edge = side === 'left' ? 'border-r' : 'border-l';

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
  }

  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    // The left panel grows when the pointer goes right, the right panel
    // when it goes left — the handle is always on the canvas side.
    const delta =
      side === 'left'
        ? event.clientX - drag.startX
        : drag.startX - event.clientX;
    setWidth(drag.startWidth + delta);
  }

  function handleResizeEnd(): void {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    commitWidth(width);
  }

  /** The keyboard's version of the drag — a resize nobody can reach with Tab is a resize half the people cannot use. */
  function handleResizeKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    // Arrow right always moves the handle right, whichever panel it belongs
    // to; which of the two that widens is what `side` decides.
    const towards = event.key === 'ArrowRight' ? 1 : -1;
    commitWidth(
      clampPanelWidth(width + step * towards * (side === 'left' ? 1 : -1)),
    );
  }

  const resizeHandle = (
    <div
      role="separator"
      aria-label={resizeLabel}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={MAX_PANEL_WIDTH}
      tabIndex={0}
      onPointerDown={handleResizeStart}
      onPointerMove={handleResizeMove}
      onPointerUp={handleResizeEnd}
      onPointerCancel={handleResizeEnd}
      onKeyDown={handleResizeKeyDown}
      className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none ${
        side === 'left' ? '-right-0.5' : '-left-0.5'
      }`}
    />
  );

  if (mode === 'closable') {
    if (isCollapsed) {
      return null;
    }
    return (
      <aside
        id={id}
        aria-label={title}
        className={`relative flex shrink-0 flex-col bg-sidebar ${edge}`}
        style={{ width }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 pb-1">
          {header ?? <h2 className="text-sm font-semibold">{title}</h2>}
          <IconButton label={collapseLabel} onClick={toggleCollapsed}>
            <X />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
          {children}
        </div>
        {resizeHandle}
      </aside>
    );
  }

  return (
    <aside
      id={id}
      // Named, so the landmark is addressable: a screen reader announces
      // which of the two panels it has entered, and "Text" in the inserter
      // stops being indistinguishable from "Text" in the layers tree.
      aria-label={title}
      className={
        isCollapsed
          ? `flex w-10 shrink-0 flex-col items-center bg-sidebar ${edge} py-3`
          : `relative flex shrink-0 flex-col bg-sidebar ${edge}`
      }
      style={isCollapsed ? undefined : { width }}
    >
      {/* The toggle shares the title's row: on a row of its own it cost
          every panel 40px of height to say one thing. */}
      <div
        className={
          isCollapsed
            ? 'contents'
            : 'flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3'
        }
      >
        <div
          className={
            isCollapsed
              ? 'contents'
              : 'sticky top-0 z-10 -mx-3 mb-1 flex shrink-0 items-center justify-between gap-2 bg-sidebar px-3 pt-2.5 pb-1'
          }
        >
          {/* An h2: the panel sits right under the page's h1 (the top
              bar), and its own sections are the h3s under it. */}
          {!isCollapsed &&
            (header ?? <h2 className="text-sm font-semibold">{title}</h2>)}
          <IconButton
            label={isCollapsed ? expandLabel : collapseLabel}
            onClick={toggleCollapsed}
          >
            {/* Four static elements rather than an icon picked into a
                variable: a component chosen during render trips the React
                Compiler (see block-icons.tsx). */}
            {side === 'left' ? (
              isCollapsed ? (
                <PanelLeftOpen />
              ) : (
                <PanelLeftClose />
              )
            ) : isCollapsed ? (
              <PanelRightOpen />
            ) : (
              <PanelRightClose />
            )}
          </IconButton>
        </div>
        {!isCollapsed && children}
      </div>
      {!isCollapsed && resizeHandle}
    </aside>
  );
}
