import type { VerificationTokenPurpose } from '@kometio/domain-core';

export interface VerificationToken {
  token: string;
  userId: string;
  tenantId: string;
  purpose: VerificationTokenPurpose;
  /** What it was issued for beyond the account — the address of an email change; `null` for the tokens that need nothing more. */
  payload: string | null;
  expiresAt: Date;
}

/**
 * Same opaque-token mechanic as AuthPort's sessions (@kometio/opaque-token),
 * for one-time tokens instead of multi-use sessions — email verification
 * and password reset. See docs/adr/0011-email-verification-password-reset.md.
 */
export interface VerificationTokenPort {
  /** ttlMs is a policy decision (how long a token stays valid) — the
   * caller (application layer) decides it, the adapter just enforces it. */
  createToken(
    userId: string,
    tenantId: string,
    purpose: VerificationTokenPurpose,
    ttlMs: number,
    payload?: string,
  ): Promise<VerificationToken>;

  /** Single-use: a token that validates is also deleted atomically, so a
   * concurrent second consume of the same token always fails. */
  consumeToken(
    token: string,
    purpose: VerificationTokenPurpose,
  ): Promise<VerificationToken | null>;
}
