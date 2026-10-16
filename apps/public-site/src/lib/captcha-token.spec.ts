import { describe, expect, it } from 'vitest';
import { CAPTCHA_FIELD, captchaTokenOf } from './captcha-token';

const formWith = (fields: Record<string, string | File>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
};

describe('captchaTokenOf', () => {
  it("reads the widget's solution", () => {
    expect(captchaTokenOf(formWith({ [CAPTCHA_FIELD]: 'from-kometio' }))).toBe(
      'from-kometio',
    );
  });

  it('is empty when the form has none: the widget never ran, or the form asks for none', () => {
    expect(captchaTokenOf(formWith({ email: 'a@example.test' }))).toBe('');
  });

  it('does not read the field a captcha from an outside company used to fill', () => {
    expect(
      captchaTokenOf(formWith({ 'cf-turnstile-response': 'from-cloudflare' })),
    ).toBe('');
  });

  it('does not take a file for a solution', () => {
    expect(
      captchaTokenOf(formWith({ [CAPTCHA_FIELD]: new File(['x'], 'x.txt') })),
    ).toBe('');
  });
});
