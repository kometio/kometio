export interface Session {
  token: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

/**
 * Where a sign-in came from, as far as a person can recognise it
 * (docs/adr/0129): a label like "Chrome on macOS", never an address and never
 * the header it was read from. `null` where nothing was recognised.
 */
export interface SessionDevice {
  label: string | null;
}

/** One of a person's sign-ins, as the list of where they are signed in shows it. */
export interface ActiveSession {
  /** The row's own id: it names the session to end, and is not a way into it. */
  id: string;
  deviceLabel: string | null;
  createdAt: Date;
  /** To within a few minutes: a request notes it only when the last note is older. */
  lastUsedAt: Date;
  /** The one the question was asked from. */
  isCurrent: boolean;
}

/**
 * Implementata da @kometio/session-auth-adapter — argon2id per l'hashing,
 * sessioni opache (token casuale, hash SHA-256 persistito) via cookie.
 * Vedi docs/adr/0010-session-based-auth-foundations.md.
 */
export interface AuthPort {
  hashPassword(plainText: string): Promise<string>;
  verifyPassword(plainText: string, passwordHash: string): Promise<boolean>;
  createSession(
    userId: string,
    tenantId: string,
    device?: SessionDevice,
  ): Promise<Session>;
  validateSession(token: string): Promise<Session | null>;
  invalidateSession(token: string): Promise<void>;
  /** Used by password reset: a reset should end any already-open sessions. */
  invalidateAllSessionsForUser(userId: string, tenantId: string): Promise<void>;
  /**
   * Used by a password change: every other place the person is signed in
   * ends, the one they are changing it from stays. The token is the
   * session to keep.
   */
  invalidateOtherSessionsForUser(
    userId: string,
    tenantId: string,
    keepToken: string,
  ): Promise<void>;
  /** Where the person is signed in, the most recently used first. Only what has not expired. */
  listSessionsForUser(
    userId: string,
    tenantId: string,
    currentToken: string,
  ): Promise<ActiveSession[]>;
  /**
   * Ends one of the person's own sign-ins, by the id `listSessionsForUser`
   * gave. Answers whether there was one of theirs to end: another person's id
   * ends nothing, and says so as an id that does not exist does.
   */
  invalidateSessionOfUser(
    userId: string,
    tenantId: string,
    sessionId: string,
  ): Promise<boolean>;
}
