import type { APIRoute } from 'astro';
import { fetchCaptchaChallenge } from '../../../lib/public-api-client';

// Same-origin proxy (docs/adr/0015's pattern): the widget of the captcha built
// into Kometio (docs/adr/0103) asks the site it is on for its challenge, as the
// form it belongs to posts to the same site, and never talks to the API itself.
// Dynamic: a challenge is made for one visitor, once.
export const prerender = false;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export const GET: APIRoute = async () => {
  const result = await fetchCaptchaChallenge();
  if (result.ok) {
    return Response.json(result.challenge, { headers: NO_STORE });
  }
  // The API's own answer where it means something to the widget: 404 (there is
  // no challenge on this deployment) and 429 (this visitor has asked too often).
  // Anything else is this site failing to get one.
  const status =
    result.status === 404 || result.status === 429 ? result.status : 502;
  return new Response(null, { status, headers: NO_STORE });
};
