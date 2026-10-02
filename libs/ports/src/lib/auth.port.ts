export interface Session {
  token: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

/**
 * Implementata da @kometio/session-auth-adapter — argon2id per l'hashing,
 * sessioni opache (token casuale, hash SHA-256 persistito) via cookie.
 * Vedi docs/adr/0010-session-based-auth-foundations.md.
 */
export interface AuthPort {
  hashPassword(plainText: string): Promise<string>;
  verifyPassword(plainText: string, passwordHash: string): Promise<boolean>;
  createSession(userId: string, tenantId: string): Promise<Session>;
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
}
