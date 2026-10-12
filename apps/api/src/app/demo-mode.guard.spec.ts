import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { testApiEnv } from '../test/api-env.test-fixture';
import { DemoModeGuard } from './demo-mode.guard';

function contextOf(
  request: { method: string; path: string },
  roles: string[] | undefined,
) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

function guardFor(
  demo: 'true' | 'false' | undefined,
  request: { method: string; path: string },
  roles?: string[],
) {
  const { context, reflector } = contextOf(request, roles);
  const guard = new DemoModeGuard(
    reflector,
    testApiEnv({ KOMETIO_DEMO: demo }),
  );
  return () => guard.canActivate(context);
}

describe('DemoModeGuard', () => {
  it('lets everything through on a deployment that is not a demo', () => {
    expect(
      guardFor(undefined, { method: 'POST', path: '/api/media' }, ['admin'])(),
    ).toBe(true);
    expect(guardFor('false', { method: 'POST', path: '/api/media' })()).toBe(
      true,
    );
  });

  it('refuses a route only an admin may call, because nobody there is above a publisher', () => {
    const call = guardFor(
      'true',
      { method: 'PATCH', path: '/api/sites/1/theme-settings' },
      ['admin'],
    );

    expect(call).toThrow(ForbiddenException);
    expect(call).toThrow('Not available in the demo');
  });

  it('leaves a route a publisher may call', () => {
    expect(
      guardFor('true', { method: 'POST', path: '/api/page-groups/x/publish' }, [
        'admin',
        'publisher',
      ])(),
    ).toBe(true);
  });

  it('leaves a route that asks for no role, which is the session’s to check', () => {
    expect(
      guardFor('true', {
        method: 'PATCH',
        path: '/api/page-groups/x/content',
      })(),
    ).toBe(true);
  });

  it('refuses an upload and a change of the account, whatever role they ask for', () => {
    for (const request of [
      { method: 'POST', path: '/api/media' },
      { method: 'POST', path: '/api/account/password' },
    ]) {
      expect(
        guardFor('true', request, ['admin', 'publisher', 'editor']),
      ).toThrow(ForbiddenException);
    }
  });
});
