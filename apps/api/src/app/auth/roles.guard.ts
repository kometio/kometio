import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@kometio/domain-core';
import type { UserRepositoryPort } from '@kometio/ports';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedRequest } from './session-auth.guard';
import { USER_REPOSITORY } from '../adapters/port.tokens';

/**
 * Must run after SessionAuthGuard in the same @UseGuards() chain — reads
 * `request.userId`/`request.tenantId` that guard already wrote. Looks the
 * user up fresh on every request rather than trusting anything cached in
 * the session (no role/isActive in Session — see auth.port.ts): a role
 * change or a deactivation takes effect on the very next request, not
 * just the next login, at the cost of one extra query per guarded request.
 * The same lookup also enforces `isActive`, so a deactivated user's
 * existing session cookie stops working immediately, not just at next
 * sign-in.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Runs after SessionAuthGuard, which sets these; without them there is
    // no one to check, and that is a 401, not a server error.
    if (!request.tenantId || !request.userId) {
      throw new UnauthorizedException();
    }
    const user = await this.userRepository.findById(
      request.tenantId,
      request.userId,
    );
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account inactive or not found');
    }
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
