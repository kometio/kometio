/** What is kept of a person's authenticator app (docs/adr/0137). */
export interface TotpFactor {
  userId: string;
  tenantId: string;
  /** The secret, sealed by `SecretCipherPort`: a dump of the database opens nothing. */
  sealedSecret: string;
  /**
   * When a code was first shown to fit. `null` is an enrolment somebody began
   * and did not finish: it is not asked at sign-in, and starting again
   * replaces it.
   */
  confirmedAt: Date | null;
  /** The last time step a code was accepted for; `null` before any. */
  lastUsedStep: number | null;
  /**
   * Until when the codes of the app are refused, because too many were wrong
   * in a row; `null` when they are not. A recovery code is not held back.
   */
  lockedUntil: Date | null;
}

/**
 * Where a person's second factor and their recovery codes are kept.
 *
 * Every method names the tenant, as `UserRepositoryPort` does. Nothing here
 * decides whether a code fits: that is `TotpPort`'s, and what to do about it
 * is the use cases'.
 */
export interface SecondFactorRepositoryPort {
  findTotp(tenantId: string, userId: string): Promise<TotpFactor | null>;

  /** Whether the person has a second factor that is switched on, for each of these — one question, for a list. */
  whichHaveSecondFactor(
    tenantId: string,
    userIds: string[],
  ): Promise<Set<string>>;

  /** Replaces whatever the person had — a half-made enrolment, or a factor switched on — with one not yet confirmed. */
  savePendingTotp(
    tenantId: string,
    userId: string,
    sealedSecret: string,
  ): Promise<void>;

  /**
   * Switches the pending factor on, records the step its first code was
   * accepted for and replaces the recovery codes — one transaction, so a
   * person is never left with a factor and no way back. Answers whether
   * there was a pending factor to confirm.
   */
  confirmTotp(
    tenantId: string,
    userId: string,
    firstStep: number,
    recoveryCodeHashes: string[],
  ): Promise<boolean>;

  /**
   * Moves the last accepted step forward, only if it is further than what is
   * there, in the same statement — which also forgets the wrong codes before
   * it. Answers whether it moved: `false` is another request having used that
   * step first, which is a replay.
   */
  useStep(tenantId: string, userId: string, step: number): Promise<boolean>;

  /**
   * A wrong code of the app, counted against the person and not against the
   * challenge it came with: a challenge costs a password and a captcha, and
   * the count has to survive the next one. The `maxAttempts`th in a row locks
   * the codes of the app until `lockMs` from `now`; the first after a lock
   * has run out starts the count again.
   */
  recordFailedAttempt(
    tenantId: string,
    userId: string,
    now: Date,
    policy: { maxAttempts: number; lockMs: number },
  ): Promise<void>;

  /** Forgets the wrong codes and any lock: a recovery code was used, which is who the lock is not for. */
  clearFailedAttempts(tenantId: string, userId: string): Promise<void>;

  /**
   * Spends a recovery code: answers whether there was one with this hash,
   * not yet spent, and marks it, atomically — two requests with the same code
   * cannot both have it.
   */
  spendRecoveryCode(
    tenantId: string,
    userId: string,
    codeHash: string,
  ): Promise<boolean>;

  countUnspentRecoveryCodes(tenantId: string, userId: string): Promise<number>;

  /** Replaces the codes with a new set; the old ones stop working. */
  replaceRecoveryCodes(
    tenantId: string,
    userId: string,
    codeHashes: string[],
  ): Promise<void>;

  /** Removes the factor and the codes: the person turning it off, or an administrator's reset. Answers whether there was anything. */
  removeAll(tenantId: string, userId: string): Promise<boolean>;
}
