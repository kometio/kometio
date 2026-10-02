import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { iconSource } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { Button } from '../../../components/ui/button';
import { useIconList } from '../../style/icon-list-context';
import { brandIconQueryOptions } from '../../style/theme-icons-queries';
import { useActiveThemeName } from '../../style/use-active-theme-name';

/**
 * The markup that previews an icon value. A logo is fetched on its own:
 * the interface set the provider preloads does not hold the logos, so a
 * logo chosen yesterday used to show no preview at all today.
 */
function useIconPreview(value: string | null): string | null {
  const { resolve } = useIconList();
  const isBrand = value !== null && iconSource(value) === 'brand';
  const { data: brand } = useQuery(
    brandIconQueryOptions(useActiveThemeName(), isBrand ? (value ?? '') : ''),
  );
  if (!value) return null;
  return isBrand ? (brand?.svg ?? null) : resolve(value);
}

export interface IconPickerFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function IconPickerField({ value, onChange }: IconPickerFieldProps) {
  const { t } = useTranslation();
  const { pick, isMissingFromTheme } = useIconList();
  const svg = useIconPreview(value);
  // Said here and not only in the layers panel: this is where the other
  // icon gets chosen (ADR-0090).
  const isMissing = value !== null && isMissingFromTheme(value);

  async function handlePick() {
    const picked = await pick();
    if (picked) onChange(picked);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {svg && (
          <span
            aria-hidden="true"
            className="size-5 shrink-0"
            // The SVG is the active theme's own file — trusted like the rest
            // of a theme's code, which runs in the public site (ADR-0091) —
            // or mediaIconSvg's, which escapes the one address it holds;
            // never anything an author typed as markup. The editor's CSP
            // has no 'unsafe-inline', so a handler or `javascript:` inside
            // one would not run either.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handlePick()}
        >
          {value
            ? t('canvas.pickers.icon.change')
            : t('canvas.pickers.icon.choose')}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('canvas.pickers.icon.remove')}
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>
      {isMissing && (
        <p className="text-xs text-warning">
          {t('canvas.pickers.icon.missingFromTheme', { name: value })}
        </p>
      )}
    </div>
  );
}

/**
 * The icon field as the inspector mounts it, from a prop it only knows as
 * `unknown`. A block saved before it had an icon field holds no `icon` key
 * at all — the schema's `null` default applies where props are parsed, on
 * the public site, not here — so anything but a name means no icon.
 */
export function IconField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: string | null) => void;
}) {
  return (
    <IconPickerField
      value={typeof value === 'string' && value !== '' ? value : null}
      onChange={onChange}
    />
  );
}
