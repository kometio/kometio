import { useEffect, useRef, useState } from 'react';
import type { Block } from '@kometio/shared-types';
import type { HistoryEntry } from './block-tree-mutation-types';

/** A bounded history — a content editor does not need unlimited undo, and a stack growing forever through a long session is waste either way. */
const MAX_HISTORY_ENTRIES = 50;

/**
 * Undo and redo of the block tree: the stacks of entries, the baseline an
 * entry is built from, and the rule that they belong to ONE page.
 *
 * It knows nothing of the canvas: an entry carries the two functions that
 * redo and undo its effect there (`syncForward`/`syncBackward`), and this
 * runs them without knowing what they do. What changes the tree, and how a
 * change reaches the canvas, is the caller's.
 */
export function useBlockHistory({
  pageId,
  localBlocks,
  applyLocalChange,
}: {
  pageId: string;
  localBlocks: Block[];
  /** How a tree becomes the page's: state, saved draft, style sheet. Undo and redo go through it like every other change. */
  applyLocalChange: (next: Block[]) => void;
}) {
  /**
   * The stacks themselves live in a ref; the state below only mirrors their
   * sizes for the undo/redo buttons.
   *
   * Undo and redo used to run their side effects inside `setPast`/
   * `setFuture` updaters. React may call an updater twice — StrictMode does,
   * on every update in development — so a redo inserted its blocks twice.
   * Reading the stack from a ref and writing it back is what lets the side
   * effects run once, in the handler.
   */
  const historyRef = useRef<{
    pageId: string;
    past: HistoryEntry[];
    future: HistoryEntry[];
  }>({ pageId, past: [], future: [] });
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });
  function setHistory(past: HistoryEntry[], future: HistoryEntry[]): void {
    historyRef.current = { pageId, past, future };
    setHistorySize({ past: past.length, future: future.length });
  }
  /**
   * The tree as of the last point the history knows about — the state undo
   * would return to. Every entry below is built from it, which is what
   * lets an edit be recorded when its debounce burst ENDS without anyone
   * having had to snapshot a "before" when the burst opened: the history
   * already knows what came before, and knows it at a moment that does not
   * depend on when a React effect happened to refresh a ref.
   *
   * A ref and not state on purpose: `flushAll` (on publish) can end two
   * bursts in the same tick, and the second has to see the baseline the
   * first just moved. A state update would not have landed yet, and the
   * two entries would overlap.
   */
  const lastCommittedRef = useRef(localBlocks);

  /**
   * The history belongs to ONE page. Nothing reset it before, and the shell
   * does not remount on navigation (it resyncs `localBlocks` from props
   * instead, see its `syncKey`) — so switching language and pressing undo
   * restored the PREVIOUS translation's tree into the current one, and
   * `undo` calls `onChange`, so it was then saved. Silent cross-language
   * content loss.
   */
  const [historyPageId, setHistoryPageId] = useState(pageId);
  if (historyPageId !== pageId) {
    setHistoryPageId(pageId);
    setHistorySize({ past: 0, future: 0 });
  }
  // The stacks and the baseline follow, in an effect because a ref may not
  // be written during render. By the time it runs, the shell's own resync
  // has already put the new page's tree in `localBlocks`, and no undo can
  // have happened in between: that takes a user action.
  useEffect(() => {
    historyRef.current = { pageId, past: [], future: [] };
    lastCommittedRef.current = localBlocks;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-baselines on a PAGE change only; localBlocks changes on every edit, and re-running then would defeat the point.
  }, [pageId]);

  /** Records a new action — always clearing the "future" (redo stops making sense after a fresh mutation, the same convention as every editor with undo/redo). */
  function recordHistory(entry: HistoryEntry): void {
    lastCommittedRef.current = entry.after;
    setHistory(
      [...historyRef.current.past, entry].slice(-MAX_HISTORY_ENTRIES),
      [],
    );
  }

  function undo(): void {
    const { past, future } = historyRef.current;
    const entry = past[past.length - 1];
    // The stack is stamped with the page it was built on. The sizes reset
    // during render and the stacks in an effect, and the keyboard shortcut
    // is a native listener that does not wait for effects — so between
    // those two an undo would have popped the PREVIOUS page's entry and
    // saved its tree over this one.
    if (!entry || historyRef.current.pageId !== pageId) {
      return;
    }
    setHistory(past.slice(0, -1), [entry, ...future]);
    lastCommittedRef.current = entry.before;
    applyLocalChange(entry.before);
    entry.syncBackward();
  }

  function redo(): void {
    const { past, future } = historyRef.current;
    const [entry, ...rest] = future;
    if (!entry || historyRef.current.pageId !== pageId) {
      return;
    }
    setHistory([...past, entry].slice(-MAX_HISTORY_ENTRIES), rest);
    lastCommittedRef.current = entry.after;
    applyLocalChange(entry.after);
    entry.syncForward();
  }

  return {
    recordHistory,
    undo,
    redo,
    lastCommittedRef,
    canUndo: historySize.past > 0,
    canRedo: historySize.future > 0,
  };
}
