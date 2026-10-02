import {
  Catch,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { mapDomainErrorToHttpException } from './domain-error-http-mapping';
import type { RequestWithId } from './request-id.middleware';

/**
 * The global filter (security review 2026-08-24, points 14 and 17) — two
 * problems solved together because they are the same area of code:
 * - point 17: it replaces the 7 duplicated private `handleDomainErrors`
 *   (one per controller) with a single map (domain-error-http-mapping.ts)
 *   applied here rather than in the controllers themselves.
 * - point 14: logging was all but absent — every unhandled error reached
 *   the log (or failed to reach it at all) with no context. Now every
 *   failed request is logged with its request id (see
 *   request-id.middleware.ts), method+url and status — a production crash
 *   is discovered from here, no longer only from the customer.
 *
 * `@Catch()` with no arguments: it catches EVERYTHING, not just
 * HttpException — a domain error that escapes mapDomainErrorToHttpException
 * (or a real bug) still becomes a 500 logged with its stack, never a silent
 * process crash.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const httpException = this.resolveHttpException(exception);
    const status = httpException.getStatus();
    const requestId = request.requestId;

    // The path without its query: a preview link carries its token there
    // (`?token=`), and a log line is no place for a credential.
    const path = request.originalUrl.split('?', 1)[0];
    const logLine = `${request.method} ${path} -> ${status} [${requestId}]`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${logLine} ${httpException.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(`${logLine} ${httpException.message}`);
    }

    const body = httpException.getResponse();
    response
      .status(status)
      .json(
        typeof body === 'string'
          ? { statusCode: status, message: body, requestId }
          : { ...body, requestId },
      );
  }

  private resolveHttpException(exception: unknown): HttpException {
    if (exception instanceof HttpException) {
      return exception;
    }
    const mapped = mapDomainErrorToHttpException(exception);
    if (mapped) {
      return mapped;
    }
    return new InternalServerErrorException('Internal server error');
  }
}
