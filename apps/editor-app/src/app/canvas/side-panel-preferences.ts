/**
 * What each side panel remembers between sessions: how wide it is and
 * whether it is collapsed.
 *
 * Both used to be neither. The panels were a fixed `w-64` and their
 * collapsed state was plain component state that reset on every mount, so
 * on a thirteen-inch screen the canvas stayed narrow and collapsing a panel
 * to get room had to be redone on the next page. Width matters more now
 * that the right panel holds the properties of the selected block: a Hero's
 * seven fields in 256 pixels is a column of half-visible controls.
 *
 * localStorage, and every read guarded: a browser can refuse it (private
 * mode, blocked site data) and a panel that cannot remember its width is
 * still a panel.
 */

export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH = 560;
export const DEFAULT_PANEL_WIDTH = 256;

const WIDTH_PREFIX = 'kometio-panel-width:';
const COLLAPSED_PREFIX = 'kometio-panel-collapsed:';

/**
 * A width that leaves both a usable panel and a usable canvas. A stored
 * value goes through this too: the window it was chosen in may have been
 * much wider than this one, and a panel wider than the screen is a canvas
 * nobody can see.
 */
export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_PANEL_WIDTH;
  }
  return Math.min(
    MAX_PANEL_WIDTH,
    Math.max(MIN_PANEL_WIDTH, Math.round(width)),
  );
}

export function readPanelWidth(key: string): number {
  try {
    const stored = localStorage.getItem(`${WIDTH_PREFIX}${key}`);
    return stored === null
      ? DEFAULT_PANEL_WIDTH
      : clampPanelWidth(Number(stored));
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
}

export function writePanelWidth(key: string, width: number): void {
  try {
    localStorage.setItem(
      `${WIDTH_PREFIX}${key}`,
      String(clampPanelWidth(width)),
    );
  } catch {
    /* a panel that cannot remember its width still works */
  }
}

/** `null` when nothing was ever remembered — which is not the same as "open": see useSidePanel. */
export function readPanelCollapsed(key: string): boolean | null {
  try {
    const stored = localStorage.getItem(`${COLLAPSED_PREFIX}${key}`);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

export function writePanelCollapsed(key: string, collapsed: boolean): void {
  try {
    localStorage.setItem(`${COLLAPSED_PREFIX}${key}`, String(collapsed));
  } catch {
    /* see writePanelWidth */
  }
}
