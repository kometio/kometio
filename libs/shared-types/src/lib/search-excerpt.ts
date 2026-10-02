/**
 * Matches the StartSel/StopSel control-character markers
 * DrizzleSearchRepository asks Postgres's ts_headline for (see its own
 * comment on why: plain markers, not real `<mark>` tags, so a search
 * excerpt built from editor-typed prose is never treated as trusted HTML
 * by a caller that forgets to escape it).
 */
const MATCH_START = '\x01';
const MATCH_STOP = '\x02';

export interface ExcerptSegment {
  text: string;
  matched: boolean;
}

/**
 * Turns a marker-delimited excerpt into plain-text segments a UI can
 * render safely with ordinary text interpolation — wrap `matched`
 * segments in a `<mark>` (or equivalent) at the call site instead of ever
 * injecting the excerpt as raw HTML.
 */
export function parseSearchExcerpt(excerpt: string): ExcerptSegment[] {
  const segments: ExcerptSegment[] = [];
  let matched = false;
  for (const chunk of excerpt.split(
    new RegExp(`([${MATCH_START}${MATCH_STOP}])`),
  )) {
    if (chunk === MATCH_START) {
      matched = true;
    } else if (chunk === MATCH_STOP) {
      matched = false;
    } else if (chunk.length > 0) {
      segments.push({ text: chunk, matched });
    }
  }
  return segments;
}
