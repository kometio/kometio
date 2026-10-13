import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import {
  accessJson,
  accessLog,
  accessSummary,
  type AccessEntry,
} from './access-log.middleware';

/** The parts of a request and a response the middleware reads. */
function exchange({
  method = 'GET',
  originalUrl = '/api/pages',
  route,
  statusCode = 200,
  headers = {},
  requestId,
  userId,
}: {
  method?: string;
  originalUrl?: string;
  route?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  requestId?: string;
  userId?: string;
}) {
  const req = Object.assign(new EventEmitter(), {
    method,
    originalUrl,
    ...(route ? { route: { path: route } } : {}),
    ...(requestId ? { requestId } : {}),
    ...(userId ? { userId } : {}),
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode,
    getHeader: (name: string) => headers[name.toLowerCase()],
  });
  // What Express hands a middleware is a Request and a Response; these are
  // the parts of them it uses, and nothing else is read.
  return {
    req: req as unknown as Request,
    res: res as unknown as Response & EventEmitter,
  };
}

function run(options: Parameters<typeof exchange>[0], format: 'text' | 'json') {
  const written: string[] = [];
  const logged: string[] = [];
  const middleware = accessLog({
    format,
    write: (line) => written.push(line),
    logger: { log: (message: string) => logged.push(message) },
  });
  const { req, res } = exchange(options);
  const next: NextFunction = jest.fn();
  middleware(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  // Nothing is written before the response is.
  expect(written).toEqual([]);
  expect(logged).toEqual([]);
  res.emit('finish');
  return { written, logged };
}

describe('accessLog', () => {
  it('writes one line of text, through the logger, when the response has gone', () => {
    const { written, logged } = run(
      { requestId: 'req-1', statusCode: 404, originalUrl: '/api/pages/9' },
      'text',
    );

    expect(written).toEqual([]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(
      /^GET \/api\/pages\/9 404 \d+(\.\d)?ms \[req-1\]$/,
    );
  });

  it('writes one flat JSON object in json, with what a count by route or a search by request needs', () => {
    const { written, logged } = run(
      {
        method: 'POST',
        originalUrl: '/api/pages/9',
        route: '/api/pages/:id',
        statusCode: 201,
        headers: { 'content-length': '512' },
        requestId: 'req-2',
        userId: 'user-7',
      },
      'json',
    );

    expect(logged).toEqual([]);
    expect(written).toHaveLength(1);
    expect(written[0].includes('\n')).toBe(false);
    expect(JSON.parse(written[0])).toMatchObject({
      level: 'log',
      pid: process.pid,
      context: 'Access',
      method: 'POST',
      path: '/api/pages/9',
      route: '/api/pages/:id',
      status: 201,
      bytes: 512,
      requestId: 'req-2',
      userId: 'user-7',
    });
    expect(typeof JSON.parse(written[0]).durationMs).toBe('number');
    expect(typeof JSON.parse(written[0]).timestamp).toBe('number');
  });

  it('never writes the query: a preview link carries its token there', () => {
    const { written } = run(
      { originalUrl: '/api/preview/page?token=SECRET-TOKEN&x=1' },
      'json',
    );

    expect(written[0]).not.toContain('SECRET-TOKEN');
    expect(JSON.parse(written[0]).path).toBe('/api/preview/page');
  });

  it('leaves out what it does not know: no route, no length, nobody signed in', () => {
    const { written } = run({ statusCode: 403 }, 'json');
    const entry = JSON.parse(written[0]);

    expect(entry.status).toBe(403);
    for (const key of ['route', 'bytes', 'requestId', 'userId']) {
      expect(entry).not.toHaveProperty(key);
    }
  });

  it('leaves out the paths it is told to skip, and writes the others', () => {
    const written: string[] = [];
    const middleware = accessLog({
      format: 'json',
      write: (line) => written.push(line),
      skip: (path) => path === '/api/health',
    });

    for (const originalUrl of ['/api/health?probe=1', '/api/pages']) {
      const { req, res } = exchange({ originalUrl });
      middleware(req, res, jest.fn());
      res.emit('finish');
    }

    expect(written.map((line) => JSON.parse(line).path)).toEqual([
      '/api/pages',
    ]);
  });

  it('writes once for a response that finishes', () => {
    const written: string[] = [];
    const middleware = accessLog({
      format: 'json',
      write: (line) => written.push(line),
    });
    const { req, res } = exchange({});
    middleware(req, res, jest.fn());

    res.emit('finish');
    res.emit('finish');

    expect(written).toHaveLength(1);
  });
});

describe('the lines', () => {
  const entry: AccessEntry = {
    method: 'GET',
    path: '/api/health',
    status: 200,
    durationMs: 1.2,
  };

  it('are a summary in text, with the request id when there is one', () => {
    expect(accessSummary(entry)).toBe('GET /api/health 200 1.2ms');
    expect(accessSummary({ ...entry, requestId: 'abc' })).toBe(
      'GET /api/health 200 1.2ms [abc]',
    );
  });

  it('are, in json, the summary as `message` beside the fields', () => {
    expect(
      JSON.parse(accessJson(entry, { pid: 7, now: () => 1791881127287 })),
    ).toEqual({
      level: 'log',
      pid: 7,
      timestamp: 1791881127287,
      context: 'Access',
      message: 'GET /api/health 200 1.2ms',
      method: 'GET',
      path: '/api/health',
      status: 200,
      durationMs: 1.2,
    });
  });
});
