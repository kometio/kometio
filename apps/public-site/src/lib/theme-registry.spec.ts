import { describe, expect, it } from 'vitest';
import {
  applyThemeAllowList,
  BUNDLED_THEME_NAMES,
  getThemeCssRaw,
  getThemeManifest,
  groupByTheme,
  partitionByTheme,
  resolveBundledThemeName,
  themeNameFromGlobPath,
} from './theme-registry';

// Real fixtures on disk (themes/classic, themes/docs-showcase), not
// synthetic temp directories — import.meta.glob resolves at build time
// against the actual repo tree, so faking a theme directory for this file
// would test nothing real. See themes/classic/theme.css and
// themes/docs-showcase/theme.css for the exact values asserted below.

describe('BUNDLED_THEME_NAMES', () => {
  it('lists every theme actually on disk, sorted', () => {
    expect(BUNDLED_THEME_NAMES).toEqual(['classic', 'docs-showcase']);
  });
});

describe('applyThemeAllowList', () => {
  const onDisk = ['classic', 'docs-showcase'];

  it('serves every bundled theme when KOMETIO_THEME is unset', () => {
    expect(applyThemeAllowList(onDisk, undefined)).toEqual(onDisk);
  });

  it('serves every bundled theme for an empty KOMETIO_THEME', () => {
    expect(applyThemeAllowList(onDisk, '')).toEqual(onDisk);
  });

  it('narrows to the named subset', () => {
    expect(applyThemeAllowList(onDisk, 'docs-showcase')).toEqual([
      'docs-showcase',
    ]);
  });

  it('accepts a comma-separated list, trimming whitespace', () => {
    expect(applyThemeAllowList(onDisk, ' classic , docs-showcase ')).toEqual([
      'classic',
      'docs-showcase',
    ]);
  });

  it('ignores a name that is not actually bundled', () => {
    expect(applyThemeAllowList(onDisk, 'classic,not-bundled')).toEqual([
      'classic',
    ]);
  });

  it('degrades to every bundled theme when the allow-list matches nothing (a typo must not take the site down)', () => {
    expect(applyThemeAllowList(onDisk, 'typo-only')).toEqual(onDisk);
  });
});

describe('resolveBundledThemeName', () => {
  it('returns a bundled name unchanged', () => {
    expect(resolveBundledThemeName('docs-showcase')).toBe('docs-showcase');
  });

  it('falls back to classic for an unknown theme name', () => {
    expect(resolveBundledThemeName('not-a-real-theme')).toBe('classic');
  });

  it('falls back to classic for an empty string', () => {
    expect(resolveBundledThemeName('')).toBe('classic');
  });
});

describe('getThemeManifest', () => {
  it("reads classic's own theme.json", () => {
    expect(getThemeManifest('classic')).toEqual({ allowStyleOverrides: true });
  });

  it('falls back through resolveBundledThemeName for an unknown theme', () => {
    expect(getThemeManifest('not-a-real-theme')).toEqual({
      allowStyleOverrides: true,
    });
  });
});

describe('getThemeCssRaw', () => {
  it("returns classic's real theme.css text", () => {
    const css = getThemeCssRaw('classic');
    expect(css).toContain(':root');
    expect(css).toContain('--primary: oklch(0.42 0.08 160);');
  });

  it("returns docs-showcase's own, different theme.css text", () => {
    const css = getThemeCssRaw('docs-showcase');
    expect(css).toContain('--primary: oklch(0.5 0.12 250);');
    expect(css).not.toContain('--primary: oklch(0.42 0.08 160);');
  });
});

describe('themeNameFromGlobPath', () => {
  it('extracts the theme name at any nesting depth', () => {
    expect(themeNameFromGlobPath('../../../../themes/classic/theme.json')).toBe(
      'classic',
    );
    expect(
      themeNameFromGlobPath(
        '../../../../themes/docs-showcase/blocks/Hero.astro',
      ),
    ).toBe('docs-showcase');
  });

  it('returns null for a path with no themes/ segment', () => {
    expect(
      themeNameFromGlobPath('../../../../not-themes/classic/x.json'),
    ).toBeNull();
  });
});

describe('partitionByTheme', () => {
  it('groups a flat glob record into one sub-record per theme', () => {
    const modules = {
      '../../../../themes/classic/blocks/Button.astro': { default: 'a' },
      '../../../../themes/classic/blocks/Hero.astro': { default: 'b' },
      '../../../../themes/docs-showcase/blocks/Hero.astro': { default: 'c' },
    };

    const result = partitionByTheme(modules);

    expect([...result.keys()].sort()).toEqual(['classic', 'docs-showcase']);
    expect(Object.keys(result.get('classic') ?? {})).toHaveLength(2);
    expect(Object.keys(result.get('docs-showcase') ?? {})).toHaveLength(1);
  });

  it('ignores a path with no themes/ segment', () => {
    const result = partitionByTheme({ '../../../../other/x.ts': { a: 1 } });
    expect(result.size).toBe(0);
  });

  it('returns an empty map for an empty input', () => {
    expect(partitionByTheme({}).size).toBe(0);
  });
});

describe('groupByTheme', () => {
  it('groups and keys entries per theme via the given functions', () => {
    const modules = {
      '../../../../themes/classic/icons/star.svg': '<svg>star</svg>',
      '../../../../themes/classic/icons/heart.svg': '<svg>heart</svg>',
      '../../../../themes/docs-showcase/icons/star.svg': '<svg>ds-star</svg>',
    };

    const result = groupByTheme(
      modules,
      (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, ''),
      (svg) => svg,
    );

    expect(result.get('classic')?.get('star')).toBe('<svg>star</svg>');
    expect(result.get('classic')?.get('heart')).toBe('<svg>heart</svg>');
    expect(result.get('docs-showcase')?.get('star')).toBe('<svg>ds-star</svg>');
  });

  it('returns an empty map for an empty input', () => {
    expect(
      groupByTheme(
        {},
        () => '',
        () => null,
      ).size,
    ).toBe(0);
  });
});
