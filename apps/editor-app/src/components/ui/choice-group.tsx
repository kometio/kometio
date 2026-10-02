import type { ReactNode } from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface Choice<T extends string> {
  value: T;
  /** The choice's name: shown, or, beside an `icon`, its name and tooltip. */
  label: string;
  /** Drawn instead of the label, which then names it and shows on hover. */
  icon?: ReactNode;
}

export interface ChoiceGroupProps<T extends string> {
  /** What is being chosen, for a screen reader. */
  label: string;
  choices: readonly Choice<T>[];
  /** `null` when none of the choices is the current one. */
  value: T | null;
  onValueChange: (value: T) => void;
  /**
   * `segmented`: a few choices in a strip — the theme, a kind of file.
   * `tiles`: a grid of pictures — an icon, a colour.
   */
  variant?: 'segmented' | 'tiles';
  className?: string;
}

// Keyed on `aria-checked`, not Radix's `data-state`: a choice with an
// icon sits inside a TooltipTrigger, whose own `data-state` ("closed")
// lands on the same button and hid which choice was the current one.
const itemClass = {
  segmented:
    'rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground aria-checked:bg-muted aria-checked:text-foreground',
  tiles:
    'flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted/50 aria-checked:border-primary aria-checked:bg-muted aria-checked:text-foreground',
};

/**
 * One choice among a few, all in view. Radix RadioGroup underneath: the
 * arrows move the choice and the group is one stop in the tab order,
 * which the hand-made `role="radio"` buttons it replaces (the theme in
 * Settings, the kind of file in the media library) did not do — each was
 * a stop of its own and the arrows did nothing.
 */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onValueChange,
  variant = 'segmented',
  className,
}: ChoiceGroupProps<T>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value ?? ''}
      // Radix hands back a string; the choice it belongs to gives it its type.
      onValueChange={(next) => {
        const chosen = choices.find((choice) => choice.value === next);
        if (chosen) onValueChange(chosen.value);
      }}
      orientation="horizontal"
      className={cn(
        variant === 'segmented'
          ? 'flex items-center gap-0.5 rounded-md border p-0.5'
          : 'flex flex-wrap gap-1',
        className,
      )}
    >
      {choices.map((choice) => {
        const item = (
          <RadioGroupPrimitive.Item
            key={choice.value}
            value={choice.value}
            aria-label={choice.icon ? choice.label : undefined}
            className={cn(
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              itemClass[variant],
              // A picture in a strip is a square, the size of the strip's text.
              choice.icon &&
                variant === 'segmented' &&
                'flex size-6 items-center justify-center p-0',
            )}
          >
            {choice.icon ?? choice.label}
          </RadioGroupPrimitive.Item>
        );
        return choice.icon ? (
          <Tooltip key={choice.value}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{choice.label}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
