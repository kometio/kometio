import { useEffect, useRef, useState } from 'react';
import type { Block } from '@kometio/shared-types';

type SelectedBlock = Block & { id: string };

export interface CanvasShortcutActions {
  undo: () => void;
  redo: () => void;
  handleMoveSelected: (direction: -1 | 1) => void;
  handlePasteMany: (blocks: SelectedBlock[]) => void;
  handleRemoveMany: (blockIds: string[]) => void;
  handleDuplicateMany: (blockIds: string[]) => void;
  /** The current selection, in pick order. */
  selectedBlocks: SelectedBlock[];
  /**
   * The three that OPEN something, each the accelerator of a button that
   * is always on screen: the search box in the bar (mod+K), Add in the
   * rail ("/"), Shortcuts in the rail ("?"). Optional, so an editor that
   * has none of them still gets the rest.
   */
  openCommandMenu?: () => void;
  openInsert?: () => void;
  openShortcuts?: () => void;
}

/**
 * The editor's keyboard: undo and redo, delete, duplicate, copy and paste,
 * move — and the clipboard that copy and paste share.
 *
 * The clipboard is the editor's own, not the system one: reading that
 * needs a permission prompt, and writing a block to it as text would put a
 * wall of JSON into whatever the person pastes into next. It holds the
 * whole selection since Fase 7's multi-select, and lives as long as the
 * editor is open — which is what "copy these, paste them on the next page"
 * needs.
 *
 * Never in conflict with TipTap text editing: that lives INSIDE the
 * sandboxed iframe (init-preview-bridge.ts), a separate document whose key
 * events never reach this listener. The only guard worth having here is
 * for the PARENT's own inputs and dialogs, which keep their native
 * behaviour — Delete has to delete a character, not a block.
 */
export function useCanvasShortcuts(actions: CanvasShortcutActions): void {
  const [clipboard, setClipboard] = useState<SelectedBlock[]>([]);

  // Every shortcut reads through this ref rather than being captured in the
  // listener's closure. The listener is attached once, and undo/redo could
  // get away with that because they read current state at call time — the
  // others cannot: they close over the selection and the block tree, and a
  // stale closure would delete the block that WAS selected three renders
  // ago.
  const current = useRef({ ...actions, clipboard });
  // In an effect and not during render: React forbids touching a ref while
  // rendering, and the linter says so. Safe because the listener only fires
  // on a real key press, which cannot happen before the first effect ran.
  useEffect(() => {
    current.current = { ...actions, clipboard };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Before the guard below: the search is where you go FROM a field
      // as much as from the canvas, the way every mod+K search works.
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        current.current.openCommandMenu
      ) {
        event.preventDefault();
        current.current.openCommandMenu();
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const now = current.current;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) now.redo();
        else now.undo();
        return;
      }
      if (modifier && key === 'y') {
        event.preventDefault();
        now.redo();
        return;
      }
      if (modifier && key === 'd') {
        event.preventDefault();
        now.handleDuplicateMany(now.selectedBlocks.map((b) => b.id));
        return;
      }
      if (modifier && key === 'c') {
        if (now.selectedBlocks.length > 0) {
          event.preventDefault();
          // A state setter is stable for the life of the component, so
          // unlike everything else here it is safe to call directly.
          setClipboard(now.selectedBlocks);
        }
        return;
      }
      if (modifier && key === 'v') {
        if (now.clipboard.length > 0) {
          event.preventDefault();
          now.handlePasteMany(now.clipboard);
        }
        return;
      }
      // Bare keys, so only with no modifier: "/" and "?" are characters
      // somebody may be typing — the guard above already let fields keep
      // them.
      if (!modifier && !event.altKey && key === '/' && now.openInsert) {
        event.preventDefault();
        now.openInsert();
        return;
      }
      if (!modifier && !event.altKey && key === '?' && now.openShortcuts) {
        event.preventDefault();
        now.openShortcuts();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (now.selectedBlocks.length > 0) {
          event.preventDefault();
          now.handleRemoveMany(now.selectedBlocks.map((b) => b.id));
        }
        return;
      }
      // Alt, not a bare arrow: the arrows scroll, and taking that away from
      // a person reading a long page to make them move a block would be the
      // wrong trade. One block only: "move these four up" has no single
      // answer once they sit under different parents.
      if (event.altKey && (key === 'arrowup' || key === 'arrowdown')) {
        if (now.selectedBlocks.length === 1) {
          event.preventDefault();
          now.handleMoveSelected(key === 'arrowup' ? -1 : 1);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
