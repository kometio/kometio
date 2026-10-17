import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { UploadedFont } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { UploadFontDialog } from './upload-font-dialog';

export interface UploadedFontFieldProps {
  siteId: string;
  value: UploadedFont | null;
  /** A new font from the dialog, or `null` when it is taken off the site. */
  onChange: (font: UploadedFont | null) => void;
}

/**
 * The font the site uploaded (docs/adr/0147), under the font menu in Style:
 * which one it is and how many files it has, or a way to upload one.
 *
 * Taking it off leaves its files in the library: they may be in use as
 * downloads somewhere, and deleting a file is the library's to do.
 */
export function UploadedFontField({
  siteId,
  value,
  onChange,
}: UploadedFontFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm">
            {t('themeSettings.uploadedFont.current', {
              family: value.family,
              count: value.faces.length,
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {t('themeSettings.uploadedFont.replace')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            {t('themeSettings.uploadedFont.remove')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setOpen(true)}
        >
          <Upload aria-hidden="true" />
          {t('themeSettings.uploadedFont.upload')}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {value
          ? t('themeSettings.uploadedFont.filesStay')
          : t('themeSettings.uploadedFont.hint')}
      </p>
      <UploadFontDialog
        siteId={siteId}
        open={open}
        onOpenChange={setOpen}
        onUploaded={onChange}
      />
    </div>
  );
}
