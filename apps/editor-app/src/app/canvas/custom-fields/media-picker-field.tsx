import {
  pickedMediaSchema,
  type MediaKind,
  type PickedMedia,
} from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { Button } from '../../../components/ui/button';
import { useMediaPicker } from '../../media/media-picker-context';
import { readPickedValue } from './read-picked-value';

export interface MediaPickerFieldProps {
  /** Checked, not assumed — see `readPickedValue`. */
  value: unknown;
  onChange: (value: PickedMedia | null) => void;
}

/**
 * The file a block field holds, and the button that changes it.
 *
 * One component for every kind, told which one it is: the picker is
 * locked to that kind, and the preview is the element that kind is shown
 * with. It used to be an `<img>` for everything, so a video field showed a
 * broken picture of the video it held.
 */
function KindPickerField({
  value: stored,
  onChange,
  kind,
}: MediaPickerFieldProps & {
  /** Omitted for a field that takes any file at all. */
  kind?: MediaKind;
}) {
  const { t } = useTranslation();
  const { pick } = useMediaPicker();
  const value = readPickedValue(pickedMediaSchema, stored);

  async function handlePick() {
    const picked = await pick(kind ? { kind } : undefined);
    if (picked) onChange(picked);
  }

  const previewClass = 'max-w-full rounded-md border border-input';

  return (
    <div className="flex flex-col gap-2">
      {value && kind === 'image' && (
        <img src={value.url} alt="" className={previewClass} />
      )}
      {value && kind === 'video' && (
        // `metadata` so the first frame shows without downloading the clip.
        <video
          src={value.url}
          preload="metadata"
          muted
          className={previewClass}
        />
      )}
      {value && kind === 'audio' && (
        <audio src={value.url} preload="none" controls className="w-full" />
      )}
      {value && !kind && (
        // A download has nothing to preview; its name is what tells two
        // price lists apart.
        <span
          className="truncate text-xs text-muted-foreground"
          title={value.filename}
        >
          {value.filename ?? value.url}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void handlePick()}
      >
        {kind
          ? value
            ? t('canvas.pickers.media.change')
            : t('canvas.pickers.media.choose')
          : value
            ? t('canvas.pickers.file.change')
            : t('canvas.pickers.file.choose')}
      </Button>
    </div>
  );
}

/** `control: 'media'` — an image. The name predates video and audio, and theme descriptors already rely on it meaning this. */
export function MediaPickerField(props: MediaPickerFieldProps) {
  return <KindPickerField {...props} kind="image" />;
}

/** `control: 'video'`. */
export function VideoPickerField(props: MediaPickerFieldProps) {
  return <KindPickerField {...props} kind="video" />;
}

/** `control: 'audio'`. */
export function AudioPickerField(props: MediaPickerFieldProps) {
  return <KindPickerField {...props} kind="audio" />;
}

/** `control: 'file'` — any kind of file, for a download (ADR-0070). */
export function FilePickerField(props: MediaPickerFieldProps) {
  return <KindPickerField {...props} />;
}
