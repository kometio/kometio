import { DatePicker } from '../../../components/ui/date-picker';
import { Input } from '../../../components/ui/input';

export interface DateTimeFieldProps {
  value: unknown;
  onChange: (value: string) => void;
  /** The field's label — see ControlComponent in custom-field-controls.tsx. */
  label?: string;
}

/**
 * A date, stored as `YYYY-MM-DD` — the one spelling that sorts as text,
 * compares as text and means the same day in every language. Picked from
 * a calendar (DatePicker), which writes exactly that whatever the editor's
 * language shows: a date typed as "13/09/2026" means one day in Rome and
 * none in Boston, so nothing is ever typed.
 *
 * Cleared, it is the empty string, which every block reading one takes as
 * "no date" — the same empty a text field leaves.
 */
export function DateField({ value, onChange, label }: DateTimeFieldProps) {
  return (
    <DatePicker
      aria-label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
    />
  );
}

/** A time of day, stored as `HH:MM` for the date's reason. Empty is "all day". */
export function TimeField({ value, onChange, label }: DateTimeFieldProps) {
  return (
    <Input
      aria-label={label}
      type="time"
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
