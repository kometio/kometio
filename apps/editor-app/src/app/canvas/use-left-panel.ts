import { useCallback, useState } from 'react';
import type { LeftPanelView } from './canvas-rail';
import { type SidePanelState, useSidePanel } from './use-side-panel';

const VIEW_KEY = 'kometio-left-panel-view';
const VIEWS: readonly LeftPanelView[] = ['insert', 'layers'];

/**
 * Layers, unless somebody has picked something else: what a page is made
 * of is the thing you want in view while you change it, and inserting is
 * one click on "Add" away.
 */
function readView(): LeftPanelView {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return VIEWS.find((view) => view === stored) ?? 'layers';
  } catch {
    return 'layers';
  }
}

function writeView(view: LeftPanelView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* a panel that cannot remember its view still opens on Layers */
  }
}

export interface LeftPanelState {
  /** Which view the panel shows when it is open. */
  view: LeftPanelView;
  /** The view on screen, or null when the panel is closed. */
  openView: LeftPanelView | null;
  /** Width and open/closed, remembered like the right panel's (see useSidePanel). */
  panel: SidePanelState;
  /** The rail's behaviour: another view switches to it, the open one closes the panel. */
  toggleView: (view: LeftPanelView) => void;
  /** Always opens — for "/" and "Add a block", which should never close anything. */
  showView: (view: LeftPanelView) => void;
}

/**
 * The left panel is one panel with two contents rather than two
 * panels: the rail picks what it shows, and it remembers both that choice
 * and its width between sessions.
 */
export function useLeftPanel(): LeftPanelState {
  const panel = useSidePanel('left');
  const [view, setView] = useState<LeftPanelView>(readView);

  const showView = useCallback(
    (next: LeftPanelView) => {
      setView(next);
      writeView(next);
      panel.expand();
    },
    [panel],
  );

  const toggleView = useCallback(
    (next: LeftPanelView) => {
      if (!panel.isCollapsed && view === next) {
        panel.toggleCollapsed();
        return;
      }
      showView(next);
    },
    [panel, view, showView],
  );

  return {
    view,
    openView: panel.isCollapsed ? null : view,
    panel,
    toggleView,
    showView,
  };
}
