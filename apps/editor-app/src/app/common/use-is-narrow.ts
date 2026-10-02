import { useSyncExternalStore } from 'react';

/** Tailwind's `md`, the width under which the canvas and its side panels cannot sit side by side. */
const NARROW_QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(NARROW_QUERY);
  query?.addEventListener?.('change', onChange);
  return () => query?.removeEventListener?.('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia?.(NARROW_QUERY).matches === true;
}

/**
 * Whether the window is phone-narrow, and kept current as it changes.
 *
 * CSS alone was not enough here: below `md` the side panels are not
 * narrower versions of themselves but a different thing (a sheet over the
 * canvas, opened from the bar at the bottom), and only one of the two may
 * be mounted — the Layers tree registers drag handlers and the Properties
 * panel owns a focus target, and neither should exist twice.
 */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
