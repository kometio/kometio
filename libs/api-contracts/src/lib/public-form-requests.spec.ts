import { describe, expect, it } from 'vitest';
import { submitFormBodySchema } from './public-form-requests';

describe('submitFormBodySchema', () => {
  it('takes the values of a form, and makes the page, the honeypot and the captcha token what a visitor who sent none means', () => {
    expect(submitFormBodySchema.parse({ values: { name: 'Ada' } })).toEqual({
      pageId: null,
      values: { name: 'Ada' },
      honeypot: '',
      captchaToken: '',
    });
  });

  it('refuses a page that is not an id, and a body with no values', () => {
    expect(
      submitFormBodySchema.safeParse({ pageId: 'x', values: {} }).success,
    ).toBe(false);
    expect(submitFormBodySchema.safeParse({}).success).toBe(false);
  });
});
