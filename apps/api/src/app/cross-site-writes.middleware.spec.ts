import type { NextFunction, Request, Response } from 'express';
import { rejectCrossSiteWrites } from './cross-site-writes.middleware';

const editorOrigin = 'https://editor.esempio.it';

function run(request: {
  method: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  const next: NextFunction = jest.fn();
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  // Express's Request and Response have far more than the three members
  // read here; a minimal double stands in through `unknown`.
  rejectCrossSiteWrites(editorOrigin)(
    {
      headers: {},
      cookies: { kometio_session: 'token' },
      ...request,
    } as unknown as Request,
    { status } as unknown as Response,
    next,
  );
  return { passed: jest.mocked(next).mock.calls.length === 1, status };
}

describe('rejectCrossSiteWrites', () => {
  it('lets the editor write', () => {
    expect(
      run({ method: 'POST', headers: { origin: editorOrigin } }).passed,
    ).toBe(true);
  });

  it.each([
    ['the public site', { origin: 'https://esempio.it' }],
    ['a sibling subdomain', { origin: 'https://blog.esempio.it' }],
    ['a sandboxed frame', { origin: 'null' }],
    ['a same-site page that sent no Origin', { 'sec-fetch-site': 'same-site' }],
  ])('refuses a signed-in write from %s', (_from, headers) => {
    const { passed, status } = run({ method: 'POST', headers });

    expect(passed).toBe(false);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('lets reads through from anywhere', () => {
    expect(
      run({ method: 'GET', headers: { origin: 'https://esempio.it' } }).passed,
    ).toBe(true);
  });

  it('lets a write with no session through: there is nothing to forge', () => {
    expect(
      run({
        method: 'POST',
        headers: { origin: 'https://esempio.it' },
        cookies: {},
      }).passed,
    ).toBe(true);
  });

  it('lets a client that is not a browser through', () => {
    expect(run({ method: 'DELETE' }).passed).toBe(true);
  });
});
