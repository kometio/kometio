/**
 * Shared save/publish status shape — every canvas-backed editor (page
 * group, header/footer section, reusable section) tracks its own
 * draft/publish lifecycle through this same type.
 *
 * `saving` and the timestamp on `saved` exist because the bar was silent
 * about the only question a person actually has while typing into an
 * editor that saves by itself: has it. `idle` said nothing at all, and
 * `saved` said "Draft saved" forever — five seconds or forty minutes after
 * the fact, with no way to tell which.
 */
export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  /** `at` is when the save landed, so the bar can name the time rather than repeating a word that never expires. */
  | { kind: 'saved'; at: number }
  | { kind: 'published' }
  /** The error itself: useSaveStatusText turns it into words, in one place. */
  | { kind: 'error'; error: unknown };
