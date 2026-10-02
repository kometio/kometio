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
import { DeploymentNotSetUpError } from '../deployment-tenant.resolver';

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

    const session = await this.validate(token);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.tenantId = session.tenantId;
    request.userId = session.userId;
    request.sessionToken = token;
    return true;
  }

  /**
   * A deployment that has no tenant yet has no sessions either, so a cookie
   * that reaches one is not a valid session — which is what the caller is
   * told, rather than the 503 `DeploymentNotSetUpError` maps to. The cookie
   * is there all the same: cookies do not tell ports apart, so a login left
   * on `localhost` by another Kometio reaches an installation still waiting
   * for its first account, and a 503 would keep the editor from ever
   * reaching the setup form. Only that error is turned into "no session":
   * any other failure of the lookup is a fault and surfaces as one.
   */
  private async validate(token: string) {
    try {
      return await this.authPort.validateSession(token);
    } catch (error) {
      if (error instanceof DeploymentNotSetUpError) return null;
      throw error;
    }
  }
}
