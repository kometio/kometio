import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** How the API writes its log: what a person reads, or one JSON object a line (docs/adr/0122). */
export type LogFormat = 'text' | 'json';

/** What is known of a request once its response has gone. */
export interface AccessEntry {
  method: string;
  /** The path as asked, without its query: a preview link carries its token there. */
  path: string;
  /** The route's own pattern (`/api/pages/:id`), which is what a count by route needs. */
  route?: string;
  status: number;
  durationMs: number;
  /** The `Content-Length` of the response, when it had one. */
  bytes?: number;
  requestId?: string;
  /** Who was signed in, when the request got far enough to know. */
  userId?: string;
}

/** The entry as one line of text, the way the failed requests are written by the exception filter. */
export function accessSummary(entry: AccessEntry): string {
  const id = entry.requestId ? ` [${entry.requestId}]` : '';
  return `${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms${id}`;
}

/**
 * The entry as one JSON object, flat, with the names the API's own JSON logger
 * uses (`level`, `pid`, `timestamp`, `context`, `message`) so that one filter
 * reads both. The fields are what a count or a search by request is made of.
 */
export function accessJson(
  entry: AccessEntry,
  { pid = process.pid, now = Date.now } = {},
): string {
  return JSON.stringify({
    level: 'log',
    pid,
    timestamp: now(),
    context: 'Access',
    message: accessSummary(entry),
    ...entry,
  });
}

interface AccessLogOptions {
  format: LogFormat;
  /** Where a JSON line goes. Text goes through the API's logger, like the rest. */
  write?: (line: string) => void;
  /** Text lines. */
  logger?: Pick<Logger, 'log'>;
  /** Paths that are not worth a line: the health check that Docker asks every ten seconds. */
  skip?: (path: string) => boolean;
}

/** Reads a string property off something that has it only once an earlier middleware or guard has run. */
function stringProperty(source: object, key: string): string | undefined {
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * One line for each request, when its response has been sent: method, path
 * (never the query), status, how long, the request id the response carries, and
 * who was signed in. Not the address, the browser or anything the request
 * brought: the proxy in front has those, and a log of them is a thing to decide
 * about on its own.
 *
 * It goes first, so that a request refused by a later middleware is in it too.
 */
export function accessLog({
  format,
  write = (line) => void process.stdout.write(`${line}\n`),
  logger = new Logger('Access'),
  skip = () => false,
}: AccessLogOptions) {
  return (
    // `route` is there only once a route has matched: a request refused earlier has none.
    req: Pick<Request, 'method' | 'originalUrl'> &
      Partial<Pick<Request, 'route'>>,
    res: Pick<Response, 'getHeader' | 'statusCode'> & {
      once(event: 'finish', listener: () => void): unknown;
    },
    next: NextFunction,
  ): void => {
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      const route: unknown = req.route?.path;
      const length = Number(res.getHeader('content-length'));
      const requestId = stringProperty(req, 'requestId');
      const userId = stringProperty(req, 'userId');
      const path = req.originalUrl.replace(/\?.*$/s, '');
      if (skip(path)) return;
      const entry: AccessEntry = {
        method: req.method,
        path,
        ...(typeof route === 'string' ? { route } : {}),
        status: res.statusCode,
        durationMs:
          Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        ...(Number.isFinite(length) ? { bytes: length } : {}),
        ...(requestId ? { requestId } : {}),
        ...(userId ? { userId } : {}),
      };
      if (format === 'json') write(accessJson(entry));
      else logger.log(accessSummary(entry));
    });
    next();
  };
}
