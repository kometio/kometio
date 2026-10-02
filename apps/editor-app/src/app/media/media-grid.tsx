import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaKind } from '@kometio/shared-types';
import type { MediaRecord, MediaFilters } from '../../lib/media-api-client';
import { MediaFilterBar } from './media-filter-bar';
import { MediaMeta, MediaThumbnail } from './media-card';
import {
  MediaDropZone,
  MediaUploadButton,
  MediaUploadProgress,
} from './media-upload';
import { MEDIA_PAGE_SIZE } from './media-queries';
import type { MediaUploads } from './use-media-uploads';
import { ListItemButton } from '../../components/ui/list-item-button';
import { Pagination } from '../common/pagination';

/** What an empty folder says, by the name of what it holds — "No videos yet", not "No files yet" in the Videos folder. */
const EMPTY_KIND_KEY = {
  image: 'media.grid.emptyKind.image',
  video: 'media.grid.emptyKind.video',
  audio: 'media.grid.emptyKind.audio',
  document: 'media.grid.emptyKind.document',
  other: 'media.grid.emptyKind.other',
} as const satisfies Record<MediaKind, string>;

export interface MediaGridProps {
  items: MediaRecord[];
  page: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Search and kind, owned by the caller — the library page keeps them in the URL, the picker dialog in its own state. */
  filters: MediaFilters;
  onFiltersChange: (next: MediaFilters) => void;
  /**
   * What clicking a file does. In the in-editor picker it takes the file
   * for the field that asked; on the library page it opens the file's
   * details, where it is downloaded, copied or deleted. Every file is a
   * button either way — nothing is only reachable by hovering it.
   */
  onSelect: (media: MediaRecord) => void;
  uploads: MediaUploads;
  /** The one kind a picker, or a folder, is showing — see MediaFilterBar. */
  lockedKind?: MediaKind;
  /** See MediaFilterBar.showKindChoice. */
  showKindChoice?: boolean;
  /** Beside the search: the picker's upload button. The library's is in its screen's header. */
  actions?: ReactNode;
}

export function MediaGrid({
  items,
  page,
  total,
  onPageChange,
  filters,
  onFiltersChange,
  onSelect,
  uploads,
  lockedKind,
  showKindChoice,
  actions,
}: MediaGridProps) {
  const { t } = useTranslation();

  const totalPages = Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE));
  // A search, not a folder: an empty folder is empty, and saying "nothing
  // matches" there would suggest a filter to clear that is not there.
  const isSearching = Boolean(filters.search?.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <MediaFilterBar
          value={filters}
          onChange={onFiltersChange}
          lockedKind={lockedKind}
          showKindChoice={showKindChoice}
        />
        {actions}
      </div>
      <MediaUploadProgress uploads={uploads} />
      <MediaDropZone uploads={uploads}>
        {items.length === 0 ? (
          isSearching ? (
            <p className="text-sm text-muted-foreground">
              {/* "No files yet" is a lie when there are files and none of
                  them match — it sends somebody to upload what they
                  already have. */}
              {t('media.grid.noMatches')}
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
              <p className="max-w-prose text-sm text-muted-foreground">
                {t(
                  lockedKind ? EMPTY_KIND_KEY[lockedKind] : 'media.grid.empty',
                )}
              </p>
              <MediaUploadButton
                uploads={uploads}
                kind={lockedKind}
                variant="outline"
              />
            </div>
          )
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col overflow-hidden rounded-lg border"
              >
                <ListItemButton
                  inset="none"
                  // Named by the file, explicitly: the button holds the
                  // thumbnail AND the name, format, size and date, so its
                  // accessible name would otherwise be all of that read
                  // out twice over.
                  aria-label={item.filename}
                  onClick={() => onSelect(item)}
                  className="flex-col items-stretch gap-0"
                >
                  <span className="aspect-square w-full overflow-hidden">
                    <MediaThumbnail item={item} />
                  </span>
                  <MediaMeta item={item} />
                </ListItemButton>
              </li>
            ))}
          </ul>
        )}
      </MediaDropZone>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
