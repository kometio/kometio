import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBlockStyleDefaults,
  fetchThemeForegroundTokens,
  fetchThemeIcons,
} from './theme-api-client';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('theme-api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchThemeIcons fetches and parses the icon manifest', async () => {
    const icons = [{ name: 'star', svg: '<svg></svg>' }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(icons));

    const result = await fetchThemeIcons('docs-showcase');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/themes/current/icons?theme=docs-showcase'),
    );
    expect(result).toEqual(icons);
  });

  it('fetchThemeIcons throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 500));

    await expect(fetchThemeIcons('classic')).rejects.toThrow(
      /themes\/current\/icons API error: 500/,
    );
  });

  it('fetchBlockStyleDefaults fetches and parses the defaults map', async () => {
    const defaults = { Button: { backgroundColor: 'var(--primary)' } };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(defaults));

    const result = await fetchBlockStyleDefaults('classic');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/themes/current/block-style-defaults'),
    );
    expect(result).toEqual(defaults);
  });

  it('fetchBlockStyleDefaults throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 404));

    await expect(fetchBlockStyleDefaults('classic')).rejects.toThrow(
      /themes\/current\/block-style-defaults API error: 404/,
    );
  });

  it('fetchThemeForegroundTokens fetches and parses the two root tokens', async () => {
    const tokens = {
      primaryForeground: 'oklch(0.985 0 0)',
      secondaryForeground: 'oklch(0.205 0 0)',
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(tokens));

    const result = await fetchThemeForegroundTokens('classic');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/themes/current/foreground-tokens'),
    );
    expect(result).toEqual(tokens);
  });

  it('fetchThemeForegroundTokens throws on a non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 500));

    await expect(fetchThemeForegroundTokens('classic')).rejects.toThrow(
      /themes\/current\/foreground-tokens API error: 500/,
    );
  });
});
