import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { MediaKind } from '@kometio/shared-types';
import type { MediaRecord, MediaFilters } from '../../lib/media-api-client';
import { MediaFilterBar } from './media-filter-bar';
import { MEDIA_KIND_LABEL, MediaFolders } from './media-folders';
import { MediaDetailSheet } from './media-detail-sheet';
import { MediaGrid } from './media-grid';
import {
  MediaDropZone,
  MediaUploadButton,
  MediaUploadProgress,
} from './media-upload';
import { useMediaUploads } from './use-media-uploads';
import { useDebouncedValue } from '../common/use-debounced-value';
import { PageHeader } from '../shell/page-header';

export interface MediaLibraryViewProps {
  siteId: string;
  items: MediaRecord[];
  page: number;
  total: number;
  /** In the URL, like the pages list's own: a search worth doing is a search worth reloading into and sending to somebody. */
  filters: MediaFilters;
  /** How many files each folder holds — what the front door shows. */
  counts: Record<MediaKind, number>;
  /** The file whose details panel is open, from `?file=` in the address. */
  openFileId?: string;
}

export function MediaLibraryView({
  siteId,
  items,
  page,
  total,
  filters,
  counts,
  openFileId,
}: MediaLibraryViewProps) {
  const { t } = useTranslation();
  // From this route, so `previous` in a search updater is this screen's own
  // address (its `kind` is a kind of file) and not the union of every screen's.
  const navigate = useNavigate({ from: '/media/' });

  /*
   * What is typed lives here until it settles; the URL is written 300ms
   * later. Writing it on every keystroke meant a history entry and a
   * loader round trip per character — six of each to type "report", and
   * six presses of Back to leave the screen. The pages list wrote the
   * same lesson down before this screen existed.
   *
   * The other filters are discrete choices, not typed text, so they go
   * straight through.
   */
  const [typed, setTyped] = useState(filters.search ?? '');
  const debouncedSearch = useDebouncedValue(typed, 300);

  // The URL still wins: arriving with ?search=…, or pressing Back, puts
  // that text in the box rather than leaving what was half-typed. Adjusted
  // during render rather than in an effect, which this codebase forbids
  // for the good reason that the stale value would be painted once first.
  const [lastFromUrl, setLastFromUrl] = useState(filters.search ?? '');
  if ((filters.search ?? '') !== lastFromUrl) {
    setLastFromUrl(filters.search ?? '');
    setTyped(filters.search ?? '');
  }

  useEffect(() => {
    if ((filters.search ?? '') === debouncedSearch) {
      return;
    }
    void navigate({
      to: '/media',
      // Back to page one: the file being looked for is very unlikely to be
      // on page four of a list that has just changed shape.
      search: {
        page: 1,
        search: debouncedSearch || undefined,
        kind: filters.kind,
      },
      // One search, one history entry — not one per character.
      replace: true,
    });
  }, [debouncedSearch, filters.search, filters.kind, navigate]);

  async function goToPage(target: number) {
    await navigate({ to: '/media', search: { ...filters, page: target } });
  }

  async function changeFilters(next: MediaFilters) {
    if ((next.search ?? '') !== (filters.search ?? '')) {
      setTyped(next.search ?? '');
      return;
    }
    await navigate({
      to: '/media',
      search: { page: 1, search: next.search || undefined, kind: next.kind },
    });
  }

  const uploads = useMediaUploads({
    siteId,
    currentKind: filters.kind,
    // "See" after an upload: the folder the files went to, or the folders
    // when they went to several.
    onSee: (kind) =>
      void navigate({
        to: '/media',
        search: { page: 1, kind: kind ?? undefined },
      }),
  });
  const searchFilters = { ...filters, search: typed };

  /*
   * A file's panel is one step forward in the history, so Back closes it.
   * Closing it by hand takes that step back again — a second entry for the
   * same list would make the next Back look as if it did nothing. Arrived
   * at by a link, with nothing behind it to go back to, it is replaced
   * instead.
   */
  const openedHere = useRef(false);
  function openFile(id: string) {
    openedHere.current = true;
    void navigate({
      to: '/media',
      search: (previous) => ({ ...previous, file: id }),
    });
  }
  function closeFile() {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
      return;
    }
    void navigate({
      to: '/media',
      search: (previous) => ({ ...previous, file: undefined }),
      replace: true,
    });
  }
  const detailSheet = openFileId ? (
    <MediaDetailSheet
      // One panel per file: what it remembers of the last one is not this one's.
      key={openFileId}
      siteId={siteId}
      fileId={openFileId}
      item={items.find((item) => item.id === openFileId) ?? null}
      onClose={closeFile}
    />
  ) : null;

  /*
   * Three screens behind one address:
   * - nothing chosen: the folders, with search and upload above them;
   * - a folder (`?kind=`): its files, searched within it;
   * - a search typed at the front door: matches from every folder, since
   *   somebody looking for "listino" should not have to guess where it is.
   */
  if (!filters.kind && !filters.search) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t('media.list.title')}
          actions={<MediaUploadButton uploads={uploads} />}
        />
        <MediaFilterBar
          value={searchFilters}
          onChange={(next) => void changeFilters(next)}
          showKindChoice={false}
        />
        <MediaUploadProgress uploads={uploads} />
        <MediaDropZone uploads={uploads}>
          <MediaFolders counts={counts} />
        </MediaDropZone>
        {detailSheet}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {/* The way back to the folders. A breadcrumb rather than a back
            button: it says where you are as well as how to leave. */}
        <nav aria-label={t('media.folders.breadcrumb')}>
          <ol className="flex items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link
                to="/media"
                search={{ page: 1 }}
                className="hover:text-foreground hover:underline"
              >
                {t('media.list.title')}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="text-foreground">
              {filters.kind
                ? t(MEDIA_KIND_LABEL[filters.kind])
                : t('media.folders.searchResults')}
            </li>
          </ol>
        </nav>
        <PageHeader
          title={
            filters.kind
              ? t(MEDIA_KIND_LABEL[filters.kind])
              : t('media.folders.searchResults')
          }
          description={
            filters.kind
              ? t('media.folders.count', { count: counts[filters.kind] })
              : undefined
          }
          actions={<MediaUploadButton uploads={uploads} kind={filters.kind} />}
        />
      </div>
      <MediaGrid
        items={items}
        page={page}
        total={total}
        filters={searchFilters}
        onFiltersChange={(next) => void changeFilters(next)}
        onPageChange={(target) => void goToPage(target)}
        onSelect={(item) => openFile(item.id)}
        uploads={uploads}
        lockedKind={filters.kind}
        showKindChoice={false}
      />
      {detailSheet}
    </div>
  );
}
