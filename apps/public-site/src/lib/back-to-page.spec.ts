import { describe, expect, it } from 'vitest';
import { backToPage } from './back-to-page';

const requestUrl = 'https://sito.esempio.it/api/forms/f1/submit';
const flag = { name: 'formSubmitted', value: 'f1' };

describe('backToPage', () => {
  it('goes back to the page the form was on, with the result flag', () => {
    expect(backToPage('/it/contatti?ref=home', requestUrl, flag)).toBe(
      '/it/contatti?ref=home&formSubmitted=f1',
    );
  });

  it.each([
    '/.//evil.example',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/it/contatti',
    'javascript:alert(1)',
  ])('never leaves the site for %j', (redirectTo) => {
    const location = backToPage(redirectTo, requestUrl, flag);

    expect(location).toBe('/?formSubmitted=f1');
    expect(new URL(location, requestUrl).host).toBe('sito.esempio.it');
  });
});
