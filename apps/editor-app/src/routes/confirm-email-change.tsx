import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ConfirmEmailChangeView } from '../app/auth/confirm-email-change-view';

const confirmEmailChangeSearchSchema = z.object({
  changeToken: z.string(),
});

export const Route = createFileRoute('/confirm-email-change')({
  validateSearch: confirmEmailChangeSearchSchema,
  component: ConfirmEmailChangeRoute,
});

function ConfirmEmailChangeRoute() {
  const { changeToken } = Route.useSearch();
  return <ConfirmEmailChangeView token={changeToken} />;
}
