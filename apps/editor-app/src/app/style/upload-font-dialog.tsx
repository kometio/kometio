import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, X } from 'lucide-react';
import {
  UPLOADED_FONT_WEIGHTS,
  uploadedFontSchema,
  type UploadedFont,
  type UploadedFontFace,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { OptionsSelect } from '../../components/ui/select';
import { actionErrorMessage } from '../../lib/http-client';
import { uploadMedia } from '../../lib/media-api-client';
import { IconButton } from '../common/icon-button';
import { guessFontFace, isWebFontFileName } from './font-file-guess';

const MAX_FILES = 4;

interface ChosenFile {
  file: File;
  weight: UploadedFontFace['weight'];
  style: UploadedFontFace['style'];
}

export interface UploadFontDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The font as uploaded: its files are in the library, and the form now holds it. */
  onUploaded: (font: UploadedFont) => void;
}

/**
 * Uploads a font of the site's own (docs/adr/0147): a name, up to four WOFF2
 * or WOFF files with the weight and the style of each, and the owner's word
 * that they may use it on a website.
 *
 * The files go to the media library as they are uploaded; the font is the
 * site's once the Style page is saved, like every other field there.
 */
export function UploadFontDialog({
  siteId,
  open,
  onOpenChange,
  onUploaded,
}: UploadFontDialogProps) {
  const { t } = useTranslation();
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState('');
  const [files, setFiles] = useState<ChosenFile[]>([]);
  const [licensed, setLicensed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setFamily('');
    setFiles([]);
    setLicensed(false);
    setError('');
  }

  function choose(list: FileList | null) {
    const chosen = [...(list ?? [])];
    const wrong = chosen.find((file) => !isWebFontFileName(file.name));
    if (wrong) {
      setError(
        t('themeSettings.uploadedFont.dialog.wrongType', { name: wrong.name }),
      );
      return;
    }
    const next = [
      ...files,
      ...chosen.map((file) => ({ file, ...guessFontFace(file.name) })),
    ];
    if (next.length > MAX_FILES) {
      setError(t('themeSettings.uploadedFont.dialog.tooMany'));
      return;
    }
    setError('');
    setFiles(next);
    if (family.trim() === '' && next[0])
      setFamily(familyFromFileName(next[0].file.name));
  }

  function change(index: number, part: Partial<ChosenFile>) {
    setFiles(files.map((one, i) => (i === index ? { ...one, ...part } : one)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The dialog is portalled out of the DOM but not out of React, whose
    // events bubble through the component tree: without this, the submit of
    // this form reached the Style page's own form around the field and saved
    // the page, before the font was even uploaded.
    event.stopPropagation();
    if (family.trim() === '') {
      setError(t('themeSettings.uploadedFont.dialog.nameMissing'));
      return;
    }
    // Before anything is uploaded: a name the site would refuse is said now,
    // not after the files are already in the library.
    if (!uploadedFontSchema.shape.family.safeParse(family).success) {
      setError(t('themeSettings.uploadedFont.dialog.nameRule'));
      return;
    }
    if (files.length === 0) {
      setError(t('themeSettings.uploadedFont.dialog.noFiles'));
      return;
    }
    const pairs = new Set(files.map((one) => `${one.weight} ${one.style}`));
    if (pairs.size !== files.length) {
      setError(t('themeSettings.uploadedFont.dialog.duplicate'));
      return;
    }
    if (!licensed) {
      setError(t('themeSettings.uploadedFont.dialog.licence'));
      return;
    }
    setSending(true);
    setError('');
    const faces: UploadedFontFace[] = [];
    for (const one of files) {
      try {
        const media = await uploadMedia(siteId, one.file);
        faces.push({
          mediaId: media.id,
          url: media.url,
          weight: one.weight,
          style: one.style,
        });
      } catch (failure) {
        setError(
          actionErrorMessage(
            failure,
            t('themeSettings.uploadedFont.dialog.failed', {
              name: one.file.name,
            }),
          ),
        );
        setSending(false);
        return;
      }
    }
    setSending(false);
    const font = uploadedFontSchema.safeParse({ family: family.trim(), faces });
    if (!font.success) {
      setError(t('themeSettings.uploadedFont.dialog.nameRule'));
      return;
    }
    onUploaded(font.data);
    reset();
    onOpenChange(false);
  }

  const weightOptions = UPLOADED_FONT_WEIGHTS.map((weight) => ({
    value: weight,
    label:
      weight === 'variable'
        ? t('themeSettings.uploadedFont.dialog.weightVariable')
        : weight,
  }));
  const styleOptions = [
    {
      value: 'normal',
      label: t('themeSettings.uploadedFont.dialog.styleNormal'),
    },
    {
      value: 'italic',
      label: t('themeSettings.uploadedFont.dialog.styleItalic'),
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('themeSettings.uploadedFont.dialog.title')}
          </DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-name`}>
              {t('themeSettings.uploadedFont.dialog.nameLabel')}
            </Label>
            <Input
              id={`${ids}-name`}
              value={family}
              maxLength={60}
              onChange={(event) => setFamily(event.target.value)}
              aria-describedby={`${ids}-name-hint`}
            />
            <p
              id={`${ids}-name-hint`}
              className="text-xs text-muted-foreground"
            >
              {t('themeSettings.uploadedFont.dialog.nameHint')}
            </p>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">
              {t('themeSettings.uploadedFont.dialog.filesLabel')}
            </legend>
            {files.length > 0 && (
              <ul className="flex flex-col divide-y rounded-lg border">
                {files.map((one, index) => (
                  <li
                    key={`${one.file.name}-${index}`}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {one.file.name}
                    </span>
                    <OptionsSelect
                      size="sm"
                      className="w-40"
                      aria-label={t(
                        'themeSettings.uploadedFont.dialog.weightFor',
                        {
                          name: one.file.name,
                        },
                      )}
                      value={one.weight}
                      options={weightOptions}
                      onValueChange={(weight) => {
                        const known = UPLOADED_FONT_WEIGHTS.find(
                          (w) => w === weight,
                        );
                        if (known) change(index, { weight: known });
                      }}
                    />
                    <OptionsSelect
                      size="sm"
                      className="w-32"
                      aria-label={t(
                        'themeSettings.uploadedFont.dialog.styleFor',
                        {
                          name: one.file.name,
                        },
                      )}
                      value={one.style}
                      options={styleOptions}
                      onValueChange={(style) =>
                        change(index, {
                          style: style === 'italic' ? 'italic' : 'normal',
                        })
                      }
                    />
                    <IconButton
                      label={t('themeSettings.uploadedFont.dialog.removeFile', {
                        name: one.file.name,
                      })}
                      onClick={() =>
                        setFiles(files.filter((_, i) => i !== index))
                      }
                    >
                      <X aria-hidden="true" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={input}
              type="file"
              multiple
              accept=".woff2,.woff,font/woff2,font/woff"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                choose(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={files.length >= MAX_FILES || sending}
              onClick={() => input.current?.click()}
            >
              <Upload aria-hidden="true" />
              {t('themeSettings.uploadedFont.dialog.choose')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('themeSettings.uploadedFont.dialog.filesHint')}
            </p>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={licensed}
              onCheckedChange={(checked) => setLicensed(checked === true)}
              className="mt-0.5"
            />
            <span>{t('themeSettings.uploadedFont.dialog.licenceLabel')}</span>
          </label>

          <InlineError>{error}</InlineError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={sending}>
              {sending
                ? t('themeSettings.uploadedFont.dialog.uploading')
                : t('themeSettings.uploadedFont.dialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Biscotto-BoldItalic.woff2" → "Biscotto": the part before the first separator, a good first guess at a family. */
function familyFromFileName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return (base.split(/[-_[]/)[0] ?? base).trim().slice(0, 60);
}
