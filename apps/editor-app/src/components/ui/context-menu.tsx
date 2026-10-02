import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * The menu a right-click (or the keyboard's menu key, or a long press)
 * opens on the thing under it. Radix underneath: it opens at the pointer
 * and stays on screen at the edges, the arrows and typing a letter move
 * through its items, Escape and a click elsewhere close it, and the focus
 * goes back where it was. The layers' own menu did the closing by hand and
 * none of the rest: at the right edge of the screen its items were cut in
 * half, and the arrows did nothing in a `role="menu"`.
 */
function ContextMenu(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Root>,
) {
  // Not modal: a modal menu hides the rest of the page from assistive
  // technology while it is open, and a click outside only closes it
  // either way.
  return (
    <ContextMenuPrimitive.Root
      data-slot="context-menu"
      modal={false}
      {...props}
    />
  );
}

function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>,
) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  );
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        collisionPadding={8}
        className={cn(
          'z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  /** `destructive` for Delete: red, and a red highlight. */
  variant?: 'default' | 'destructive';
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
        variant === 'destructive'
          ? 'text-destructive data-highlighted:bg-destructive/10'
          : 'data-highlighted:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger };
