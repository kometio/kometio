import { Textarea } from '../../../components/ui/textarea';
import { useTranslation } from '../../../lib/use-translation';

export interface FeatureListFieldProps {
  /** Checked, not assumed: a plan saved before it had features holds no key at all. */
  value: unknown;
  onChange: (value: string[]) => void;
  /** The field's label — see ControlComponent in custom-field-controls.tsx. */
  label?: string;
}

/** A pricing plan has no native field for a list of strings — a single `<textarea>`, one feature per line, split/join on "\n". */
export function FeatureListField({
  value,
  onChange,
  label,
}: FeatureListFieldProps) {
  const { t } = useTranslation();
  const lines = Array.isArray(value)
    ? value.filter((line): line is string => typeof line === 'string')
    : [];
  return (
    <Textarea
      aria-label={label}
      value={lines.join('\n')}
      onChange={(event) => onChange(event.target.value.split('\n'))}
      rows={5}
      placeholder={t('canvas.featureList.placeholder')}
    />
  );
}
