import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MediaPickerContext,
  type MediaPickOptions,
  type MediaPickerPort,
} from './media-picker-context';
import type { MediaKind, PickedMedia } from '@kometio/shared-types';
import { MediaPickerDialog } from './media-picker-dialog';

export interface MediaPickerProviderProps {
  siteId: string;
  children: ReactNode;
}

/**
 * The concrete implementation of @kometio/block-registry's MediaPickerPort
 * (see media-picker-context.tsx there for why the block config itself
 * can't own this): a Promise-based `pick()` that opens this dialog and
 * resolves once the user selects an image or dismisses it.
 */
export function MediaPickerProvider({
  siteId,
  children,
}: MediaPickerProviderProps) {
  const [open, setOpen] = useState(false);
  const [lockedKind, setLockedKind] = useState<MediaKind | undefined>();
  const resolveRef = useRef<((value: PickedMedia | null) => void) | null>(null);

  const pick = useCallback(
    (options?: MediaPickOptions): Promise<PickedMedia | null> => {
      setLockedKind(options?.kind);
      setOpen(true);
      return new Promise((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [],
  );

  function resolveAndClose(value: PickedMedia | null) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOpen(false);
  }

  const port = useMemo<MediaPickerPort>(() => ({ pick }), [pick]);

  return (
    <MediaPickerContext.Provider value={port}>
      {children}
      <MediaPickerDialog
        siteId={siteId}
        open={open}
        lockedKind={lockedKind}
        onOpenChange={(next) => {
          if (!next) resolveAndClose(null);
        }}
        onSelect={(media) =>
          resolveAndClose({
            mediaId: media.id,
            url: media.url,
            width: media.width,
            height: media.height,
            // What a download link shows about the file. Harmless on an
            // image field, which never reads them.
            filename: media.filename,
            mimeType: media.mimeType,
            size: media.size,
            // What the library says the picture shows, for an Image that
            // has no text of its own to say it with.
            alt: media.alt,
          })
        }
      />
    </MediaPickerContext.Provider>
  );
}
