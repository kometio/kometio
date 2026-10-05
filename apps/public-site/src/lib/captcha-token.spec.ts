import { describe, expect, it } from 'vitest';
import {
  CAPTCHA_FIELD_BUILT_IN,
  CAPTCHA_FIELD_TURNSTILE,
  captchaTokenOf,
} from './captcha-token';

const formWith = (fields: Record<string, string | File>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
};

describe('captchaTokenOf', () => {
  it("reads Turnstile's solution", () => {
    expect(
      captchaTokenOf(
        formWith({ [CAPTCHA_FIELD_TURNSTILE]: 'from-cloudflare' }),
      ),
    ).toBe('from-cloudflare');
  });

  it("reads the built-in widget's solution", () => {
    expect(
      captchaTokenOf(formWith({ [CAPTCHA_FIELD_BUILT_IN]: 'from-kometio' })),
    ).toBe('from-kometio');
  });

  it('is empty when the form has none: the widget never ran, or the page had none', () => {
    expect(captchaTokenOf(formWith({ email: 'a@example.test' }))).toBe('');
  });

  it('takes an empty field for none, and the other one when it is there', () => {
    expect(
      captchaTokenOf(
        formWith({
          [CAPTCHA_FIELD_TURNSTILE]: '',
          [CAPTCHA_FIELD_BUILT_IN]: 'from-kometio',
        }),
      ),
    ).toBe('from-kometio');
  });

  it('does not take a file for a solution', () => {
    expect(
      captchaTokenOf(
        formWith({ [CAPTCHA_FIELD_BUILT_IN]: new File(['x'], 'x.txt') }),
      ),
    ).toBe('');
  });
});
