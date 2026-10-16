/**
 * The name of the field the captcha widget puts its solution in, inside the
 * form's own POST body (docs/adr/0103, 0145): an underscore, so that no field
 * of a form is ever called that and the submit proxy, which skips the
 * underscored ones, never reads it as an answer. The widget is told to use it
 * (block-behaviors/altcha.ts).
 */
export const CAPTCHA_FIELD = '_captcha';

/**
 * The solution the visitor's widget sent. Empty when there is none, which the
 * server refuses like any other missing solution (or accepts, for a form that
 * has asked for no captcha).
 */
export function captchaTokenOf(formData: FormData): string {
  const value = formData.get(CAPTCHA_FIELD);
  return typeof value === 'string' ? value : '';
}
