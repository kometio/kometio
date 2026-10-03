import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthPort, Session } from '@kometio/ports';
import { DeploymentNotSetUpError } from '../deployment-tenant.resolver';
import { SessionAuthGuard } from './session-auth.guard';
import { SESSION_COOKIE_NAME } from './session-cookies';
import type { AuthenticatedRequest } from './session-auth.guard';

// Express's Request has 100+ members — a real instance isn't needed, only
// the `cookies` field the guard reads and the `tenantId`/`userId` fields it
// writes, so a minimal double stands in via `unknown` rather than
// implementing (or `Partial`-satisfying) the whole interface.
function fakeRequest(
  cookies: Record<string, string | undefined>,
): AuthenticatedRequest {
  return { cookies } as unknown as AuthenticatedRequest;
}

function buildContext(cookies: Record<string, string | undefined>) {
  const request = fakeRequest(cookies);
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('SessionAuthGuard', () => {
  let authPort: jest.Mocked<AuthPort>;
  let guard: SessionAuthGuard;

  beforeEach(() => {
    authPort = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      createSession: jest.fn(),
      validateSession: jest.fn(),
      invalidateSession: jest.fn(),
      invalidateAllSessionsForUser: jest.fn(),
      invalidateOtherSessionsForUser: jest.fn(),
    };
    guard = new SessionAuthGuard(authPort);
  });

  it('throws Unauthorized when the cookies object has no session key', async () => {
    const context = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized when cookie-parser never ran (cookies is undefined)', async () => {
    const request = { cookies: undefined } as unknown as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized when the session does not validate', async () => {
    authPort.validateSession.mockResolvedValue(null);
    const context = buildContext({ [SESSION_COOKIE_NAME]: 'bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /*
   * A deployment with no tenant yet cannot hold a session, so a cookie that
   * arrives there is simply not a valid one. It does arrive: cookies do not
   * tell ports apart, so a login left on `localhost` by another Kometio (a
   * development stack, a trial whose volume was deleted and made again)
   * reaches an installation that is still waiting for its first account.
   * Answered 503, the editor retried three times, showed a white page for
   * seven seconds, and ended on an error with no way to the setup form.
   */
  it('answers Unauthorized, not 503, to a session on a deployment not set up yet', async () => {
    authPort.validateSession.mockRejectedValue(new DeploymentNotSetUpError());
    const context = buildContext({ [SESSION_COOKIE_NAME]: 'left-over-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets any other failure of the session lookup surface as itself', async () => {
    const failure = new Error('the database is down');
    authPort.validateSession.mockRejectedValue(failure);
    const context = buildContext({ [SESSION_COOKIE_NAME]: 'any-token' });

    await expect(guard.canActivate(context)).rejects.toBe(failure);
  });

  it('attaches tenantId/userId to the request and allows access for a valid session', async () => {
    const session: Session = {
      token: 'good-token',
      userId: 'user-1',
      tenantId: 'tenant-1',
      expiresAt: new Date(),
    };
    authPort.validateSession.mockResolvedValue(session);
    const request = fakeRequest({ [SESSION_COOKIE_NAME]: 'good-token' });
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenantId).toBe('tenant-1');
    expect(request.userId).toBe('user-1');
    expect(request.sessionToken).toBe('good-token');
  });
});
