import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { mediaKindOfMime, type MediaKind } from '@kometio/shared-types';
import { actionErrorMessage } from '../../lib/http-client';
import { uploadMedia, type MediaRecord } from '../../lib/media-api-client';
import { useToast } from '../shell/toast-provider';
import { MEDIA_KIND_LABEL } from './media-folders';

/** Where a file is in the queue: not yet reached, on its way, or settled either way. */
export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface UploadEntry {
  id: number;
  name: string;
  status: UploadStatus;
  /** Why it did not go through, in words — only on a failed one. */
  error?: string;
}

export interface MediaUploads {
  /** One line per file of the latest batch, still there once it is over so a failure can be read. */
  entries: readonly UploadEntry[];
  isUploading: boolean;
  upload: (files: readonly File[]) => Promise<void>;
  /** Clears the lines. Only offered when nothing is on its way. */
  dismiss: () => void;
}

export interface UseMediaUploadsOptions {
  siteId: string;
  /** The folder the person is looking at, if any: its files need no "See". */
  currentKind?: MediaKind;
  /**
   * Where "See" goes: a folder, or (`null`) the folders themselves when the
   * files landed in several. Left out where there is nowhere to go — a
   * picker sits over the page being edited, and taking somebody out of it
   * is not what "upload" meant.
   */
  onSee?: (kind: MediaKind | null) => void;
}

/**
 * Uploading files to the library, one after another, with a line for each.
 *
 * Several at a time is what somebody with a folder of photos has. They go
 * up in sequence, not in parallel: every image is re-encoded on the server
 * (ADR-0013), and twenty at once is twenty of those competing for one
 * machine. Each line says where its file is, and a failure says why on that
 * line and does not stop the ones behind it.
 *
 * The list is refreshed once at the end, not after every file: twenty
 * refetches of a grid that is already on screen would flicker it twenty
 * times.
 */
export function useMediaUploads({
  siteId,
  currentKind,
  onSee,
}: UseMediaUploadsOptions): MediaUploads {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<readonly UploadEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const nextId = useRef(0);
  // A ref as well as the state: a second drop in the same tick would
  // otherwise see `isUploading` still false and start a second queue.
  const running = useRef(false);

  const patch = useCallback((id: number, changes: Partial<UploadEntry>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    );
  }, []);

  const announce = useCallback(
    (uploaded: readonly MediaRecord[], total: number) => {
      if (uploaded.length === 0) {
        toast(t('media.upload.noneUploaded'), 'destructive');
        return;
      }
      if (uploaded.length < total) {
        toast(
          t('media.upload.partial', { count: uploaded.length, total }),
          'destructive',
        );
        return;
      }
      const kinds = new Set(
        uploaded.map((media) => mediaKindOfMime(media.mimeType)),
      );
      const [first] = kinds;
      const folder = kinds.size === 1 ? (first ?? null) : null;
      const message =
        folder === null
          ? t('media.upload.done', { count: uploaded.length })
          : t('media.upload.doneIn', {
              count: uploaded.length,
              folder: t(MEDIA_KIND_LABEL[folder]),
            });
      toast(
        message,
        'success',
        onSee && folder !== currentKind
          ? { label: t('media.upload.see'), onClick: () => onSee(folder) }
          : undefined,
      );
    },
    [toast, t, onSee, currentKind],
  );

  const upload = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0 || running.current) return;
      running.current = true;
      setIsUploading(true);
      const jobs = files.map((file) => ({ file, id: nextId.current++ }));
      setEntries(
        jobs.map(({ file, id }) => ({
          id,
          name: file.name,
          status: 'waiting',
        })),
      );
      const uploaded: MediaRecord[] = [];
      for (const { file, id } of jobs) {
        patch(id, { status: 'uploading' });
        try {
          uploaded.push(await uploadMedia(siteId, file));
          patch(id, { status: 'done' });
        } catch (error) {
          patch(id, {
            status: 'failed',
            error: actionErrorMessage(error, t('common.error')),
          });
        }
      }
      running.current = false;
      setIsUploading(false);
      void queryClient.invalidateQueries({ queryKey: ['media', siteId] });
      announce(uploaded, jobs.length);
    },
    [siteId, patch, announce, queryClient, t],
  );

  const dismiss = useCallback(() => setEntries([]), []);

  return { entries, isUploading, upload, dismiss };
}
