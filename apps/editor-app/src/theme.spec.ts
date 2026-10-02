import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getInitialTheme, resolveTheme } from './theme';

/** jsdom has no real media queries — this is the OS saying light or dark. */
function systemPrefersDark(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    systemPrefersDark(true);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
  });

  /*
   * It used to answer 'dark' regardless, and read prefers-color-scheme
   * nowhere: somebody whose whole machine is light got a black editor and
   * had to go find a toggle to say so.
   */
  it('follows the system when nothing is stored yet', () => {
    expect(getInitialTheme()).toBe('system');
  });

  it('resolves "system" to whichever the machine is asking for', () => {
    systemPrefersDark(true);
    expect(resolveTheme('system')).toBe('dark');
    systemPrefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('applyTheme("system") follows the machine and remembers the choice', () => {
    systemPrefersDark(false);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('kometio-theme')).toBe('system');
  });

  it('honors a stored light preference', () => {
    localStorage.setItem('kometio-theme', 'light');
    expect(getInitialTheme()).toBe('light');
  });

  it('honors a stored dark preference', () => {
    localStorage.setItem('kometio-theme', 'dark');
    expect(getInitialTheme()).toBe('dark');
  });

  it('applyTheme toggles the html.dark class and persists the choice', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('kometio-theme')).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('kometio-theme')).toBe('light');
  });
});
