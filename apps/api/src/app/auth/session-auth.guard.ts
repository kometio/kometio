import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPort } from '@kometio/ports';
import { SESSION_COOKIE_NAME } from './session-cookies';
import { AUTH_PORT } from '../adapters/port.tokens';

export interface AuthenticatedRequest extends Request {
  tenantId: string;
  userId: string;
  /** The session the request came with — for the few routes that must tell it from the person's others. */
  sessionToken: string;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_PORT) private readonly authPort: AuthPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('No session');
    }

    const session = await this.authPort.validateSession(token);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.tenantId = session.tenantId;
    request.userId = session.userId;
    request.sessionToken = token;
    return true;
  }
}
