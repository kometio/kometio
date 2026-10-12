import { describe, expect, it } from 'vitest';
import type { ThemeSettings, ThemeTokens } from '@kometio/shared-types';
import { resolvePageThemeStyles } from './page-theme-styles';

/*
 * The two gates (docs/adr/0021, 0022): the theme author's ceiling and the
 * site's own switch. They were fused into one `&&` once and the result was
 * upside down; nothing tested them while they were part of a template.
 */

const SETTINGS: ThemeSettings = {
  primaryColor: '#123456',
  secondaryColor: '#abcdef',
  fontFamily: 'inter',
  customCss: 'body{margin:0}',
  contentWidth: '72rem',
  headScript: null,
  bodyScript: null,
  faviconUrl: 'https://cdn.example.test/fav.png',
  overridesEnabled: true,
  allowedTrackerDomains: [],
  trackerScripts: [],
};

const TOKENS: ThemeTokens = {
  blockStyles: {
    Hero: { default: { base: { backgroundColor: '#ff0000' } } },
  },
};

const resolve = (
  overrides: Partial<Parameters<typeof resolvePageThemeStyles>[0]> = {},
) =>
  resolvePageThemeStyles({
    themeSettings: SETTINGS,
    themeTokens: TOKENS,
    allowStyleOverrides: undefined,
    themeBaseTokens: new Map([['--radius', '0.5rem']]),
    instanceStyleCss: '.kometio-instance-a { --kometio-override-gap: 1rem; }',
    ...overrides,
  });

describe('resolvePageThemeStyles', () => {
  it('lets a site repaint a theme by default: Tier 1, the type styles and the instance styles', () => {
    const styles = resolve();

    expect(styles.theme.primaryColor).toBe('#123456');
    expect(styles.themeOverrideDeclarations).toBe(
      "--primary: #123456 !important; --secondary: #abcdef !important; --font-sans-value: 'Inter', ui-sans-serif, system-ui, sans-serif !important; --kometio-content-width: 72rem !important;",
    );
    expect(styles.blockStyleCss).toBe(
      [
        '@layer kometio.class, kometio.instance;',
        '@layer kometio.class {\n.kometio-hero { --kometio-override-bg: #ff0000; }\n}',
        '.kometio-instance-a { --kometio-override-gap: 1rem; }',
      ].join('\n'),
    );
  });

  it("writes the theme's own tokens with !important, as an inline style cannot rely on source order", () => {
    expect(resolve().themeBaseTokenDeclarations).toBe(
      '--radius: 0.5rem !important;',
    );
  });

  describe("the site's own switch (overridesEnabled: false)", () => {
    const styles = resolve({
      themeSettings: { ...SETTINGS, overridesEnabled: false },
    });

    it('clears Tier 1 — colours, font, width, custom CSS, favicon', () => {
      expect(styles.theme).toEqual({
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        customCss: null,
        contentWidth: null,
        faviconUrl: null,
        overridesEnabled: false,
      });
      expect(styles.themeOverrideDeclarations).toBe('');
      expect(styles.themeFont).toBeNull();
    });

    it('does NOT clear the block styles: the switch is not theirs', () => {
      expect(styles.blockStyleCss).toContain('.kometio-hero');
      expect(styles.blockStyleCss).toContain('.kometio-instance-a');
    });
  });

  describe("the theme's own ceiling (allowStyleOverrides: false)", () => {
    const styles = resolve({ allowStyleOverrides: false });

    it('clears Tier 1 whatever the site says', () => {
      expect(styles.themeOverrideDeclarations).toBe('');
      expect(styles.theme.primaryColor).toBeNull();
    });

    it('clears the type styles and the instance styles too: a ceiling honoured by two tiers of three is not one', () => {
      expect(styles.blockStyleCss).toBe('');
    });

    it('still writes the theme own tokens', () => {
      expect(styles.themeBaseTokenDeclarations).not.toBe('');
    });
  });

  it('emits nothing for a page that customises nothing', () => {
    const styles = resolve({
      themeSettings: {
        ...SETTINGS,
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        contentWidth: null,
      },
      themeTokens: { blockStyles: {} },
      themeBaseTokens: new Map(),
      instanceStyleCss: '',
    });

    expect(styles.themeOverrideDeclarations).toBe('');
    expect(styles.themeBaseTokenDeclarations).toBe('');
    expect(styles.blockStyleCss).toBe('');
  });

  it('drops a content width that could close the declaration, rather than writing it', () => {
    const styles = resolve({
      themeSettings: {
        ...SETTINGS,
        primaryColor: null,
        secondaryColor: null,
        fontFamily: null,
        contentWidth: '72rem; } body { background: red',
      },
    });

    expect(styles.themeOverrideDeclarations).toBe('');
  });
});
