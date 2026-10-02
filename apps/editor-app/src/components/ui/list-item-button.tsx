import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * One row of a list or a menu that does something when chosen: pick a
 * page, open an import, insert a block. Its state is drawn from its ARIA
 * state — `aria-current="true"` (where you are) and `aria-pressed`
 * (chosen) — so what a screen reader hears and what the
 * row shows cannot drift apart. An `aria-expanded` row (a disclosure)
 * needs no fill: its chevron says it.
 *
 * Twelve lists drew this by hand, in four paddings and two hovers, most
 * with no focus ring of their own.
 */
const listItemButtonVariants = cva(
  'flex w-full min-w-0 items-center gap-2 text-left text-sm transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      inset: {
        /** Inside a menu or a popover, which has its own padding. */
        menu: 'rounded-md px-2 py-1.5',
        /** A row of a bordered list (`divide-y rounded-md border`). */
        row: 'justify-between gap-3 px-3 py-2',
        /** The whole of an item whose container draws the frame and the state. */
        none: '',
      },
      tone: {
        default: '',
        destructive: 'text-destructive',
      },
    },
    // The fills belong to a row that draws itself. A frame-less item is
    // drawn by its container, and a fill of its own would fight it.
    compoundVariants: [
      {
        inset: ['menu', 'row'],
        tone: 'default',
        class:
          'hover:bg-muted aria-pressed:bg-muted aria-[current=true]:bg-muted aria-[current=true]:font-medium',
      },
      {
        inset: ['menu', 'row'],
        tone: 'destructive',
        class: 'hover:bg-destructive/10',
      },
    ],
    defaultVariants: { inset: 'menu', tone: 'default' },
  },
);

function ListItemButton({
  className,
  inset,
  tone,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof listItemButtonVariants>) {
  return (
    <button
      data-slot="list-item-button"
      type={type}
      className={cn(listItemButtonVariants({ inset, tone }), className)}
      {...props}
    />
  );
}

export { ListItemButton, listItemButtonVariants };
