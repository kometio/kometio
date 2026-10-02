/**
 * Who is making a change, and when.
 *
 * Every mutation on a page takes one, and it is deliberately not
 * optional: a list that has to answer "who touched this last" can only
 * do it if no write path is allowed to stay silent about its author, and
 * the compiler is the only thing that can enforce that across every
 * caller. `by` is nullable — a change can genuinely have no user behind
 * it (a migration, a scheduled job) — but saying so is a decision, not a
 * default.
 */
export interface EditContext {
  /** The acting user, or null when nothing human made this change. */
  by: string | null;
  /** Defaults to now; passed explicitly so a use case can make one timestamp cover a whole transaction. */
  now?: Date;
}
