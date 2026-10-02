import { createFileRoute, redirect } from '@tanstack/react-router';

// Moved under /settings. The old address stays as a redirect, so a
// bookmark or a link somebody sent still opens the screen.
export const Route = createFileRoute('/_shell/integrations/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/integrations' });
  },
});
