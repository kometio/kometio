import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

export interface AuthPageProps {
  /** The page's `h1`. */
  title: string;
  description: string;
  /** `md` for the one page that holds a whole form's worth of fields (the first-run setup). */
  width?: 'sm' | 'md';
  children: ReactNode;
}

/**
 * The page around a screen a person reaches before they are in the editor:
 * sign in, forgot and reset the password, accept an invitation, confirm an
 * address, the first-run setup. A card in the middle of a `<main>`, with its
 * title as the page's `h1`.
 *
 * Seven of these had the same wrapper copied into each, as a `div` with a
 * card whose title was an `h2` — so none of them had a main landmark or a
 * level-one heading (axe: landmark-one-main, page-has-heading-one, region).
 */
export function AuthPage({
  title,
  description,
  width = 'sm',
  children,
}: AuthPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className={cn('w-full', width === 'md' ? 'max-w-md' : 'max-w-sm')}>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
