import { X } from 'lucide-react';
import type { ThemeBaseTokens } from '@kometio/shared-types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useTranslation } from '../../../lib/use-translation';
import { ChoiceGroup } from '../../../components/ui/choice-group';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * A value that names a theme token instead of freezing a colour
 * (ADR-0050) — `var(--primary)` and friends.
 *
 * Accepted alongside a hex in the text field, and what a theme swatch
 * writes. The whole point of the swatches: a block painted with
 * `var(--primary)` re-tints itself when the site changes theme, exactly
 * as the theme's own CSS does, where `#5b9bd5` stays that blue forever.
 */
const THEME_VAR_PATTERN = /^var\(--[a-z][a-z0-9-]*\)$/;

/**
 * The theme colours offered as swatches, in the order they are shown.
 * Each is dropped when the active theme does not declare it — see
 * `themeBaseTokensSchema`, where all but the first two are optional.
 */
const SWATCH_TOKENS = [
  { key: 'primary', cssVar: '--primary' },
  { key: 'secondary', cssVar: '--secondary' },
  { key: 'background', cssVar: '--background' },
  { key: 'foreground', cssVar: '--foreground' },
  { key: 'muted', cssVar: '--muted' },
  { key: 'mutedForeground', cssVar: '--muted-foreground' },
  { key: 'border', cssVar: '--border' },
  { key: 'link', cssVar: '--link' },
] as const satisfies readonly {
  key: keyof ThemeBaseTokens;
  cssVar: string;
}[];

export interface ColorPickerFieldProps {
  /** A colour, or anything else meaning "the theme's" — see ColorPickerField. */
  value: unknown;
  onChange: (value: string | null) => void;
  /**
   * The RESOLVED value of the active theme for this field (docs/adr/0022's
   * follow-up on pre-fill) — `null`/absent = not loaded yet or no known
   * default. Shown as a preview when `value` isn't set, so the field
   * already starts from the current real appearance instead of being
   * empty. Not always a hex value (often `oklch(...)`, like this
   * project's theme tokens): `<input type="color">` only accepts hex, so
   * that stays black until it's a match; the preview swatch below
   * instead accepts any valid CSS color syntax.
   */
  defaultValue?: string | null;
  /**
   * The active theme's own colours (ADR-0050). Absent = no swatch row,
   * which is what every caller that has not been given the theme's tokens
   * gets: the field still works, it just cannot offer them.
   */
  themeTokens?: ThemeBaseTokens | null;
  /**
   * What the colour is for ("Text colour"). The two inputs are named with
   * it: no label around them reaches either, and a colour well a screen
   * reader calls "colour well" does not say whose colour it is.
   */
  label?: string;
}

/**
 * Per-instance color override — `null`/absent means "inherit from the
 * theme" (the block renderer only applies a CSS-var scoping wrapper when
 * this is non-empty). The check is a truthiness check, not `!== null`:
 * `value` can arrive as `undefined` (property never customized, so
 * absent from the sparse object), and `undefined !== null` is `true` in
 * JS — with `!== null` the "back to theme" button would show up even
 * without any real customization.
 */
export function ColorPickerField({
  value: stored,
  onChange,
  defaultValue,
  themeTokens,
  label,
}: ColorPickerFieldProps) {
  const { t } = useTranslation();
  const value = typeof stored === 'string' && stored !== '' ? stored : null;
  const hexDefault =
    defaultValue && HEX_PATTERN.test(defaultValue) ? defaultValue : null;
  const swatches = SWATCH_TOKENS.flatMap((token) => {
    const resolved = themeTokens?.[token.key];
    return typeof resolved === 'string' && resolved !== ''
      ? [{ ...token, resolved, cssValue: `var(${token.cssVar})` }]
      : [];
  });
  // The theme's own name for a colour, where it has one. The field used to
  // show the resolved value — "Theme: oklch(0.21 0.006 106)" — which is the
  // CSS, not the colour: nobody picks "oklch(0.21…" from a palette.
  const nameOf = (candidate: string | null | undefined): string | null => {
    if (!candidate) return null;
    const normalised = candidate.replace(/\s+/g, ' ').trim().toLowerCase();
    const match = swatches.find(
      (swatch) =>
        swatch.cssValue === candidate ||
        swatch.resolved.replace(/\s+/g, ' ').trim().toLowerCase() ===
          normalised,
    );
    return match ? t(`canvas.colorPicker.tokens.${match.key}`) : null;
  };
  const defaultName = nameOf(defaultValue);
  const selectedName = value ? nameOf(value) : null;
  const themeHint = defaultName
    ? t('canvas.colorPicker.themeNamed', { name: defaultName })
    : t('canvas.colorPicker.inherit');
  // Classes, not literal colours: `#fff` fields with near-black text were
  // white boxes in the dark theme, and the selected swatch's near-black
  // outline disappeared against it.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value ?? hexDefault ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
        />
        {!value && defaultValue && (
          <span
            aria-hidden="true"
            title={themeHint}
            className="size-4 shrink-0 rounded-sm border border-border"
            style={{ background: defaultValue }}
          />
        )}
        <Input
          type="text"
          aria-label={
            label ? t('canvas.colorPicker.asCode', { label }) : undefined
          }
          className="min-w-0 flex-1"
          value={value ?? ''}
          placeholder={themeHint}
          onChange={(event) => {
            const next = event.target.value;
            if (next === '') {
              onChange(null);
            } else if (HEX_PATTERN.test(next) || THEME_VAR_PATTERN.test(next)) {
              // A theme token is as valid a colour as a hex here, and it has
              // to be typeable: the swatches below cover the theme's own
              // palette, but a theme may declare colours core knows nothing
              // about, and refusing them would make those unreachable.
              onChange(next);
            }
          }}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            // A name, not only a tooltip: the button's content is an icon,
            // and it used to be a "✕" read out as "multiplication x".
            aria-label={t('canvas.colorPicker.clear')}
            title={t('canvas.colorPicker.clear')}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
      {selectedName && (
        <p className="text-xs text-muted-foreground">
          {t('canvas.colorPicker.selectedToken', { name: selectedName })}
        </p>
      )}
      {swatches.length > 0 && (
        // The selected token is the one marked: a swatch row where nothing
        // shows which is active leaves the field saying `var(--primary)`
        // with no visible answer to "which of these is that?".
        <ChoiceGroup
          variant="tiles"
          label={t('canvas.colorPicker.themeColours')}
          value={
            swatches.find((swatch) => swatch.cssValue === value)?.cssValue ??
            null
          }
          onValueChange={onChange}
          choices={swatches.map((swatch) => ({
            value: swatch.cssValue,
            label: t('canvas.colorPicker.useToken', {
              token: t(`canvas.colorPicker.tokens.${swatch.key}`),
            }),
            icon: (
              <span
                className="size-5 rounded-sm border border-border"
                style={{ background: swatch.resolved }}
              />
            ),
          }))}
        />
      )}
    </div>
  );
}
