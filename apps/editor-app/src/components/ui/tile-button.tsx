import * as React from 'react';

import { cn } from '@/lib/utils';

/** How a tile looks: the button's, and the link's that stands in a rail. */
export const tileButtonClassName =
  'group flex flex-col items-center justify-center gap-1.5 rounded-md border border-transparent p-2 text-center text-xs leading-tight text-muted-foreground transition-colors outline-none hover:border-border hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

/**
 * A picture with its name under it, in a grid, that does something when
 * chosen: a block to insert, an icon to use. The frame shows on hover and
 * on keyboard focus only, so a grid of forty reads as pictures and not as
 * forty boxes. The block palette and the icon picker drew it twice, with
 * two hovers and no focus ring.
 */
function TileButton({
  className,
  type = 'button',
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="tile-button"
      type={type}
      className={cn(tileButtonClassName, className)}
      {...props}
    />
  );
}

export { TileButton };
