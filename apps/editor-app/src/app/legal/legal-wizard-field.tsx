import { useId, type ReactNode } from 'react';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';

/** What a control needs to say which field it is and what is wrong with it. */
export interface WizardControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

/** The ids a label, a hint and an error hang from, and what to tell the control. */
function useFieldIds(
  id: string | undefined,
  hasError: boolean,
  hasHint: boolean,
) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy =
    [hasHint ? hintId : null, hasError ? errorId : null]
      .filter((part) => part !== null)
      .join(' ') || undefined;
  return { controlId, hintId, errorId, describedBy };
}

export interface WizardFieldProps {
  /** The control's id; the label points at it. */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  /** What is wrong with the answer, from `formState.errors`. */
  error: string | undefined;
  children: (control: WizardControlProps) => ReactNode;
}

/**
 * One question of the wizard: its label, an optional line about what the
 * answer is for, the control, and — when the answer is missing or wrong —
 * the reason, under the control it is about and tied to it
 * (`aria-invalid`, `aria-describedby`) so a screen reader says it too.
 *
 * The control is handed what it needs rather than being cloned into,
 * because it is an `Input` in one place and a `Select` in another.
 */
export function WizardField({
  id,
  label,
  hint,
  error,
  children,
}: WizardFieldProps) {
  const { controlId, hintId, errorId, describedBy } = useFieldIds(
    id,
    error !== undefined,
    hint !== undefined,
  );
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId}>{label}</Label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {children({
        id: controlId,
        'aria-invalid': error !== undefined ? true : undefined,
        'aria-describedby': describedBy,
      })}
      <InlineError id={errorId}>{error}</InlineError>
    </div>
  );
}

export interface WizardChoicesProps {
  label: ReactNode;
  hint?: ReactNode;
  error: string | undefined;
  children: (control: Omit<WizardControlProps, 'id'>) => ReactNode;
}

/**
 * The same for a group of boxes: "which documents", "which languages". The
 * group is named by its legend, and each box says it is invalid when the
 * group is, so the first of them is where the focus lands.
 */
export function WizardChoices({
  label,
  hint,
  error,
  children,
}: WizardChoicesProps) {
  const { hintId, errorId, describedBy } = useFieldIds(
    undefined,
    error !== undefined,
    hint !== undefined,
  );
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describedBy}>
      <legend className="mb-2 text-sm leading-none font-medium">{label}</legend>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {children({
          'aria-invalid': error !== undefined ? true : undefined,
          'aria-describedby': describedBy,
        })}
      </div>
      <InlineError id={errorId}>{error}</InlineError>
    </fieldset>
  );
}
