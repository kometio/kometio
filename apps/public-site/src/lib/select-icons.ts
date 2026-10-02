import type { IconEntry } from '@kometio/shared-types';
export interface IconQuery {
  /** Part of a name — what the picker's search box holds. */
  search?: string;
  /** Exact names, for the preview of icons already chosen. */
  names?: string[];
  /** At most this many, so a search box never pulls a whole set. */
  limit?: number;
}

/**
 * The icons a picker actually needs from one set, instead of the whole of
 * it: the brand set serialises to 5.2MB, and an editor opening the logos
 * tab to find one used to download every logo there is (ADR-0053).
 *
 * `names` wins over `search` — asking for two named icons is a lookup, not
 * a search, and returns exactly those.
 */
export function selectIcons(icons: IconEntry[], query: IconQuery): IconEntry[] {
  if (query.names && query.names.length > 0) {
    const wanted = new Set(query.names);
    return icons.filter((icon) => wanted.has(icon.name));
  }
  const needle = query.search?.trim().toLowerCase() ?? '';
  const matching = needle
    ? icons.filter((icon) => icon.name.toLowerCase().includes(needle))
    : icons;
  return query.limit ? matching.slice(0, query.limit) : matching;
}
