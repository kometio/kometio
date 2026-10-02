import { useTranslation } from 'react-i18next';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  checkContrastAgainstThemeForeground,
  oklchToHex,
} from '../../lib/color-contrast';

/**
 * What the picker starts from when neither the site nor its theme names a
 * colour it can show: an `<input type="color">` holds only #rrggbb, and a
 * theme writes its colours as #rrggbb or as oklch() (classic) — anything
 * else gives it nothing. Neutral greys, so turning the override on changes
 * nothing loud before a colour is picked.
 */
const NEUTRAL_START = { primary: '#18181b', secondary: '#71717a' } as const;

export type BrandColorKind = keyof typeof NEUTRAL_START;

/** `value` when it is a colour the picker can hold, `null` otherwise. */
export function hexOrNull(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

/**
 * The theme's own colour as the picker can hold it: a hex as it is, an oklch()
 * converted (the classic theme writes all of them that way), `null` for
 * anything else.
 */
export function themeColorAsHex(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return hexOrNull(value) ?? oklchToHex(value);
}

/**
 * The colour the site gets for `kind` when its override is on: the one it
 * picked, else the theme's own (so the picker opens on what the site
 * already shows), else a neutral one.
 */
export function brandColor(
  kind: BrandColorKind,
  picked: string | null,
  themeValue: string | null | undefined,
): string {
  return (
    hexOrNull(picked) ?? themeColorAsHex(themeValue) ?? NEUTRAL_START[kind]
  );
}

export interface BrandColorFieldProps {
  id: string;
  kind: BrandColorKind;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The colour the site picked, `null` before it picks one. */
  value: string | null;
  onValueChange: (value: string) => void;
  /** The theme's own value for this colour, as its tokens write it. */
  themeValue: string | undefined;
  /** The text colour the theme puts on this one, to warn when it cannot be read. */
  foreground: string | undefined;
}

/**
 * One of the site's two brand colours: whether the site overrides the
 * theme's, which colour, and what that does to the theme's text on it.
 * The Style page and the canvas's Global styles (a panel that is gone; the
 * canvas opens the Style page now) both edited these two colours; they did
 * it with two copies of the starting colour and four of the contrast
 * warning, and had started to disagree on where the picker opens.
 */
export function BrandColorField({
  id,
  kind,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  themeValue,
  foreground,
}: BrandColorFieldProps) {
  const { t } = useTranslation();
  const shown = brandColor(kind, value, themeValue);
  const contrast =
    enabled && foreground
      ? checkContrastAgainstThemeForeground(shown, foreground)
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-override`} className="text-sm font-medium">
            {kind === 'primary'
              ? t('themeSettings.primaryColorLabel')
              : t('themeSettings.secondaryColorLabel')}
          </Label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t('themeSettings.override')}
            <Switch
              id={`${id}-override`}
              size="sm"
              checked={enabled}
              onCheckedChange={onEnabledChange}
            />
          </label>
        </div>
        {enabled && (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={shown}
              onChange={(event) => onValueChange(event.target.value)}
              aria-label={
                kind === 'primary'
                  ? t('themeSettings.primaryColorLabel')
                  : t('themeSettings.secondaryColorLabel')
              }
              className="h-9 w-14 rounded-md border border-input bg-transparent"
            />
            <span className="text-xs text-muted-foreground">{shown}</span>
          </div>
        )}
      </div>
      {!enabled && themeColorAsHex(themeValue) && (
        <p className="text-xs text-muted-foreground">
          {t('themeSettings.currentThemeValue')}
        </p>
      )}
      {contrast && !contrast.passesAA && (
        <p className="text-xs text-warning">
          {t('themeSettings.contrastWarning', {
            ratio: contrast.ratio.toFixed(1),
          })}
        </p>
      )}
    </div>
  );
}
