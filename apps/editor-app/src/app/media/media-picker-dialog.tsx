import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import type { MediaKind } from '@kometio/shared-types';
import type { MediaRecord, MediaFilters } from '../../lib/media-api-client';
import { MediaGrid, type MediaGridProps } from './media-grid';
import { mediaQueryOptions } from './media-queries';
import { MediaUploadButton } from './media-upload';
import { useMediaUploads } from './use-media-uploads';

export interface MediaPickerDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (media: MediaRecord) => void;
  /** See MediaPickOptions.kind: the field has decided, so the reader does not. */
  lockedKind?: MediaKind;
}

/** "Choose a video", not "Choose a file", when a video is all that will do. */
const PICKER_TITLE = {
  image: 'media.picker.titleImage',
  video: 'media.picker.titleVideo',
  audio: 'media.picker.titleAudio',
  document: 'media.picker.titleDocument',
  other: 'media.picker.title',
} as const satisfies Record<MediaKind, string>;

type PickerGridProps = Omit<MediaGridProps, 'uploads' | 'actions'> & {
  siteId: string;
};

/**
 * The grid with an upload beside its search, for a field that has no file
 * yet.
 *
 * Its own component so that what uploading needs — the toast, the queue of
 * files — exists only while the picker is open. The dialog is mounted for
 * as long as the page editor is, and none of that belongs to a picker that
 * has not been opened, nor should the lines of one batch still be there the
 * next time it opens.
 *
 * No "See" after an upload here: this sits over the page being edited, and
 * taking somebody out of it is not what uploading a file for a field meant.
 */
function PickerGrid({ siteId, ...gridProps }: PickerGridProps) {
  const uploads = useMediaUploads({
    siteId,
    currentKind: gridProps.lockedKind,
  });
  return (
    <MediaGrid
      {...gridProps}
      uploads={uploads}
      actions={
        <MediaUploadButton uploads={uploads} kind={gridProps.lockedKind} />
      }
    />
  );
}

export function MediaPickerDialog({
  siteId,
  open,
  onOpenChange,
  onSelect,
  lockedKind,
}: MediaPickerDialogProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  // Local, not in the URL: the library page's filters belong to an address
  // somebody can come back to, a dialog's do not.
  const [filters, setFilters] = useState<MediaFilters>({});
  // Gated on `open`: this dialog is mounted for the lifetime of the page
  // editor (see MediaPickerProvider), not just while visible, so an
  // unconditional query would hit the media API on every editor load even
  // if the user never opens the picker.
  // The field's kind wins over anything the filters say, so a locked
  // picker can never be talked into listing what the field cannot use.
  const effectiveFilters: MediaFilters = lockedKind
    ? { ...filters, kind: lockedKind }
    : filters;
  const { data } = useQuery({
    ...mediaQueryOptions(siteId, page, effectiveFilters),
    enabled: open,
  });

  function handleOpenChange(next: boolean) {
    // Always reopen on page 1 with nothing filtered, whatever browsing
    // left off on.
    if (!next) {
      setPage(1);
      setFilters({});
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Never taller than the window, scrolling inside: a library of thirty
          files made the dialog taller than the screen, and it was cut off at
          both ends with its title and its last row out of reach. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(lockedKind ? PICKER_TITLE[lockedKind] : 'media.picker.title')}
          </DialogTitle>
        </DialogHeader>
        {data && (
          <PickerGrid
            siteId={siteId}
            items={data.items}
            page={page}
            total={data.total}
            onPageChange={setPage}
            filters={effectiveFilters}
            lockedKind={lockedKind}
            onFiltersChange={(next) => {
              setPage(1);
              setFilters(next);
            }}
            onSelect={onSelect}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
