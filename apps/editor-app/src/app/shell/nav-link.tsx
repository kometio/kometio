import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

export interface NavLinkProps {
  to: string;
  params?: Record<string, string>;
  icon: LucideIcon;
  children: ReactNode;
}

/**
 * A link that says whether it is where you are, and the only place that
 * look is decided: the sidebar's entries and the settings area's own menu
 * are drawn with it, so the two cannot drift.
 *
 * The eleven links each carried the same class list and none of them
 * said which screen you were on: hovering told you what you were about
 * to click, and after the click nothing changed — the sidebar looked
 * identical on every page of the app.
 *
 * `data-status="active"` is the router's own answer, so "which one is
 * current" is read from the URL rather than tracked in state that can
 * disagree with it. `exact` for the dashboard alone: its path is `/`, a
 * prefix of every other route, so without it every screen would light up
 * the dashboard as well.
 *
 * It used to arrive as `activeProps.className`, which the router
 * CONCATENATES onto `className` — so the active link carried both
 * `text-muted-foreground` and `text-foreground`, and the order of two
 * class names inside one attribute decides nothing at all. Measured: the
 * active item and every inactive one computed to the same
 * `oklch(0.708 0 0)`, and only the background said where you were. A
 * variant instead of a second class: `[data-status="active"]` adds an
 * attribute selector to the class, so it wins on specificity rather than
 * on luck.
 */
export function NavLink({ to, params, icon: Icon, children }: NavLinkProps) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact: to === '/' }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[status=active]:bg-muted data-[status=active]:text-foreground"
    >
      <Icon className="size-4" />
      {children}
    </Link>
  );
}
