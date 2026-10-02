import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  TileButton,
  tileButtonClassName,
} from '../../components/ui/tile-button';
import { cn } from '../../lib/utils';

/**
 * How an item of a 72px rail looks: a picture with its name under it, the
 * width of the strip, and — for the one you are on, or the one whose panel
 * is open — the accent tint on the picture and the text left in its own
 * colour: blue text on its own 10% tint measured under 4.5:1.
 *
 * No side padding: at 12px "Scorciatoie" is 63px wide, and a tile's own
 * padding left 48 of the strip's 72 — every longer word ended in an
 * ellipsis. The strip is 72px rather than the 48 an icon-only strip would
 * take, and the 24px are the price of nobody having to hover over a row
 * of pictograms to learn which one is which.
 */
const railItemClassName =
  'w-full px-0 font-medium aria-pressed:bg-primary/10 aria-pressed:text-foreground aria-pressed:hover:bg-primary/15 aria-pressed:[&_svg]:text-primary data-[status=active]:bg-primary/10 data-[status=active]:text-foreground data-[status=active]:hover:bg-primary/15 data-[status=active]:[&_svg]:text-primary [&_svg]:size-4';

function RailItemBody({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </>
  );
}

export interface RailButtonProps extends Omit<
  ComponentProps<typeof TileButton>,
  'children'
> {
  /** The word under the picture. Always there: a rail item is never a picture alone. */
  label: string;
  icon: ReactNode;
}

/** A rail item that does something when pressed — opens a panel, a dialog, a search. */
export function RailButton({
  label,
  icon,
  className,
  ...props
}: RailButtonProps) {
  return (
    <TileButton className={cn(railItemClassName, className)} {...props}>
      <RailItemBody icon={icon} label={label} />
    </TileButton>
  );
}

export interface RailAnchorProps {
  href: string;
  label: string;
  icon: ReactNode;
  /** What a screen reader says, and the tooltip: where it goes, in full. */
  fullName: string;
}

/** A rail item that leaves the editor, for another tab: the public site. */
export function RailAnchor({ href, label, icon, fullName }: RailAnchorProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={fullName}
      title={fullName}
      className={cn(tileButtonClassName, railItemClassName)}
    >
      <RailItemBody icon={icon} label={label} />
    </a>
  );
}

export interface RailLinkProps {
  to: string;
  params?: Record<string, string>;
  /** The word under the picture — the short one, if the full name does not fit 68px. */
  label: string;
  icon: ReactNode;
  /** The whole name, when `label` is short: what a screen reader says, and what the tooltip shows. */
  fullName?: string;
}

/** A rail item that goes somewhere, and says whether it is where you are. */
export function RailLink({ to, params, label, icon, fullName }: RailLinkProps) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact: to === '/' }}
      aria-label={fullName}
      title={fullName}
      className={cn(tileButtonClassName, railItemClassName)}
    >
      <RailItemBody icon={icon} label={label} />
    </Link>
  );
}
