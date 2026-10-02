import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import type { Session } from '@kometio/ports';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';

export const SESSION_COOKIE_NAME = 'kometio_session';

/** The part of Express's response a cookie is written through. */
export interface CookieWriter {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

/**
 * The session cookie, in one place for every route that sets or clears it
 * (login, first-run setup, logout). `Secure` in the production image,
 * whose Dockerfile sets NODE_ENV=production: it did not, and the cookie
 * went out without `Secure` on every real deployment.
 *
 * It lasts exactly as long as the session it carries — `expires` is the
 * session's own — rather than a duration copied from the session adapter
 * that the two could disagree on.
 */
@Injectable()
export class SessionCookies {
  private readonly options: CookieOptions;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.options = {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    };
  }

  set(response: CookieWriter, session: Pick<Session, 'token' | 'expiresAt'>) {
    response.cookie(SESSION_COOKIE_NAME, session.token, {
      ...this.options,
      expires: session.expiresAt,
    });
  }

  clear(response: CookieWriter) {
    response.clearCookie(SESSION_COOKIE_NAME, this.options);
  }
}
