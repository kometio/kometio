import { createContext, useContext } from 'react';

/**
 * Same inversion as PageListContext/MediaPickerContext: blocks that
 * offer an icon field (docs/adr/0023) need a way to let the editor pick
 * an icon from the active theme, but this package only defines block
 * descriptors and has no HTTP client or application-level UI. The real
 * dialog (which calls `GET /api/themes/current/icons` on
 * apps/public-site) is owned by apps/editor-app and provided through
 * this context.
 *
 * Unlike PageListPort/MediaPickerPort, the value saved on the block is
 * a plain string name (not a denormalized object already carrying the
 * preview) — `resolve()` gives the field the SVG markup to show the
 * already-chosen icon without having to reopen the dialog.
 */
export interface IconListPort {
  pick(): Promise<string | null>;
  resolve(name: string): string | null;
  /** Whether the active theme lacks this icon, so the site draws nothing for it (ADR-0090). */
  isMissingFromTheme(name: string): boolean;
}

export const IconListContext = createContext<IconListPort | null>(null);

export function useIconList(): IconListPort {
  const port = useContext(IconListContext);
  if (!port) {
    throw new Error(
      'useIconList() called outside an IconListContext.Provider — wrap the canvas with the icon list provider (apps/editor-app) before rendering blocks with an icon field.',
    );
  }
  return port;
}
