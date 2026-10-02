import { describe, expect, it } from 'vitest';
import { ctaButtonHtml, renderEmailLayout } from './email-layout';

describe('ctaButtonHtml', () => {
  it('renders a link with the given URL and label', () => {
    const html = ctaButtonHtml('https://example.com/x', 'Click me');

    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('Click me');
  });
});

describe('renderEmailLayout', () => {
  it('wraps the body content and includes the Kometio heading', () => {
    const html = renderEmailLayout('it', '<p>Body content here</p>');

    expect(html).toContain('Kometio');
    expect(html).toContain('Body content here');
  });

  it.each([
    ['it', 'Se non hai richiesto questa email, ignorala.'],
    ['en', 'If you did not request this email, ignore it.'],
  ] as const)(
    'says so in its own footer, and in the language of the message: %s',
    (language, footer) => {
      const html = renderEmailLayout(language, '<p>x</p>');

      // The language is declared, so a screen reader pronounces it right.
      expect(html).toContain(`lang="${language}"`);
      expect(html).toContain(footer);
    },
  );
});
