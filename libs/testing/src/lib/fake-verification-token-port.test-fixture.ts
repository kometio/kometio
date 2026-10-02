import { randomUUID } from 'node:crypto';
import type { VerificationToken, VerificationTokenPort } from '@kometio/ports';

/**
 * No real hashing/crypto — fast and deterministic for use-case unit tests.
 * Real persistence/single-use semantics are covered by
 * verification-token-adapter's own tests against its actual implementation.
 */
export class FakeVerificationTokenPort implements VerificationTokenPort {
  private tokens = new Map<string, VerificationToken>();

  async createToken(
    userId: string,
    tenantId: string,
    purpose: VerificationToken['purpose'],
    ttlMs: number,
    payload?: string,
  ): Promise<VerificationToken> {
    const token: VerificationToken = {
      token: randomUUID(),
      userId,
      tenantId,
      purpose,
      payload: payload ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    };
    this.tokens.set(token.token, token);
    return token;
  }

  async consumeToken(
    token: string,
    purpose: VerificationToken['purpose'],
  ): Promise<VerificationToken | null> {
    const found = this.tokens.get(token);
    if (!found || found.purpose !== purpose) {
      return null;
    }
    this.tokens.delete(token);
    if (found.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return found;
  }
}
