import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@kometio/domain-core';
import type { ApiEnv } from '../env-schema';
import { API_ENV } from './api-env.module';
import { ROLES_KEY } from './auth/roles.decorator';
import {
  isForAdminsOnly,
  isRefusedInDemo,
  NOT_IN_DEMO_MESSAGE,
} from './demo-mode';

/**
 * On a demo deployment (docs/adr/0118), the routes nobody there may use:
 * those only an admin may (an admin is a publisher there, `roleInDemo`) and
 * the writes of `REFUSED_IN_DEMO`. A global guard, so that a route added next
 * month is closed by the same rule without anybody having to remember.
 * Nothing at all elsewhere: it is not even built to look.
 */
@Injectable()
export class DemoModeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.env.KOMETIO_DEMO !== 'true') return true;

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<Request>();
    if (
      isForAdminsOnly(roles) ||
      isRefusedInDemo(request.method, request.path)
    ) {
      throw new ForbiddenException(NOT_IN_DEMO_MESSAGE);
    }
    return true;
  }
}
