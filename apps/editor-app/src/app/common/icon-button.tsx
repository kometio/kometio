import type { ComponentProps, ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';

export interface IconButtonProps extends ComponentProps<typeof Button> {
  label: string;
  /**
   * The key combination that does the same thing, shown in the tooltip.
   *
   * Deliberately not part of `aria-label`: the accessible name should be
   * what the button does, and a screen reader announcing "Undo ⌘Z" reads
   * the glyphs out. It is here because a tooltip is where somebody finds
   * out a shortcut exists at all — none of the app's strings mentioned one.
   */
  shortcut?: string;
  children: ReactNode;
}

export function IconButton({
  label,
  shortcut,
  children,
  // A button in a form submits it, unless it says it does not. An icon
  // that removes a row or opens a menu is never the form's Save, and a
  // click on one that saved the whole form was the surprise this default
  // is for. `type="submit"` is still one prop away, like ListItemButton
  // and TileButton.
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          type={type}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && (
          <kbd className="ml-1.5 rounded-sm bg-background/20 px-1 font-sans text-xs">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
