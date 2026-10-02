import { useEffect, useState } from 'react';

/**
 * Generic "type into a box, wait, then use the settled value" hook — no
 * existing pattern to reuse in editor-app (grepped: every prior debounce
 * here, e.g. use-property-patch.ts, debounces a SAVE side-effect, not a
 * value read back into a render). Used by the pages-list filter bar's
 * title search: the route's `search` param only updates (and only
 * refetches the list) once the user pauses typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
