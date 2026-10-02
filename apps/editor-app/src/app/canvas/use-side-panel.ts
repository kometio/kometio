import { useCallback, useState } from 'react';
import {
  clampPanelWidth,
  readPanelCollapsed,
  readPanelWidth,
  writePanelCollapsed,
  writePanelWidth,
} from './side-panel-preferences';

export interface SidePanelState {
  isCollapsed: boolean;
  width: number;
  toggleCollapsed: () => void;
  /** Opens the panel if it is closed, and does nothing if it is already open. */
  expand: () => void;
  /** During a drag: not persisted, so a drag in progress is not a hundred writes. */
  setWidth: (width: number) => void;
  /** At the end of a drag, or after a keyboard step: this is what remembers it. */
  commitWidth: (width: number) => void;
}

/**
 * One side panel's collapsed state and width, owned by whoever renders the
 * panel rather than by the panel itself.
 *
 * That ownership is the point. The state used to live inside
 * CollapsibleSidePanel, and a collapsed panel renders neither its header nor
 * its content — so the toolbar's "edit properties" button, which switches to
 * the Properties tab and puts the keyboard in it, quietly did nothing at all
 * when the panel happened to be closed: the focus landed on a forty-pixel
 * strip. Nothing outside the panel could open it, because nothing outside the
 * panel could see that it was shut.
 *
 * Both values are remembered between sessions — see side-panel-preferences.ts
 * for why, and for what happens when the browser refuses to remember.
 */
/**
 * Below Tailwind's `md`, a panel that nobody has opened or closed yet starts
 * closed: at a phone's width the two panels and the canvas cannot sit side by
 * side, and the page scrolled sideways instead. Once somebody opens it, that
 * is remembered like any other choice.
 */
function isNarrowWindow(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(max-width: 767px)').matches === true
  );
}

export function useSidePanel(storageKey: string): SidePanelState {
  const [isCollapsed, setIsCollapsed] = useState(
    () => readPanelCollapsed(storageKey) ?? isNarrowWindow(),
  );
  const [width, setWidthState] = useState(() => readPanelWidth(storageKey));

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((collapsed) => {
      writePanelCollapsed(storageKey, !collapsed);
      return !collapsed;
    });
  }, [storageKey]);

  const expand = useCallback(() => {
    setIsCollapsed((collapsed) => {
      if (!collapsed) {
        return collapsed;
      }
      writePanelCollapsed(storageKey, false);
      return false;
    });
  }, [storageKey]);

  const setWidth = useCallback((next: number) => {
    setWidthState(clampPanelWidth(next));
  }, []);

  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clampPanelWidth(next);
      setWidthState(clamped);
      writePanelWidth(storageKey, clamped);
    },
    [storageKey],
  );

  return { isCollapsed, width, toggleCollapsed, expand, setWidth, commitWidth };
}
