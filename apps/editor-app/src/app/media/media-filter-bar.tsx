import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ChoiceGroup } from '../../components/ui/choice-group';
import type { MediaKind } from '@kometio/shared-types';
import type { MediaFilters } from '../../lib/media-api-client';

export interface MediaFilterBarProps {
  value: MediaFilters;
  onChange: (next: MediaFilters) => void;
  /**
   * Set when the kind is not the reader's choice: a field that takes a
   * video has already said so, and offering "Images" there would only be a
   * way to pick something the field cannot use.
   */
  lockedKind?: MediaKind;
  /**
   * False on the library page, where the folders ARE the choice of kind:
   * a row of kind buttons above a folder would be the same question asked
   * twice, in two places that could disagree.
   */
  showKindChoice?: boolean;
}

/** "Everything" first, then the five kinds a file can be (ADR-0070). */
const KIND_OPTIONS = [
  { value: 'all', labelKey: 'media.filters.kindAll' },
  { value: 'image', labelKey: 'media.filters.kindImage' },
  { value: 'video', labelKey: 'media.filters.kindVideo' },
  { value: 'audio', labelKey: 'media.filters.kindAudio' },
  { value: 'document', labelKey: 'media.filters.kindDocument' },
  { value: 'other', labelKey: 'media.filters.kindOther' },
] as const satisfies readonly {
  value: 'all' | MediaKind;
  labelKey: `media.filters.kind${string}`;
}[];

/**
 * Finding a file in the library.
 *
 * There was nothing: no search, no filter, no sort — with nineteen files it
 * was already a grid of dark rectangles telling you nothing, and every
 * screenshot in the docs is a black image, so they were nineteen identical
 * squares. The name was not written anywhere either, so the only way to
 * find one was to recognise a thumbnail.
 *
 * Both controls narrow the query the SERVER answers, not the page that
 * came back — see MediaFilter. A filter applied on the client would search
 * the newest twenty-four files and stay silent about the rest, which is
 * worse than no search at all.
 */
export function MediaFilterBar({
  value,
  onChange,
  lockedKind,
  showKindChoice = true,
}: MediaFilterBarProps) {
  const { t } = useTranslation();
  const searchId = useId();

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* Named above the field, not only inside it: the placeholder is
          gone as soon as anything is typed, and the label used to be
          hidden altogether. */}
      <div className="flex min-w-[min(14rem,100%)] flex-1 flex-col gap-1">
        <Label htmlFor={searchId}>{t('media.filters.searchLabel')}</Label>
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            className="pl-8"
            value={value.search ?? ''}
            placeholder={t('media.filters.searchPlaceholder')}
            onChange={(event) =>
              onChange({ ...value, search: event.target.value })
            }
          />
        </div>
      </div>
      {showKindChoice && !lockedKind && (
        <ChoiceGroup
          label={t('media.filters.kindLabel')}
          value={value.kind ?? 'all'}
          onValueChange={(kind) =>
            onChange({ ...value, kind: kind === 'all' ? undefined : kind })
          }
          choices={KIND_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
        />
      )}
    </div>
  );
}
