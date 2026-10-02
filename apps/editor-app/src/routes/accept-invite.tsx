import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AcceptInviteForm } from '../app/auth/accept-invite-form';

const acceptInviteSearchSchema = z.object({
  inviteToken: z.string(),
});

export const Route = createFileRoute('/accept-invite')({
  validateSearch: acceptInviteSearchSchema,
  component: AcceptInviteRoute,
});

function AcceptInviteRoute() {
  const { inviteToken } = Route.useSearch();
  return <AcceptInviteForm token={inviteToken} />;
}
