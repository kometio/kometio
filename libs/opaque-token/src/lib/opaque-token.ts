import { createHash, randomBytes } from 'node:crypto';

/**
 * Shared by session-auth-adapter (sessions) and verification-token-adapter
 * (email verification / password reset) — same mechanic, two consumers,
 * see docs/adr/0011-email-verification-password-reset.md.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, not argon2: the token is already high-entropy and random, so
 * there's no dictionary to defend against and no reason to pay argon2's
 * deliberate slowness on every lookup. If the DB leaks, the hashes alone
 * don't yield usable tokens.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
