import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Trash2 } from 'lucide-react';
import { mediaKindOfMime } from '@kometio/shared-types';
import type { MediaRecord } from '../../lib/media-api-client';
import { actionErrorMessage } from '../../lib/http-client';
import { formatBytes } from '../../lib/format-bytes';
import { useFormatDate } from '../../lib/use-format-date';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useCurrentSession } from '../auth/use-current-session';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useToast } from '../shell/toast-provider';
import { MediaThumbnail, mediaFormatOf } from './media-card';
import { MediaDetailsForm } from './media-details-form';
import {
  mediaFileQueryOptions,
  mediaUsagesQueryOptions,
} from './media-queries';
import { MediaUsages, usageCount } from './media-usages';
import { useMediaLibrary } from './use-media-library';

export interface MediaDetailSheetProps {
  siteId: string;
  /** The id the address names. */
  fileId: string;
  /** The file, from the list on screen — or `null` when the list does not hold it, and the panel asks for it. */
  item: MediaRecord | null;
  onClose: () => void;
}

/** The file itself, as large as the panel allows: playable where it can be played, a glyph where it cannot. */
function MediaPreview({ item }: { item: MediaRecord }) {
  const kind = mediaKindOfMime(item.mimeType);
  if (kind === 'image') {
    return (
      <img
        src={item.url}
        alt={item.filename}
        className="max-h-72 w-full object-contain"
      />
    );
  }
  if (kind === 'video') {
    return (
      <video
        src={item.url}
        controls
        preload="metadata"
        className="max-h-72 w-full"
      />
    );
  }
  if (kind === 'audio') {
    return (
      <div className="p-4">
        <audio src={item.url} controls className="w-full" />
      </div>
    );
  }
  return (
    <div className="aspect-video">
      <MediaThumbnail item={item} />
    </div>
  );
}

/**
 * One file of the library, in a panel at the right edge: what it is, its
 * public address, and what can be done with it — download it, copy its
 * address, delete it.
 *
 * A dialog anchored to the edge, like the phone menu on the left one: focus
 * stays inside it, Escape closes it, and what is behind is out of reach
 * while it is open. The address carries the file (`?file=<id>`), so this
 * has a link of its own and Back closes it.
 *
 * A file named by the address that the list on screen does not hold — a
 * link opened cold, or one to a file on another page of the list — is asked
 * for by its id, so the panel opens on it either way.
 */
export function MediaDetailSheet({
  siteId,
  fileId,
  item,
  onClose,
}: MediaDetailSheetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const formatDate = useFormatDate();
  const canDelete = useCurrentSession().can('delete');
  const { deleteMedia } = useMediaLibrary(siteId);
  const urlId = useId();
  const urlField = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');
  // What was on screen last. Deleting the file refreshes the list before
  // the panel has been told to close, and for that moment the address
  // names a file the list no longer holds — which is not "not found",
  // it is a file that has just gone.
  const [lastItem, setLastItem] = useState(item);
  if (item && item !== lastItem) setLastItem(item);
  // Asked for only when there is nothing on screen to show: the list has it,
  // or had it a moment ago, and a request for what is already there would
  // flash "not found" for the file that has just been deleted.
  const needsFetch = item === null && lastItem === null;
  const fetched = useQuery({
    ...mediaFileQueryOptions(siteId, fileId),
    enabled: needsFetch,
    retry: false,
  });
  const shown = item ?? lastItem ?? fetched.data ?? null;
  const isLoading = needsFetch && fetched.isPending;
  const { data: usage } = useQuery({
    ...mediaUsagesQueryOptions(siteId, fileId),
    enabled: shown !== null,
  });

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('media.detail.copied'), 'success');
    } catch {
      // No clipboard where the page is not on a secure origin, or the
      // browser said no: leave the address selected, ready for the keys.
      urlField.current?.select();
      toast(t('media.detail.copyFailed'));
    }
  }

  async function confirmDelete(media: MediaRecord) {
    setError('');
    try {
      await deleteMedia(media.id);
      toast(t('media.detail.deleted', { name: media.filename }), 'success');
      onClose();
    } catch (err) {
      setIsConfirming(false);
      setError(actionErrorMessage(err, t('media.detail.deleteFailed')));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={panel}
        // Focus goes to the panel itself, not to the first thing in it: that
        // was the address field, which selects its text as it takes focus,
        // so the panel opened with a highlighted URL nobody had asked for.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
        // Anchored to the right edge for the whole height, like the phone
        // menu is to the left one. `w-96` at 1440, most of the screen at 390.
        className="top-0 right-0 left-auto flex h-dvh w-96 max-w-[90vw] translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none border-l sm:max-w-96"
      >
        <DialogHeader>
          <DialogTitle className="pr-8 break-words">
            {shown
              ? shown.filename
              : isLoading
                ? t('common.loading')
                : t('media.detail.missingTitle')}
          </DialogTitle>
          <DialogDescription className={shown ? 'sr-only' : undefined}>
            {shown
              ? t('media.detail.description')
              : isLoading
                ? ''
                : t('media.detail.missing')}
          </DialogDescription>
        </DialogHeader>
        {shown && (
          <>
            <div className="overflow-hidden rounded-lg border bg-muted">
              <MediaPreview item={shown} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">
                {t('media.detail.type')}
              </dt>
              <dd>{mediaFormatOf(shown)}</dd>
              <dt className="text-muted-foreground">
                {t('media.detail.size')}
              </dt>
              <dd className="tabular-nums">{formatBytes(shown.size)}</dd>
              {shown.width !== null && shown.height !== null && (
                <>
                  <dt className="text-muted-foreground">
                    {t('media.detail.dimensions')}
                  </dt>
                  <dd className="tabular-nums">
                    {t('media.detail.pixels', {
                      width: shown.width,
                      height: shown.height,
                    })}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {t('media.detail.uploaded')}
              </dt>
              <dd>{formatDate(shown.createdAt)}</dd>
            </dl>
            <MediaDetailsForm siteId={siteId} media={shown} />
            <div className="flex flex-col gap-1">
              <Label htmlFor={urlId}>{t('media.detail.url')}</Label>
              <div className="flex gap-2">
                <Input
                  id={urlId}
                  ref={urlField}
                  readOnly
                  value={shown.url}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void copyUrl(shown.url)}
                >
                  <Copy />
                  {t('media.detail.copy')}
                </Button>
              </div>
            </div>
            <MediaUsages siteId={siteId} mediaId={shown.id} />
            {error && <InlineError>{error}</InlineError>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                {/* `download` is honoured on the same origin; across two it
                    is ignored and the file opens, so a new tab keeps the
                    editor where it is either way. */}
                <a
                  href={shown.url}
                  download={shown.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download />
                  {t('media.detail.download')}
                </a>
              </Button>
              {canDelete && (
                <Button
                  variant="destructive"
                  onClick={() => setIsConfirming(true)}
                >
                  <Trash2 />
                  {t('media.detail.delete')}
                </Button>
              )}
            </div>
            {isConfirming && (
              <ConfirmActionDialog
                open
                onOpenChange={(open) => !open && setIsConfirming(false)}
                title={t('media.deleteDialog.title')}
                description={[
                  t('media.deleteDialog.description', { name: shown.filename }),
                  // What it would leave a hole in, when it is known: "delete
                  // this?" and "delete this, which four pages show?" are
                  // different decisions.
                  usage && usageCount(usage) > 0
                    ? t('media.deleteDialog.usedOn', {
                        count: usageCount(usage),
                      })
                    : null,
                ]
                  .filter((sentence) => sentence !== null)
                  .join(' ')}
                onConfirm={() => void confirmDelete(shown)}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
