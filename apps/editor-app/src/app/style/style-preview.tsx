import {
  curatedThemeFontLabel,
  type ThemeFontChoice,
} from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';

export interface StylePreviewProps {
  /** The primary colour as the form holds it now (a hex), if the site overrides it. */
  primary: string | undefined;
  /** The text colour the theme puts on the primary colour, as it writes it. */
  primaryForeground: string | undefined;
  /** The font the form holds now: a curated one, the uploaded one, or `null` for the theme's own. */
  font: ThemeFontChoice | null;
  /** The name of the uploaded font, when that is the one. The editor does not load its files: it is drawn with something like it. */
  uploadedFamily?: string;
}

/**
 * A heading, a paragraph and a button, in the colour and the font the form
 * holds — before anything is saved.
 *
 * It is a piece of the editor, not the site in a frame: it answers "what
 * will this colour look like under text?", not "what will my pages look
 * like?". Said, under it, so it is not taken for the second. A font that
 * the editor does not load is drawn in the nearest thing it has.
 */
export function StylePreview({
  primary,
  primaryForeground,
  font,
  uploadedFamily,
}: StylePreviewProps) {
  const { t } = useTranslation();
  const family =
    font === null || font === 'system'
      ? undefined
      : `"${font === 'uploaded' ? (uploadedFamily ?? '') : curatedThemeFontLabel(font)}", system-ui, sans-serif`;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex flex-col items-start gap-2 rounded-md border bg-background p-4"
        style={{ fontFamily: family }}
      >
        <p className="text-lg font-semibold">
          {t('themeSettings.previewTitle')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('themeSettings.previewText')}
        </p>
        <span
          className="rounded-md px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: primary ?? 'var(--primary)',
            // The editor's own button colour has its own text colour: without
            // one the text is whatever the preview inherits, which is not
            // readable on it in either theme.
            color: primary
              ? (primaryForeground ?? '#ffffff')
              : 'var(--primary-foreground)',
          }}
        >
          {t('themeSettings.previewButton')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('themeSettings.previewNote')}
      </p>
    </div>
  );
}
