import { describe, expect, it } from 'vitest';
import {
  parseRootCustomProperties,
  resolveBlockStyleDefaults,
  resolveDefaultStyleExpression,
} from './resolve-theme-block-style-defaults-helpers';

describe('parseRootCustomProperties', () => {
  it('extracts every custom property declared inside :root', () => {
    const css = `
      @theme inline {
        --color-primary: var(--primary);
      }
      :root {
        --primary: oklch(0.205 0 0);
        --radius: 0.5rem;
      }
    `;
    const vars = parseRootCustomProperties(css);
    expect(vars.get('--primary')).toBe('oklch(0.205 0 0)');
    expect(vars.get('--radius')).toBe('0.5rem');
  });

  it('does not pick up a declaration from outside :root (e.g. @theme inline)', () => {
    const css = `
      @theme inline {
        --color-primary: var(--primary);
      }
      :root {
        --primary: oklch(0.205 0 0);
      }
    `;
    const vars = parseRootCustomProperties(css);
    expect(vars.get('--color-primary')).toBeUndefined();
  });

  it('returns an empty map when there is no :root block', () => {
    expect(parseRootCustomProperties('').size).toBe(0);
  });
});

describe('resolveDefaultStyleExpression', () => {
  const vars = new Map([
    ['--radius', '0.5rem'],
    ['--primary', 'oklch(0.205 0 0)'],
  ]);

  it('resolves a var(--x) reference against the theme variables', () => {
    expect(resolveDefaultStyleExpression('var(--radius)', vars)).toBe('0.5rem');
  });

  it('passes a literal value through unchanged', () => {
    expect(resolveDefaultStyleExpression('transparent', vars)).toBe(
      'transparent',
    );
    expect(resolveDefaultStyleExpression('1.25rem', vars)).toBe('1.25rem');
  });

  it('falls back to the expression itself when the variable is not declared', () => {
    expect(resolveDefaultStyleExpression('var(--missing)', vars)).toBe(
      'var(--missing)',
    );
  });

  describe('with a fallback, as a block writes it', () => {
    // `core/global.css` declares `--link: var(--primary)`: a theme's own
    // variable can itself be a reference, and the answer is what the page
    // would show, not the name of another variable.
    const chained = new Map([
      ['--primary', 'oklch(0.205 0 0)'],
      ['--link', 'var(--primary)'],
    ]);

    it('takes the first variable that is declared, and follows it through what it refers to', () => {
      expect(
        resolveDefaultStyleExpression('var(--link, var(--primary))', chained),
      ).toBe('oklch(0.205 0 0)');
    });

    it('takes the fallback when the first is not declared', () => {
      expect(
        resolveDefaultStyleExpression('var(--missing, var(--primary))', vars),
      ).toBe('oklch(0.205 0 0)');
      expect(
        resolveDefaultStyleExpression('var(--missing, 0.5rem)', vars),
      ).toBe('0.5rem');
    });

    it('keeps a variable of the theme that refers to another that is not declared as it is', () => {
      expect(
        resolveDefaultStyleExpression(
          'var(--link)',
          new Map([['--link', 'var(--nowhere)']]),
        ),
      ).toBe('var(--link)');
    });

    it('leaves what it cannot resolve as it was written', () => {
      expect(
        resolveDefaultStyleExpression('var(--a, var(--b))', new Map()),
      ).toBe('var(--a, var(--b))');
    });

    it('does not loop on variables that refer to each other', () => {
      const loop = new Map([
        ['--a', 'var(--b)'],
        ['--b', 'var(--a)'],
      ]);

      expect(resolveDefaultStyleExpression('var(--a)', loop)).toBe('var(--a)');
    });
  });
});

describe('resolveBlockStyleDefaults', () => {
  it('resolves every declared property, mixing tokens and literals', () => {
    const vars = new Map([
      ['--primary', 'oklch(0.457 0.24 264)'],
      ['--primary-foreground', 'oklch(0.985 0 0)'],
    ]);
    const resolved = resolveBlockStyleDefaults(
      {
        backgroundColor: 'var(--primary)',
        textColor: 'var(--primary-foreground)',
        borderRadius: 'var(--radius)',
        paddingX: '1.25rem',
        paddingY: '0.5rem',
      },
      vars,
    );
    expect(resolved).toEqual({
      backgroundColor: 'oklch(0.457 0.24 264)',
      textColor: 'oklch(0.985 0 0)',
      borderRadius: 'var(--radius)',
      paddingX: '1.25rem',
      paddingY: '0.5rem',
    });
  });
});
