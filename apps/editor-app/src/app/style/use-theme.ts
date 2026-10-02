import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  getInitialTheme,
  watchSystemTheme,
  type Theme,
} from '../../theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  // Following the system means following it while the app is open, not only
  // at the moment it loaded — a machine that switches at sunset would
  // otherwise leave the editor in yesterday's theme until a reload.
  useEffect(() => {
    if (theme !== 'system') {
      return;
    }
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  return { theme, setTheme };
}
