import { useQueries, useQuery } from '@tanstack/react-query';
import { firstNamed } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { siteQueryOptions } from '../../settings/site-queries';
import {
  taxonomiesQueryOptions,
  termsQueryOptions,
} from '../../taxonomies/taxonomies-queries';
import { OptionsSelect } from '../../../components/ui/select';

export interface TermPickerFieldProps {
  /** An id, or anything else meaning none: a block saved before the field existed has no key. */
  value: unknown;
  onChange: (value: string | null) => void;
  /** The field's label — see ControlComponent in custom-field-controls.tsx. */
  label?: string;
}

/**
 * Which term a PageGrid lists (docs/adr/0064).
 *
 * Grouped by dimension, because a bare list of terms is ambiguous the
 * moment a site has two of them: "Espresso" under Category and under
 * Family are different answers to the same word.
 *
 * The term's name is shown in whatever language it has one — the picker
 * is the agency's tool and the block stores an id, so a term named only
 * in Italian is still pickable while editing the English page.
 */
export function TermPickerField({
  value,
  onChange,
  label,
}: TermPickerFieldProps) {
  const { t } = useTranslation();
  const { data: site } = useQuery(siteQueryOptions());
  const { data: taxonomies } = useQuery({
    ...taxonomiesQueryOptions(site?.id ?? ''),
    enabled: Boolean(site),
  });
  const termQueries = useQueries({
    queries: (taxonomies ?? []).map((taxonomy) =>
      termsQueryOptions(taxonomy.id),
    ),
  });

  return (
    <OptionsSelect
      aria-label={label}
      value={typeof value === 'string' ? value : ''}
      onValueChange={(next) => onChange(next || null)}
      options={[{ value: '', label: t('blocks.pageGrid.picker.none') }]}
      groups={(taxonomies ?? []).map((taxonomy, index) => ({
        label: firstNamed(taxonomy.name) || t('blocks.pageGrid.picker.unnamed'),
        options: (termQueries[index]?.data ?? []).map((term) => ({
          value: term.id,
          label: firstNamed(term.name) || t('blocks.pageGrid.picker.unnamed'),
        })),
      }))}
    />
  );
}
