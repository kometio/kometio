import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './session-auth.guard';

/**
 * Who is asking, as SessionAuthGuard found them in the session
 * (docs/adr/0010): read from the request that guard wrote, as a handler's
 * parameter. It replaced a request-scoped TenantContextPort injected into
 * fifteen controllers and asked seventy times — which also made each of
 * those controllers be built again for every request.
 *
 * Read on a route the guard does not cover, it is a bug, not a visitor to
 * turn away: it fails as one, as a 500 in the log.
 */
export function sessionIdentity(context: ExecutionContext): {
  tenantId: string;
  userId: string;
} {
  const { tenantId, userId } = context
    .switchToHttp()
    .getRequest<Partial<AuthenticatedRequest>>();
  if (!tenantId || !userId) {
    throw new Error(
      'The session was read on a route SessionAuthGuard does not cover.',
    );
  }
  return { tenantId, userId };
}

/** The tenant of the signed-in user making the request. */
export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    sessionIdentity(context).tenantId,
);

/** The signed-in user making the request. */
export const UserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    sessionIdentity(context).userId,
);

/**
 * The session this request is made from, for a route that has to tell it
 * from the person's other sessions (changing the password ends the others
 * and keeps this one).
 */
export const SessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { sessionToken } = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    if (!sessionToken) {
      throw new Error(
        'The session was read on a route SessionAuthGuard does not cover.',
      );
    }
    return sessionToken;
  },
);
