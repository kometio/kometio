import { useTranslation } from '../../lib/use-translation';
import { Button } from '../../components/ui/button';
import { useMediaPicker } from '../media/media-picker-context';

export interface FaviconFieldProps {
  /** The address of the icon, `''` when the site has none. */
  value: string;
  onChange: (url: string) => void;
}

/**
 * The site's icon: the picture, at the size a browser tab draws it, and the
 * buttons that change or take it away.
 *
 * It was a field to paste an address into, for a file the library already
 * holds. The library is the place to choose it from now, like any other
 * picture on the site.
 */
export function FaviconField({ value, onChange }: FaviconFieldProps) {
  const { t } = useTranslation();
  const { pick } = useMediaPicker();

  async function choose() {
    const picked = await pick({ kind: 'image' });
    if (picked) onChange(picked.url);
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img
          src={value}
          alt={t('themeSettings.faviconPreview')}
          // 32px: what a browser tab draws, so what is shown is what is seen.
          className="size-8 shrink-0 rounded-sm border object-contain"
        />
      ) : (
        <span className="text-sm text-muted-foreground">
          {t('themeSettings.faviconNone')}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void choose()}
      >
        {value
          ? t('themeSettings.faviconChange')
          : t('themeSettings.faviconChoose')}
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange('')}
        >
          {t('themeSettings.faviconRemove')}
        </Button>
      )}
    </div>
  );
}
