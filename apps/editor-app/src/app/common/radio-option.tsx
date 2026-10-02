import type { ReactNode } from 'react';
import { Label } from '../../components/ui/label';
import { RadioGroupItem } from '../../components/ui/radio-group';

export interface RadioOptionProps {
  /** Ties the label to the item; unique on the page. */
  id: string;
  value: string;
  label: ReactNode;
  /** What choosing it means, in a sentence: the reason it is a radio and not a switch. */
  description?: ReactNode;
  /** More that belongs to this option — a number of days, say — under its description. */
  children?: ReactNode;
}

/**
 * One option of a `RadioGroup` that needs a sentence of its own: a label,
 * what it does, and the frame that shows which is chosen. The choice
 * between two things that each need explaining is a radio (DESIGN.md);
 * a switch would have held only one of them and left the other in a
 * paragraph nobody connects to it.
 */
export function RadioOption({
  id,
  value,
  label,
  description,
  children,
}: RadioOptionProps) {
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted/40">
      <RadioGroupItem
        value={value}
        id={id}
        className="mt-0.5"
        aria-describedby={description ? descriptionId : undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
