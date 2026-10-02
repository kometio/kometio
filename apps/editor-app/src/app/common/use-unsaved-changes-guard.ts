import { useEffect, useRef } from 'react';
import { useBlocker } from '@tanstack/react-router';

export interface UnsavedChangesGuardParams {
  /** True while a change exists that the server has not acknowledged — a debounce still counting down, or a request still on the wire. */
  hasUnsavedChanges: boolean;
  /**
   * Called before the browser puts the question to the person.
   *
   * It turns "the change is sitting in a timer" into "the change is on the
   * wire", so whoever answers "stay on this page" keeps it without having
   * to touch anything again. There is no way to finish an asynchronous
   * request during an unload, so this is a head start, not a guarantee —
   * the prompt is what actually makes the loss impossible by accident.
   */
  onBeforeUnload?: () => void;
}

/**
 * The guard the editor did not have: closing the tab or reloading it
 * within the save debounce lost the last change without a word — `grep` of
 * `beforeunload` across the whole app came back empty.
 *
 * Leaving the BROWSER only. Navigating inside the app is a separate
 * question with a separate answer, and for the canvas the answer is that
 * it needs no question at all: it flushes its pending saves as it unmounts
 * (see useCanvasDraft), so following a link costs nothing. Where there is
 * no autosave to flush — the form editor — see useNavigationBlocker below.
 */
export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  onBeforeUnload,
}: UnsavedChangesGuardParams): void {
  // The listener is attached once and reads through this, like the canvas
  // shortcuts do: re-attaching on every keystroke would be the alternative,
  // and a listener that re-registers while a save is pending is one more
  // thing that can be wrong at exactly the wrong moment.
  const stateRef = useRef({ hasUnsavedChanges, onBeforeUnload });
  useEffect(() => {
    stateRef.current = { hasUnsavedChanges, onBeforeUnload };
  });

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      const state = stateRef.current;
      if (!state.hasUnsavedChanges) {
        return;
      }
      state.onBeforeUnload?.();
      // Both, deliberately: preventDefault() is what the current standard
      // asks for, and a non-empty returnValue is what older engines still
      // read. Setting only one of them silently does nothing somewhere.
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}

export interface NavigationBlocker {
  /** True while a navigation is being held. Render the question; call one of the two below to answer it. */
  isBlocked: boolean;
  proceed: () => void;
  stay: () => void;
}

/**
 * Holds an in-app navigation until somebody answers for it.
 *
 * A hook of its own rather than a flag on the one above, because
 * `useBlocker` needs a router around it and the canvas shell is mounted in
 * tests without one. Only screens that genuinely throw work away should
 * reach for it — a question in front of a link that loses nothing is
 * friction with no danger behind it.
 */
export function useNavigationBlocker(shouldBlock: boolean): NavigationBlocker {
  // `withResolver` so the caller can ask with the app's own dialog: without
  // it the router blocks the navigation and shows nothing at all, which
  // reads as a link that does not work.
  const blocker = useBlocker({
    // Only LEAVING the screen is a question. A change to its own address —
    // the tab it is on, the page of a list inside it — keeps the work where
    // it is, and asking about it would put "you will lose your changes" in
    // front of a click that loses none.
    shouldBlockFn: ({ current, next }) =>
      shouldBlock && current.pathname !== next.pathname,
    disabled: !shouldBlock,
    withResolver: true,
  });

  return {
    isBlocked: blocker.status === 'blocked',
    proceed: () => blocker.proceed?.(),
    stay: () => blocker.reset?.(),
  };
}
