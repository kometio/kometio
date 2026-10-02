import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

/**
 * The event the browser fires on its way out.
 *
 * Deliberately WITHOUT touching `returnValue` here: in jsdom the setter
 * calls preventDefault() for any falsy value, so pre-setting it to '' — as
 * a real BeforeUnloadEvent arrives — would mark every event as prevented
 * and the test would pass whatever the hook did.
 */
function fireBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('useUnsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * `grep` of `beforeunload` across the whole app came back empty: with the
   * canvas saving on a 300ms debounce, closing the tab inside that window
   * lost the last change without a word.
   */
  it('stops the browser leaving while something is unwritten', () => {
    renderHook(() => useUnsavedChangesGuard({ hasUnsavedChanges: true }));

    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });

  it('says nothing when everything is written', () => {
    renderHook(() => useUnsavedChangesGuard({ hasUnsavedChanges: false }));

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  /*
   * The flush is what makes answering "stay on this page" enough: the
   * pending save is already on the wire by the time the question appears,
   * so nobody has to touch anything again.
   */
  it('fires the pending save before asking', () => {
    const onBeforeUnload = vi.fn();
    renderHook(() =>
      useUnsavedChangesGuard({ hasUnsavedChanges: true, onBeforeUnload }),
    );

    fireBeforeUnload();

    expect(onBeforeUnload).toHaveBeenCalledTimes(1);
  });

  it('does not fire a save when there is nothing pending', () => {
    const onBeforeUnload = vi.fn();
    renderHook(() =>
      useUnsavedChangesGuard({ hasUnsavedChanges: false, onBeforeUnload }),
    );

    fireBeforeUnload();

    expect(onBeforeUnload).not.toHaveBeenCalled();
  });

  /*
   * The listener is attached once and reads the current state through a
   * ref — so it has to SEE a change that arrives after mount. Re-attaching
   * on every keystroke was the alternative.
   */
  it('follows the state it was last rendered with', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedChangesGuard({ hasUnsavedChanges: dirty }),
      { initialProps: { dirty: false } },
    );

    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    rerender({ dirty: true });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    rerender({ dirty: false });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('stops listening once it is gone', () => {
    const { unmount } = renderHook(() =>
      useUnsavedChangesGuard({ hasUnsavedChanges: true }),
    );
    unmount();

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
