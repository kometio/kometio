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
import { noErrorReporter, type ErrorReporterPort } from '@kometio/ports';
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

  /**
   * `reporter` is where an error nobody expected goes besides the log
   * (docs/adr/0114). Left out, nowhere: the filters that only ever answer a
   * known error (AuthErrorsFilter) have nothing to report.
   */
  constructor(private readonly reporter: ErrorReporterPort = noErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const { httpException, unexpected } = this.resolveHttpException(exception);
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

    // Only what nobody handled: a refused request, a missing page and a rule
    // that said no are the application working, and a 503 before the first
    // run is it saying so. The log has them all.
    if (unexpected) {
      try {
        this.reporter.captureException(exception, {
          requestId,
          method: request.method,
          path,
        });
      } catch {
        // The request is already failing; the report is not worth a second.
      }
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

  private resolveHttpException(exception: unknown): {
    httpException: HttpException;
    /** True when nothing knew what this was: it is a bug, not an answer. */
    unexpected: boolean;
  } {
    if (exception instanceof HttpException) {
      return { httpException: exception, unexpected: false };
    }
    const mapped = mapDomainErrorToHttpException(exception);
    if (mapped) {
      return { httpException: mapped, unexpected: false };
    }
    return {
      httpException: new InternalServerErrorException('Internal server error'),
      unexpected: true,
    };
  }
}
