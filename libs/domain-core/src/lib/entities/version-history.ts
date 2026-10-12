/**
 * How many versions of one page, language or section are kept: the last N,
 * the oldest pruned as each new one is saved (no scheduled job). One number
 * for every kind of version, said here so that the database's retention and
 * what the in-memory fakes keep cannot be two.
 */
export const VERSION_HISTORY_LIMIT = 10;
