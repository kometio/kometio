import {
  BadRequestException,
  Catch,
  UnauthorizedException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  InvalidCredentialsError,
  InvalidOrExpiredTokenError,
  UserNotActiveError,
} from '@kometio/domain-core';
import { HttpExceptionFilter } from '../http-exception.filter';

/**
 * The auth routes' own answers to the three errors that must not tell a
 * caller anything about the accounts that exist (audit D5):
 *
 * - a wrong password and a deactivated account are the same 401, with the
 *   same wording — told apart, the second would confirm to anyone holding
 *   the right password that the account is there and switched off;
 * - an unknown, used or expired token is one 400.
 *
 * In one place for the whole controller, instead of a try/catch in each
 * route. Everything else, InvalidCaptchaError included, is the global
 * table's (domain-error-http-mapping.ts), and the response keeps the one
 * shape HttpExceptionFilter gives every error.
 */
@Catch(InvalidCredentialsError, UserNotActiveError, InvalidOrExpiredTokenError)
export class AuthErrorsFilter implements ExceptionFilter {
  private readonly responder = new HttpExceptionFilter();

  catch(error: Error, host: ArgumentsHost): void {
    const answer =
      error instanceof InvalidOrExpiredTokenError
        ? new BadRequestException(error.message)
        : new UnauthorizedException(new InvalidCredentialsError().message);
    this.responder.catch(answer, host);
  }
}
