import type { NextFunction } from 'express';
import { requestIdMiddleware } from './request-id.middleware';

function run(headers: Record<string, string | string[] | undefined>) {
  // What the middleware reads of the request, and what it adds to it.
  const req: { headers: typeof headers; requestId?: string } = { headers };
  const setHeader = jest.fn();
  const res = { setHeader };
  const next: NextFunction = jest.fn();

  requestIdMiddleware(req, res, next);

  return { req, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('makes an id when none arrived, and puts it on the request and the response', () => {
    const { req, setHeader, next } = run({});

    const id = req.requestId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps the id a proxy in front already gave the request', () => {
    const { req, setHeader } = run({ 'x-request-id': 'from-the-proxy' });

    expect(req.requestId).toBe('from-the-proxy');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'from-the-proxy');
  });

  it.each([['   '], [['one', 'two']]])(
    'makes its own when what arrived is not a usable id (%j)',
    (incoming) => {
      const { req } = run({ 'x-request-id': incoming });

      expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
