import { randomUUID } from 'node:crypto';
import type { AuthPort, Session } from '@kometio/ports';

/**
 * No real hashing/crypto — fast and deterministic for use-case unit tests.
 * Real hashing/session persistence is covered by session-auth-adapter's own
 * tests against its actual implementation.
 */
export class FakeAuthPort implements AuthPort {
  private sessions = new Map<string, Session>();

  async hashPassword(plainText: string): Promise<string> {
    return `hashed:${plainText}`;
  }

  async verifyPassword(
    plainText: string,
    passwordHash: string,
  ): Promise<boolean> {
    return passwordHash === `hashed:${plainText}`;
  }

  async createSession(userId: string, tenantId: string): Promise<Session> {
    const session: Session = {
      token: randomUUID(),
      userId,
      tenantId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    };
    this.sessions.set(session.token, session);
    return session;
  }

  async validateSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async invalidateAllSessionsForUser(userId: string): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(token);
      }
    }
  }

  async invalidateOtherSessionsForUser(
    userId: string,
    _tenantId: string,
    keepToken: string,
  ): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId && token !== keepToken) {
        this.sessions.delete(token);
      }
    }
  }
}
