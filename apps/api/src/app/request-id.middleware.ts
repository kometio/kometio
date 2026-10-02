import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * One id per request, carried into the logs (`HttpExceptionFilter`) and
 * back out on the response (the `X-Request-Id` header) — security review
 * 2026-08-24, point 14: without it, matching an error a customer reports
 * to the right log line, possibly among thousands of others, is
 * impossible after the fact. It reuses an `X-Request-Id` that arrived with
 * the request (a proxy or load balancer in front of this service),
 * generating a new one otherwise.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.trim() !== ''
      ? incoming
      : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
