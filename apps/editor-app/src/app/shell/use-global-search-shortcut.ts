import { useEffect, useRef } from 'react';

/**
 * Ctrl/⌘+K opens the search, wherever the focus is — in a field too, which
 * is exactly where a person is when they think "let me look for that".
 * The canvas has its own K on its own screen; the shell's routes and the
 * canvas's are never mounted together, so the two do not meet.
 *
 * The listener is attached once and reads the current handler through a
 * ref, like the canvas's shortcuts: re-attaching on every render would be
 * the alternative, and a listener that re-registers is one more thing that
 * can be wrong at exactly the wrong moment.
 */
export function useGlobalSearchShortcut(onOpen: () => void): void {
  const handler = useRef(onOpen);
  useEffect(() => {
    handler.current = onOpen;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // The browser's own Ctrl+K focuses its address bar or a search box.
        event.preventDefault();
        handler.current();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
