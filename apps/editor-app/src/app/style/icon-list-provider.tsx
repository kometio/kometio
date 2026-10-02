import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  mediaIconSvg,
  mediaIconValue,
  parseMediaIcon,
} from '@kometio/shared-types';
import { IconListContext, type IconListPort } from './icon-list-context';
import { isIconMissingFromTheme } from './missing-theme-icons';
import { useMediaPicker } from '../media/media-picker-context';
import { themeIconsQueryOptions } from './theme-icons-queries';
import { useActiveThemeName } from './use-active-theme-name';
import { IconPickerDialog } from './icon-picker-dialog';

export interface IconListProviderProps {
  children: ReactNode;
}

/**
 * The concrete implementation of @kometio/block-registry's IconListPort —
 * same Promise-based `pick()` pattern as PageListProvider/
 * MediaPickerProvider, plus a synchronous `resolve()` backed by the same
 * cached query (staleTime: Infinity, see theme-icons-queries.ts) so
 * IconPickerField can preview an already-picked icon without a second
 * round trip.
 */
export function IconListProvider({ children }: IconListProviderProps) {
  const { data } = useQuery(themeIconsQueryOptions(useActiveThemeName()));
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const pick = useCallback((): Promise<string | null> => {
    setOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const mediaPicker = useMediaPicker();

  // By name, once per set: the field previews through it and every block
  // on the page is checked against it (ADR-0090).
  const svgByName = useMemo(
    () =>
      data ? new Map(data.map((icon) => [icon.name, icon.svg])) : undefined,
    [data],
  );

  const resolve = useCallback(
    (name: string): string | null => {
      const mediaIcon = parseMediaIcon(name);
      if (mediaIcon) return mediaIconSvg(mediaIcon.url);
      return svgByName?.get(name) ?? null;
    },
    [svgByName],
  );

  const isMissingFromTheme = useCallback(
    (name: string): boolean => isIconMissingFromTheme(name, svgByName),
    [svgByName],
  );

  function resolveAndClose(value: string | null) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  }

  /*
   * The icon dialog steps aside for the media library rather than stacking
   * two dialogs: the promise `pick()` handed out stays pending across the
   * swap, and settles with the image — or with nothing, if the library is
   * closed without choosing.
   */
  async function pickImage() {
    const pending = resolveRef.current;
    resolveRef.current = null;
    setOpen(false);
    const picked = await mediaPicker.pick({ kind: 'image' });
    pending?.(picked ? mediaIconValue(picked) : null);
  }

  const port = useMemo<IconListPort>(
    () => ({ pick, resolve, isMissingFromTheme }),
    [pick, resolve, isMissingFromTheme],
  );

  return (
    <IconListContext.Provider value={port}>
      {children}
      <IconPickerDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) resolveAndClose(null);
        }}
        onSelect={(value) => resolveAndClose(value)}
        onPickImage={() => void pickImage()}
      />
    </IconListContext.Provider>
  );
}
