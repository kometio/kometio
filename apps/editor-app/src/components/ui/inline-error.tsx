import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface InlineErrorProps {
  children: ReactNode;
  /** For a field's error: the id its control points at with `aria-describedby`. */
  id?: string;
  /** Layout only (a width, a margin) — never a size or a colour. */
  className?: string;
}

/**
 * An error shown where it happened: under the field it is about, or under
 * the form or list whose action failed. Announced when it appears
 * (`role="alert"`), in the destructive colour at the text size of what it
 * sits under. Nothing is drawn when there is nothing to say.
 *
 * One primitive for what was forty-six hand-written paragraphs that had
 * already drifted: three sizes, two class orders, and four that a screen
 * reader never announced (DESIGN.md §4).
 */
export function InlineError({ children, id, className }: InlineErrorProps) {
  if (children === null || children === undefined || children === '') {
    return null;
  }
  return (
    <p
      id={id}
      role="alert"
      className={cn('text-sm text-destructive', className)}
    >
      {children}
    </p>
  );
}
