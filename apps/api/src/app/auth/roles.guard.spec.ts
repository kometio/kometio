import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { UserRepositoryPort } from '@kometio/ports';
import { buildUser } from '@kometio/testing';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedRequest } from './session-auth.guard';

const tenantId = 'tenant-1';

// Express's Request has 100+ members — only `tenantId`/`userId` are read
// here, so a minimal double stands in via `unknown` rather than
// implementing the whole interface.
function buildContext(
  requiredRoles: string[] | undefined,
  session: { tenantId?: string; userId?: string } = {
    tenantId,
    userId: 'user-1',
  },
) {
  const request = session as unknown as AuthenticatedRequest;
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext,
    reflector: {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as jest.Mocked<Reflector>,
  };
}

describe('RolesGuard', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;

  beforeEach(() => {
    userRepository = {
      add: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      list: jest.fn(),
      saveAccess: jest.fn(),
      removePendingInvite: jest.fn(),
      saveCredentials: jest.fn(),
      saveInviteAccepted: jest.fn(),
      saveLanguage: jest.fn(),
      findBySlug: jest.fn(),
      findByFormerSlug: jest.fn(),
      isSlugTaken: jest.fn(),
      saveProfile: jest.fn(),
      saveAvatar: jest.fn(),
    };
  });

  it('allows access when the handler declares no required roles', async () => {
    const { context, reflector } = buildContext(undefined);
    const guard = new RolesGuard(reflector, userRepository);

    expect(await guard.canActivate(context)).toBe(true);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('allows access when the user has one of the required roles', async () => {
    const { context, reflector } = buildContext(['admin', 'publisher']);
    userRepository.findById.mockResolvedValue(buildUser({ role: 'admin' }));
    const guard = new RolesGuard(reflector, userRepository);

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('throws Forbidden when the user is active but lacks the required role', async () => {
    const { context, reflector } = buildContext(['admin']);
    userRepository.findById.mockResolvedValue(buildUser({ role: 'editor' }));
    const guard = new RolesGuard(reflector, userRepository);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws Unauthorized, not a server error, when no session has been read', async () => {
    const { context, reflector } = buildContext(['admin'], {});
    const guard = new RolesGuard(reflector, userRepository);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when the user no longer exists', async () => {
    const { context, reflector } = buildContext(['admin']);
    userRepository.findById.mockResolvedValue(null);
    const guard = new RolesGuard(reflector, userRepository);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws Unauthorized for a deactivated user, even with the right role — session cookie stops working on the very next guarded request', async () => {
    const { context, reflector } = buildContext(['admin']);
    const user = buildUser({ role: 'admin', isActive: false });
    userRepository.findById.mockResolvedValue(user);
    const guard = new RolesGuard(reflector, userRepository);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
