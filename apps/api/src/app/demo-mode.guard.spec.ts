import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { testApiEnv } from '../test/api-env.test-fixture';
import { executionContextOf } from '../test/http-doubles.test-fixture';
import { ROLES_KEY } from './auth/roles.decorator';
import { DemoModeGuard } from './demo-mode.guard';

function contextOf(
  request: { method: string; route: { path: string } },
  roles: string[] | undefined,
) {
  const context = executionContextOf({
    request,
    metadata: roles === undefined ? {} : { [ROLES_KEY]: roles },
  });
  return { context, reflector: new Reflector() };
}

function guardFor(
  demo: 'true' | 'false' | undefined,
  request: { method: string; route: { path: string } },
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
      guardFor(undefined, { method: 'POST', route: { path: '/api/media' } }, [
        'admin',
      ])(),
    ).toBe(true);
    expect(
      guardFor('false', { method: 'POST', route: { path: '/api/media' } })(),
    ).toBe(true);
  });

  it('refuses a route only an admin may call, because nobody there is above a publisher', () => {
    const call = guardFor(
      'true',
      { method: 'PATCH', route: { path: '/api/sites/1/theme-settings' } },
      ['admin'],
    );

    expect(call).toThrow(ForbiddenException);
    expect(call).toThrow('Not available in the demo');
  });

  it('leaves a route a publisher may call', () => {
    expect(
      guardFor(
        'true',
        { method: 'POST', route: { path: '/api/page-groups/x/publish' } },
        ['admin', 'publisher'],
      )(),
    ).toBe(true);
  });

  it('leaves a route that asks for no role, which is the session’s to check', () => {
    expect(
      guardFor('true', {
        method: 'PATCH',
        route: { path: '/api/page-groups/x/content' },
      })(),
    ).toBe(true);
  });

  it('refuses an upload and a change of the account, whatever role they ask for', () => {
    for (const request of [
      { method: 'POST', route: { path: '/api/media' } },
      { method: 'POST', route: { path: '/api/account/password' } },
    ]) {
      expect(
        guardFor('true', request, ['admin', 'publisher', 'editor']),
      ).toThrow(ForbiddenException);
    }
  });
});
