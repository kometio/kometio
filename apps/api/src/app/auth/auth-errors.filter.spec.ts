import type { ArgumentsHost } from '@nestjs/common';
import {
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  UserNotActiveError,
} from '@kometio/domain-core';
import { AuthErrorsFilter } from './auth-errors.filter';

// Only the response's status/json and the request id are read; a minimal
// double stands in through `unknown`.
function answerTo(error: Error) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', originalUrl: '/api/auth/login' }),
    }),
  } as unknown as ArgumentsHost;
  new AuthErrorsFilter().catch(error, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('AuthErrorsFilter', () => {
  it('answers a deactivated account exactly as a wrong password', () => {
    const wrongPassword = answerTo(new InvalidCredentialsError());
    const deactivated = answerTo(new UserNotActiveError('user-1'));

    expect(wrongPassword.status).toBe(401);
    expect(deactivated).toEqual(wrongPassword);
  });

  it('answers any unusable token with one 400', () => {
    expect(answerTo(new InvalidOrExpiredTokenError())).toMatchObject({
      status: 400,
    });
  });
});
