import { randomUUID } from 'node:crypto';
import type {
  ActiveSession,
  AuthPort,
  Session,
  SessionDevice,
} from '@kometio/ports';

/** What the fake keeps of a sign-in besides the session itself. */
interface Sign {
  id: string;
  deviceLabel: string | null;
  createdAt: Date;
}

/**
 * No real hashing/crypto — fast and deterministic for use-case unit tests.
 * Real hashing/session persistence is covered by session-auth-adapter's own
 * tests against its actual implementation.
 */
export class FakeAuthPort implements AuthPort {
  private sessions = new Map<string, Session>();
  private signs = new Map<string, Sign>();

  async hashPassword(plainText: string): Promise<string> {
    return `hashed:${plainText}`;
  }

  async verifyPassword(
    plainText: string,
    passwordHash: string,
  ): Promise<boolean> {
    return passwordHash === `hashed:${plainText}`;
  }

  async createSession(
    userId: string,
    tenantId: string,
    device?: SessionDevice,
  ): Promise<Session> {
    const session: Session = {
      token: randomUUID(),
      userId,
      tenantId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    };
    this.sessions.set(session.token, session);
    this.signs.set(session.token, {
      id: randomUUID(),
      deviceLabel: device?.label ?? null,
      createdAt: new Date(),
    });
    return session;
  }

  async validateSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async invalidateSession(token: string): Promise<void> {
    this.sessions.delete(token);
    this.signs.delete(token);
  }

  async invalidateAllSessionsForUser(userId: string): Promise<void> {
    for (const [token, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(token);
        this.signs.delete(token);
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
        this.signs.delete(token);
      }
    }
  }

  async listSessionsForUser(
    userId: string,
    _tenantId: string,
    currentToken: string,
  ): Promise<ActiveSession[]> {
    const listed: ActiveSession[] = [];
    for (const [token, session] of this.sessions) {
      const sign = this.signs.get(token);
      if (session.userId !== userId || !sign) continue;
      listed.push({
        id: sign.id,
        deviceLabel: sign.deviceLabel,
        createdAt: sign.createdAt,
        lastUsedAt: sign.createdAt,
        isCurrent: token === currentToken,
      });
    }
    return listed;
  }

  async invalidateSessionOfUser(
    userId: string,
    _tenantId: string,
    sessionId: string,
  ): Promise<boolean> {
    for (const [token, sign] of this.signs) {
      if (
        sign.id === sessionId &&
        this.sessions.get(token)?.userId === userId
      ) {
        this.sessions.delete(token);
        this.signs.delete(token);
        return true;
      }
    }
    return false;
  }
}
