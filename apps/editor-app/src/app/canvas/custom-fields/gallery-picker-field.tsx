import { useId } from 'react';
import { Checkbox } from '../../../components/ui/checkbox';
import { arrayMove } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { galleryPropsSchema, type PickedMedia } from '@kometio/shared-types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useTranslation } from '../../../lib/use-translation';
import { IconButton } from '../../common/icon-button';
import { useMediaPicker } from '../../media/media-picker-context';

export interface GalleryImageItem {
  media: PickedMedia | null;
  alt: string;
  isDecorative: boolean;
  /** Optional, and absent on every image saved before ADR-0057. */
  caption?: string;
}

export interface GalleryPickerFieldProps {
  /** Checked, not assumed — see `readGallery`. */
  value: unknown;
  onChange: (value: GalleryImageItem[]) => void;
}

/**
 * The images a gallery stores, read with the same schema the site renders
 * it with. No key at all — a block saved before it had one — is an empty
 * gallery. Anything else the editor cannot read is `null`: shown as such
 * rather than as an empty list, whose first edit would overwrite pictures
 * nobody saw.
 */
function readGallery(value: unknown): GalleryImageItem[] | null {
  if (value == null) return [];
  const parsed = galleryPropsSchema.shape.images.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Every slot (picker, alt text, remove) is always visible, no expansion step. */
export function GalleryPickerField({
  value: stored,
  onChange,
}: GalleryPickerFieldProps) {
  const { pick } = useMediaPicker();
  const { t } = useTranslation();
  const idPrefix = useId();
  const read = readGallery(stored);
  if (read === null) {
    return (
      <p role="alert" className="m-0 text-xs text-warning">
        {t('gallery.field.unreadable')}
      </p>
    );
  }
  const value = read;

  /** One image changed, every other one as it was. */
  function handleItemChange(index: number, change: Partial<GalleryImageItem>) {
    onChange(
      value.map((item, i) => (i === index ? { ...item, ...change } : item)),
    );
  }

  async function handlePickAt(index: number) {
    const picked = await pick({ kind: 'image' });
    if (!picked) return;
    handleItemChange(index, { media: picked });
  }

  function handleAltChange(index: number, alt: string) {
    handleItemChange(index, { alt });
  }

  function handleDecorativeChange(index: number, isDecorative: boolean) {
    handleItemChange(index, { isDecorative });
  }

  function handleCaptionChange(index: number, caption: string) {
    handleItemChange(index, { caption });
  }

  /**
   * Moving a picture was impossible until ADR-0057 — the only way to
   * change the order of a gallery was to delete every image after the
   * one you wanted to move and add them all back.
   */
  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    onChange(arrayMove(value, index, target));
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleAdd() {
    onChange([
      ...value,
      { media: null, alt: '', isDecorative: false, caption: '' },
    ]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        The key names the picture and its position, so a row whose picture
        changes is a new row. It does not follow a row when it moves: a move
        remounts the two rows involved, which loses nothing because every
        input here is controlled by `value` and holds no state of its own.
      */}
      {value.map((item, index) => {
        const altId = `${idPrefix}-alt-${index}`;
        const altRequiredId = `${idPrefix}-alt-required-${index}`;
        const captionId = `${idPrefix}-caption-${index}`;
        // Nothing forgotten while the file has a text of its own: the picture
        // says that one (an Image's rule, `fallbackFrom: 'media.alt'`).
        const altMissing =
          !item.isDecorative &&
          item.alt.trim().length === 0 &&
          !item.media?.alt?.trim();
        return (
          <div
            key={`${item.media?.mediaId ?? 'empty'}-${index}`}
            className="flex flex-col gap-2 rounded-lg border border-border p-2"
          >
            {item.media && (
              <img
                src={item.media.url}
                alt=""
                className="max-w-full rounded-md border border-border"
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => void handlePickAt(index)}
            >
              {item.media ? t('gallery.field.change') : t('gallery.field.pick')}
            </Button>
            {/* Labels above the fields, not placeholders: a placeholder is
                gone as soon as something is typed, and with it the only
                thing that said which of the two boxes is the alt text. */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={altId} className="text-xs">
                {t('gallery.field.alt')}
              </Label>
              <Input
                id={altId}
                type="text"
                value={item.alt}
                disabled={item.isDecorative}
                aria-describedby={altMissing ? altRequiredId : undefined}
                onChange={(event) => handleAltChange(index, event.target.value)}
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={item.isDecorative}
                onCheckedChange={(checked) =>
                  handleDecorativeChange(index, checked === true)
                }
              />
              {t('gallery.field.decorative')}
            </label>
            {altMissing && (
              // A theme colour, not a fixed amber: that one was the same in
              // the dark theme, where it read as a dim smear.
              <p id={altRequiredId} className="m-0 text-xs text-warning">
                {t('gallery.field.altRequired')}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={captionId} className="text-xs">
                {t('gallery.field.caption')}
              </Label>
              <Input
                id={captionId}
                type="text"
                value={item.caption ?? ''}
                onChange={(event) =>
                  handleCaptionChange(index, event.target.value)
                }
              />
            </div>
            <div className="flex gap-1.5">
              <IconButton
                label={t('gallery.field.moveUp')}
                variant="outline"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
              >
                <ArrowUp />
              </IconButton>
              <IconButton
                label={t('gallery.field.moveDown')}
                variant="outline"
                size="icon-sm"
                disabled={index === value.length - 1}
                onClick={() => handleMove(index, 1)}
              >
                <ArrowDown />
              </IconButton>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleRemove(index)}
              >
                {t('gallery.field.remove')}
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={handleAdd}
      >
        {t('gallery.field.add')}
      </Button>
    </div>
  );
}
