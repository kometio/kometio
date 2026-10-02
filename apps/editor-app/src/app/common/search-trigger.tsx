import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

export interface SearchTriggerProps extends Omit<
  ComponentProps<typeof Button>,
  'variant' | 'children'
> {
  /** What it says while there is room: what can be found, and the key that opens it. */
  label: string;
  /** What it says when there is not — one word, and no key. */
  shortLabel?: string;
  /** The key combination, written for this machine (`formatShortcut`). */
  shortcut: string;
}

/**
 * The box that looks like a search field and is a button: a click opens
 * the command menu, which is where the typing happens. The canvas's bar and
 * the shell's sidebar draw it the same, because it is the same thing.
 *
 * No fill in the light theme: with one, the muted text on it measured under
 * 4.5:1 (axe, on the painted pixels).
 */
export function SearchTrigger({
  label,
  shortLabel,
  shortcut,
  className,
  ...props
}: SearchTriggerProps) {
  return (
    <Button
      variant="outline"
      aria-haspopup="dialog"
      className={cn(
        // `bg-transparent` over the variant's `bg-background`: the look of the
        // editor's own fields, which are not filled in the light theme.
        'justify-start bg-transparent font-normal text-muted-foreground',
        className,
      )}
      {...props}
    >
      <Search />
      <span className={cn('truncate', shortLabel && 'max-lg:hidden')}>
        {label}
      </span>
      {shortLabel && <span className="lg:hidden">{shortLabel}</span>}
      <kbd
        className={cn(
          'ml-auto rounded-sm border px-1 font-sans text-xs',
          shortLabel && 'max-lg:hidden',
        )}
      >
        {shortcut}
      </kbd>
    </Button>
  );
}
