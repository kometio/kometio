import { useQuery } from '@tanstack/react-query';
import { pickedSectionSchema, type PickedSection } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { siteQueryOptions } from '../../settings/site-queries';
import { reusableSectionsQueryOptions } from '../../sections/reusable-sections-queries';
import { OptionsSelect } from '../../../components/ui/select';
import { readPickedValue } from './read-picked-value';

export interface SectionPickerFieldProps {
  /** Checked, not assumed — see `readPickedValue`. */
  value: unknown;
  onChange: (value: PickedSection | null) => void;
  /** The field's label — see ControlComponent in custom-field-controls.tsx. */
  label?: string;
}

/**
 * Which reusable section this instance shows (docs/adr/0059).
 *
 * Only `shared` sections are offered. A template is not a thing a page can
 * point at — inserting one COPIES its blocks and leaves nothing behind to
 * reference — so listing templates here would offer a choice that cannot
 * be honoured.
 */
export function SectionPickerField({
  value,
  onChange,
  label,
}: SectionPickerFieldProps) {
  const { t } = useTranslation();
  const { data: site } = useQuery(siteQueryOptions());
  const { data: sections } = useQuery({
    ...reusableSectionsQueryOptions(site?.id ?? ''),
    enabled: Boolean(site),
  });
  const shared = (sections ?? []).filter(
    (section) => section.kind === 'shared',
  );

  return (
    <OptionsSelect
      aria-label={label}
      value={readPickedValue(pickedSectionSchema, value)?.sectionId ?? ''}
      onValueChange={(sectionId) => {
        const picked = shared.find((section) => section.id === sectionId);
        onChange(
          picked ? { sectionId: picked.id, sectionName: picked.name } : null,
        );
      }}
      options={[
        { value: '', label: t('blocks.section.picker.none') },
        ...shared.map((section) => ({
          value: section.id,
          label:
            section.status === 'draft'
              ? `${section.name} — ${t('blocks.section.picker.unpublished')}`
              : section.name,
        })),
      ]}
    />
  );
}
