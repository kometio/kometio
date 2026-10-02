export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'kometio-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * What the person asked for, which is not always a colour.
 *
 * `system` is the default now, and is why it exists: the app started dark
 * for everybody and read `prefers-color-scheme` nowhere, so somebody whose
 * whole machine is light got a black editor and had to go looking for a
 * toggle to say so. A stored value still wins — choosing a theme means
 * choosing it, not asking to be asked again.
 */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Which of the two `system` currently means. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(
    'dark',
    resolveTheme(theme) === 'dark',
  );
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Calls back when the operating system changes its mind. Only matters
 * while the preference is `system` — the caller decides that, so this stays
 * a plain subscription with nothing to get wrong.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
