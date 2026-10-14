import { Logger, NotFoundException } from '@nestjs/common';
import { PageGroupNotFoundError } from '@kometio/domain-core';
import type { ErrorReporterPort } from '@kometio/ports';
import { executionContextOf } from '../test/http-doubles.test-fixture';
import { DeploymentNotSetUpError } from './deployment-tenant.resolver';
import { HttpExceptionFilter } from './http-exception.filter';
import type { RequestWithId } from './request-id.middleware';

function buildHost(request: Partial<RequestWithId>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = executionContextOf({ request, response: { status } });
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes an already-thrown HttpException through unchanged, with the request id attached', () => {
    const { host, status, json } = buildHost({
      requestId: 'req-1',
      method: 'GET',
      originalUrl: '/pages/missing',
    });

    filter.catch(new NotFoundException('Page not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Page not found',
        requestId: 'req-1',
      }),
    );
  });

  it('logs the path of a failed request, never its query, where a preview token travels', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { host } = buildHost({
      requestId: 'req-t',
      method: 'GET',
      originalUrl: '/public/pages/p1/preview?token=segreto.firmato',
    });

    filter.catch(new NotFoundException('Page not found'), host);

    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('GET /public/pages/p1/preview -> 404');
    expect(line).not.toContain('segreto');
  });

  it('does not carry the query into the log through the message either: Nest’s own 404 says "Cannot GET <url>"', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { host } = buildHost({
      requestId: 'req-q',
      method: 'GET',
      originalUrl: '/api/no-such-route?token=segreto.firmato&x=1',
    });

    filter.catch(
      new NotFoundException(
        'Cannot GET /api/no-such-route?token=segreto.firmato&x=1',
      ),
      host,
    );

    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('GET /api/no-such-route -> 404');
    expect(line).toContain('Cannot GET /api/no-such-route');
    expect(line).not.toContain('segreto');
    expect(line).not.toContain('token=');
  });

  it('maps a known domain error to its HTTP status via the shared mapping table', () => {
    const { host, status, json } = buildHost({
      requestId: 'req-2',
      method: 'GET',
      originalUrl: '/pages/abc',
    });

    filter.catch(new PageGroupNotFoundError('abc'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        requestId: 'req-2',
      }),
    );
  });

  it('falls back to a 500 for an error the mapping table does not know', () => {
    const { host, status, json } = buildHost({
      requestId: 'req-3',
      method: 'POST',
      originalUrl: '/pages',
    });

    filter.catch(new Error('db exploded'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, requestId: 'req-3' }),
    );
  });

  it('logs a 5xx as an error, with the stack trace and the request id in the message', () => {
    const { host } = buildHost({
      requestId: 'req-4',
      method: 'POST',
      originalUrl: '/pages',
    });
    const error = new Error('db exploded');

    filter.catch(error, host);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('req-4'),
      error.stack,
    );
  });

  it('logs a 4xx as a warning, not an error — expected client mistakes should not page anyone', () => {
    const { host } = buildHost({
      requestId: 'req-5',
      method: 'GET',
      originalUrl: '/pages/missing',
    });

    filter.catch(new PageGroupNotFoundError('missing'), host);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('req-5'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe('reporting (docs/adr/0114)', () => {
    let reporter: jest.Mocked<ErrorReporterPort>;

    beforeEach(() => {
      reporter = {
        enabled: true,
        captureException: jest.fn(),
        flush: jest.fn(),
      };
      filter = new HttpExceptionFilter(reporter);
    });

    it('reports an error nobody handled, with where it happened and not the query', () => {
      const { host } = buildHost({
        requestId: 'req-9',
        method: 'POST',
        originalUrl: '/api/pages/p1?token=segreto',
      });
      const error = new Error('db exploded');

      filter.catch(error, host);

      expect(reporter.captureException).toHaveBeenCalledWith(error, {
        requestId: 'req-9',
        method: 'POST',
        path: '/api/pages/p1',
      });
    });

    it.each([
      ['a refused request', new NotFoundException('Page not found')],
      ['a domain rule that said no', new PageGroupNotFoundError('abc')],
      [
        'a 503 the application answers on purpose (not set up yet)',
        new DeploymentNotSetUpError(),
      ],
    ])(
      'does not report %s: that is the application working',
      (_name, error) => {
        const { host } = buildHost({
          requestId: 'req-10',
          method: 'GET',
          originalUrl: '/api/pages',
        });

        filter.catch(error, host);

        expect(reporter.captureException).not.toHaveBeenCalled();
      },
    );

    it('answers the request the same when the report itself fails', () => {
      reporter.captureException.mockImplementation(() => {
        throw new Error('sentry is down');
      });
      const { host, status } = buildHost({
        requestId: 'req-11',
        method: 'GET',
        originalUrl: '/api/pages',
      });

      expect(() => filter.catch(new Error('boom'), host)).not.toThrow();

      expect(status).toHaveBeenCalledWith(500);
    });
  });
});
