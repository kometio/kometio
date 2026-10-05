import type { APIRoute } from 'astro';
import {
  submitPublicForm,
  uploadFormAttachment,
} from '../../../../lib/public-api-client';
import { backToPage } from '../../../../lib/back-to-page';
import {
  CAPTCHA_FIELD_TURNSTILE,
  captchaTokenOf,
} from '../../../../lib/captcha-token';

// Same-origin proxy (docs/adr/0015): the browser only ever POSTs to this
// app's own origin, never directly to the API — avoids touching ADR-0010's
// session-cookie-driven CORS config for an unauthenticated, uncredentialed
// write path that has nothing to do with editor-app's origin. Dynamic (not
// known at build time), same reasoning as [slug].astro.
export const prerender = false;

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const formId = params.id;
  if (!formId) {
    return new Response('Not found', { status: 404 });
  }

  const formData = await request.formData();
  const honeypot = String(formData.get('_honeypot') ?? '');
  // The widget puts the solution in the form's own POST body itself once the
  // visitor has completed the check: Turnstile's script as a hidden input
  // named `cf-turnstile-response`, the built-in widget as one named `_captcha`
  // (block-behaviors/altcha.ts). A page has one or the other.
  const captchaToken = captchaTokenOf(formData);
  const redirectTo = String(formData.get('_redirectTo') ?? '/');
  // Which page rendered this form (Form.astro's hidden input). Passed on
  // as-is: the API is the one that decides whether to believe it, since
  // this proxy has no way to tell a real id from an invented one either.
  const pageId = String(formData.get('_pageId') ?? '') || null;
  // Native unchecked checkboxes never submit a key at all — the hint tells
  // this proxy which field ids to treat as booleans (present === true,
  // absent === false) instead of leaving them out of `values` entirely,
  // without re-fetching the form's field definitions a third time.
  const checkboxFieldIds = String(formData.get('_checkboxFields') ?? '')
    .split(',')
    .filter(Boolean);

  const values: Record<string, unknown> = {};
  // Honeypot check first, before touching any file field: an obvious bot
  // must never trigger an attachment upload, same "checked before the
  // expensive/network step" reasoning submitForm's own use-case already
  // applies to the CAPTCHA verify call.
  if (honeypot.trim() === '') {
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('_') || key === CAPTCHA_FIELD_TURNSTILE) continue;
      if (value instanceof File) {
        // A real <input type="file"> with nothing selected submits its
        // field as an empty string, not a File (WHATWG spec) — so this
        // branch only runs for an actual selection. The size>0 guard is
        // defensive for the rare runtime that might still hand back an
        // empty-name File instead; either way "no value" falls straight
        // through to submitForm's own isBlank() check, no special-casing
        // needed here.
        if (value.size > 0) {
          values[key] = await uploadFormAttachment(formId, value);
        }
        continue;
      }
      values[key] = checkboxFieldIds.includes(key) ? value === 'on' : value;
    }
    for (const id of checkboxFieldIds) {
      if (!(id in values)) values[id] = false;
    }
  }

  const result = await submitPublicForm(formId, {
    pageId,
    values,
    honeypot,
    captchaToken,
  });

  // 303: turns the POST into a GET on redirect, so refreshing the result
  // page never resubmits the form.
  return redirect(
    backToPage(redirectTo, request.url, {
      name: result.ok ? 'formSubmitted' : 'formError',
      value: formId,
    }),
    303,
  );
};
