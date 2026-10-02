import { useId } from 'react';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `current-password` or `new-password`: what a password manager fills, and what it offers to save. */
  autoComplete: 'current-password' | 'new-password';
  /** What the field asks of the password, before it is typed. */
  hint?: string;
  /** What is wrong with it, said under the field and tied to it. */
  error?: string;
  autoFocus?: boolean;
}

/**
 * A password field of a dialog: the label above, the hint and the error
 * below and tied with `aria-describedby` (DESIGN.md §4, Fields).
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  autoFocus,
}: PasswordFieldProps) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <InlineError id={`${id}-error`}>{error}</InlineError>
    </div>
  );
}
