/**
 * The name of the field each captcha puts its solution in, inside the form's own
 * POST body (docs/adr/0103). Turnstile's script injects a hidden input with the
 * first; the built-in widget is told to name its own with the second
 * (block-behaviors/altcha.ts), an underscore so that no field of a form is ever
 * called that and the submit proxy, which skips the underscored ones, never reads
 * it as an answer.
 */
export const CAPTCHA_FIELD_TURNSTILE = 'cf-turnstile-response';
export const CAPTCHA_FIELD_BUILT_IN = '_captcha';

/**
 * The solution the visitor's widget sent, whichever captcha the page has: a page
 * has one, so at most one of the two is there. Empty when there is none, which
 * the server refuses like any other missing solution.
 */
export function captchaTokenOf(formData: FormData): string {
  for (const name of [CAPTCHA_FIELD_TURNSTILE, CAPTCHA_FIELD_BUILT_IN]) {
    const value = formData.get(name);
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}
