import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CircleAlert, Clock, Loader2, ShieldAlert } from 'lucide-react';
import type { MediaKind } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import type { MediaUploads, UploadEntry } from './use-media-uploads';

/**
 * What the file chooser suggests, and only when the kind is already known.
 *
 * The library takes any file (ADR-0070), so outside a folder there is
 * nothing to suggest. Inside a picker for a video field, or the Images
 * folder, `image/*` spares somebody choosing a PDF that would then not
 * appear in the list they are looking at. Documents and other files have
 * no MIME wildcard worth offering.
 */
const ACCEPT_BY_KIND: Partial<Record<MediaKind, string>> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
};

export interface MediaUploadButtonProps {
  uploads: MediaUploads;
  kind?: MediaKind;
  /** Filled where it is the screen's one action; outline where it is a second way in, like the empty folder's. */
  variant?: 'default' | 'outline';
}

/**
 * The upload button and the hidden file input behind it, for one file or
 * many.
 *
 * Its own component since the library opened onto folders: the folder
 * screen has no grid, and uploading is still the first thing somebody
 * does there.
 */
export function MediaUploadButton({
  uploads,
  kind,
  variant = 'default',
}: MediaUploadButtonProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again later still fires onChange.
    event.target.value = '';
    void uploads.upload(files);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={kind ? ACCEPT_BY_KIND[kind] : undefined}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant={variant}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploads.isUploading}
      >
        {uploads.isUploading
          ? t('media.grid.uploading')
          : t('media.grid.upload')}
      </Button>
    </>
  );
}

/**
 * The warning the owner asked for, in place of a check we do not make
 * (ADR-0070): any file is taken, nothing is scanned, and the one
 * protection there is — whatever is not an image, a video or an audio
 * file downloads instead of opening — is not a reason to upload something
 * you do not trust.
 *
 * Said when somebody is uploading — over the drop zone, and with the
 * files' progress — and not on the page all the time, where it was a
 * paragraph nobody read above every folder.
 */
export function MediaUploadWarning() {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      {t('media.grid.uploadWarning')}
    </p>
  );
}

function UploadStatusLine({ entry }: { entry: UploadEntry }) {
  const { t } = useTranslation();
  const failed = entry.status === 'failed';
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {entry.status === 'waiting' && (
          <Clock className="size-4 text-muted-foreground" />
        )}
        {entry.status === 'uploading' && (
          <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" />
        )}
        {entry.status === 'done' && <Check className="size-4 text-success" />}
        {failed && <CircleAlert className="size-4 text-destructive" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm" title={entry.name}>
          {entry.name}
        </span>
        <span
          className={cn(
            'text-xs',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {failed
            ? t('media.upload.status.failed', { reason: entry.error })
            : t(`media.upload.status.${entry.status}`)}
        </span>
      </span>
    </li>
  );
}

export interface MediaUploadProgressProps {
  uploads: MediaUploads;
}

/** One line per file of the batch, what each is doing, and the warning; gone until there is a batch. */
export function MediaUploadProgress({ uploads }: MediaUploadProgressProps) {
  const { t } = useTranslation();
  if (uploads.entries.length === 0) return null;

  return (
    <section
      aria-label={t('media.upload.progressLabel')}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <ul className="flex flex-col gap-2">
        {uploads.entries.map((entry) => (
          <UploadStatusLine key={entry.id} entry={entry} />
        ))}
      </ul>
      <MediaUploadWarning />
      {!uploads.isUploading && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={uploads.dismiss}
        >
          {t('media.upload.dismiss')}
        </Button>
      )}
    </section>
  );
}

export interface MediaDropZoneProps {
  uploads: MediaUploads;
  children: ReactNode;
}

/** Only a drag that carries files is ours: dragging a piece of text over the page is not an upload. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

/**
 * Where files can be dropped: whatever it wraps, the grid or the folders.
 *
 * It says so as soon as a file is over it — a dashed accent border and
 * "Drop to upload" over the content — and only then: there is no box drawn
 * on the page for somebody who is not dragging anything. The button is the
 * way for a keyboard or a phone.
 */
export function MediaDropZone({ uploads, children }: MediaDropZoneProps) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  // dragenter/dragleave also fire for every child crossed on the way, so a
  // plain flag flickers off over each card. Entries and exits are counted.
  const depth = useRef(0);

  return (
    <div
      // The border is there all the time, transparent, and the negative
      // margin takes back the room it occupies: the content does not move
      // a pixel when a file comes over.
      className={cn(
        'relative -m-0.5 rounded-lg border-2 border-transparent',
        isOver && 'border-dashed border-primary',
      )}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setIsOver(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setIsOver(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setIsOver(false);
        void uploads.upload(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {isOver && (
        // The whole zone is dimmed, but the words stay where the eyes are:
        // a library of a hundred files is several screens tall, and a label
        // centred on all of it would be somewhere below the fold.
        <div className="pointer-events-none absolute inset-0 rounded-md bg-background/85">
          <div className="sticky top-[25vh] flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm font-medium">{t('media.upload.dropHere')}</p>
            <div className="max-w-md">
              <MediaUploadWarning />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
