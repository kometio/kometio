import { testApiEnv } from '../../test/api-env.test-fixture';
import {
  SESSION_COOKIE_NAME,
  SessionCookies,
  type CookieWriter,
} from './session-cookies';

function recordingResponse() {
  const calls: { method: string; name: string; options: unknown }[] = [];
  const response: CookieWriter = {
    cookie: (name, _value, options) =>
      calls.push({ method: 'cookie', name, options }),
    clearCookie: (name, options) =>
      calls.push({ method: 'clearCookie', name, options }),
  };
  return { calls, response };
}

const session = { token: 'token', expiresAt: new Date('2026-10-13T09:00:00Z') };

describe('SessionCookies', () => {
  it('is Secure in the production image, set and cleared alike', () => {
    const cookies = new SessionCookies(testApiEnv({ NODE_ENV: 'production' }));
    const { calls, response } = recordingResponse();

    cookies.set(response, session);
    cookies.clear(response);

    for (const call of calls) {
      expect(call.name).toBe(SESSION_COOKIE_NAME);
      expect(call.options).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      });
    }
  });

  it('is not Secure in development, which runs on plain http', () => {
    const cookies = new SessionCookies(testApiEnv({ NODE_ENV: 'development' }));
    const { calls, response } = recordingResponse();

    cookies.set(response, session);

    expect(calls[0]?.options).toMatchObject({ secure: false });
  });

  it('lasts exactly as long as the session it carries', () => {
    const cookies = new SessionCookies(testApiEnv());
    const { calls, response } = recordingResponse();

    cookies.set(response, session);

    expect(calls[0]?.options).toMatchObject({ expires: session.expiresAt });
  });
});
