import type { ReactNode } from 'react';
import { TooltipProvider } from '../components/ui/tooltip';
import { ToastProvider } from '../app/shell/toast-provider';

/**
 * What a component that says "Saved" or "Deleted" through a toast needs
 * around it in a test: the provider, and the tooltip provider the toast's
 * own dismiss button needs (the app mounts both at its root, main.tsx).
 * A spec that asserts the toast finds it by its words, like a reader would.
 */
export function WithToasts({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
