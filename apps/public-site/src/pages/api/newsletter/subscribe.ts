import type { APIRoute } from 'astro';
import { subscribeNewsletter } from '../../../lib/public-api-client';
import { backToPage } from '../../../lib/back-to-page';
import { captchaTokenOf } from '../../../lib/captcha-token';

// Same-origin proxy (docs/adr/0015's pattern, applied here for
// NewsletterSignup's own decoupled path) — the browser only ever POSTs to
// this app's own origin, never directly to the API.
export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '');
  const honeypot = String(formData.get('_honeypot') ?? '');
  const captchaToken = captchaTokenOf(formData);
  const redirectTo = String(formData.get('_redirectTo') ?? '/');

  const result = await subscribeNewsletter({ email, honeypot, captchaToken });

  // 303: turns the POST into a GET on redirect, same reasoning as
  // forms/[id]/submit.ts's own proxy.
  return redirect(
    backToPage(redirectTo, request.url, {
      name: result.ok ? 'newsletterSubscribed' : 'newsletterError',
      value: '1',
    }),
    303,
  );
};
