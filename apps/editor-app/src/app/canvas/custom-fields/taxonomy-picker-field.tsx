import { useQuery } from '@tanstack/react-query';
import { firstNamed } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { siteQueryOptions } from '../../settings/site-queries';
import { taxonomiesQueryOptions } from '../../taxonomies/taxonomies-queries';
import { OptionsSelect } from '../../../components/ui/select';

export interface TaxonomyPickerFieldProps {
  /** An id, or anything else meaning none: a block saved before the field existed has no key. */
  value: unknown;
  onChange: (value: string | null) => void;
  /** The field's label — see ControlComponent in custom-field-controls.tsx. */
  label?: string;
}

/**
 * Which dimension a TermList offers — Category, Family, Tag.
 *
 * A dimension and not a term, which is the whole difference from
 * TermPickerField: a filter is "let the reader choose among these", so
 * what it stores is the question, and the answers are whatever terms
 * exist when somebody reads the page.
 */
export function TaxonomyPickerField({
  value,
  onChange,
  label,
}: TaxonomyPickerFieldProps) {
  const { t } = useTranslation();
  const { data: site } = useQuery(siteQueryOptions());
  const { data: taxonomies } = useQuery({
    ...taxonomiesQueryOptions(site?.id ?? ''),
    enabled: Boolean(site),
  });

  return (
    <OptionsSelect
      aria-label={label}
      value={typeof value === 'string' ? value : ''}
      onValueChange={(next) => onChange(next || null)}
      options={[
        { value: '', label: t('blocks.termList.picker.none') },
        ...(taxonomies ?? []).map((taxonomy) => ({
          value: taxonomy.id,
          label:
            firstNamed(taxonomy.name) || t('blocks.termList.picker.unnamed'),
        })),
      ]}
    />
  );
}
