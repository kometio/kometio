import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: ReactNode;
  /** One sentence under the title, when the screen needs one. */
  description?: ReactNode;
  /** The screen's own actions, at the right of the title. */
  actions?: ReactNode;
}

/**
 * The top of every screen in the shell. Twelve screens used to write their
 * own: some titles were tracked tight and some not, two screens added
 * their own padding on top of the shell's and started 24px lower and to
 * the right, and Media put its one action in the toolbar below instead of
 * beside the title — so the title moved every time you changed section.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
