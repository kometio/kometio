import { useCallback, useState } from 'react';

const STORAGE_KEY = 'kometio-sidebar-collapsed';

/**
 * Whether the person folded the sidebar to the strip, remembered between
 * visits. Expanded until somebody says otherwise: the words are what make
 * the sidebar readable the first time, and folding it is a choice for
 * somebody who already knows where things are.
 *
 * localStorage, and every read and write guarded, as the canvas's panels
 * do (canvas/side-panel-preferences.ts): a browser can refuse it, and a
 * sidebar that cannot remember its width is still a sidebar.
 */
function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function write(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    /* see read */
  }
}

export interface SidebarCollapsedState {
  isCollapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function useSidebarCollapsed(): SidebarCollapsedState {
  const [isCollapsed, setIsCollapsed] = useState(read);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsed(collapsed);
    write(collapsed);
  }, []);

  return { isCollapsed, setCollapsed };
}
