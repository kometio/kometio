import { createFileRoute, redirect } from '@tanstack/react-router';

// Moved under /settings: see the integrations route.
export const Route = createFileRoute('/_shell/cookies/legal-documents')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/cookies/legal-documents' });
  },
});
