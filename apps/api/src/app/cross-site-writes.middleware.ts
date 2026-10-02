import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from './auth/session-cookies';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * A request that changes something on a signed-in person's behalf has to
 * come from the editor.
 *
 * The session cookie is `SameSite=Lax`, which keeps it off a POST from
 * another site, but not off one from the same site: the public site, a
 * theme's code, anything on a sibling subdomain. A JSON request from
 * there still needs CORS to let it through, and CORS allows only the
 * editor; a multipart one — an upload, an import, an avatar — is a
 * "simple" request the browser sends without asking first. So the check
 * is made here, for every write, instead of trusting the kind of body.
 *
 * What a browser tells us is enough: it always sends `Origin` with a
 * write, and `Sec-Fetch-Site` besides. A request with neither comes from
 * something that is not a browser, which cannot be tricked into sending
 * someone else's cookie, so it goes through, as does a request carrying
 * no session at all, which has nothing to forge.
 */
export function rejectCrossSiteWrites(editorOrigin: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (
      READ_ONLY_METHODS.has(request.method) ||
      !hasSessionCookie(request) ||
      comesFromEditor(request, editorOrigin)
    ) {
      next();
      return;
    }
    response.status(403).json({
      statusCode: 403,
      message: 'Cross-site request refused',
    });
  };
}

function hasSessionCookie(request: Request): boolean {
  const cookies: unknown = request.cookies;
  return (
    typeof cookies === 'object' &&
    cookies !== null &&
    SESSION_COOKIE_NAME in cookies
  );
}

function comesFromEditor(request: Request, editorOrigin: string): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined) return origin === editorOrigin;
  const fetchSite = request.headers['sec-fetch-site'];
  return fetchSite === undefined || fetchSite === 'same-origin';
}
