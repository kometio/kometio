import { createFileRoute, redirect } from '@tanstack/react-router';
import { hasPermission } from '@kometio/shared-types';
import { currentSessionQueryOptions } from '../app/auth/use-current-session';
import { SETTINGS_SECTIONS } from '../app/settings/settings-sections';
import { requireAuth } from './-require-auth';

export const Route = createFileRoute('/_shell/settings/')({
  // No section of its own: it opens on the first one the role is offered,
  // which is General for an admin and Collections for a publisher.
  beforeLoad: async ({ context }) => {
    const session = await requireAuth(() =>
      context.queryClient.ensureQueryData(currentSessionQueryOptions()),
    );
    const first = SETTINGS_SECTIONS.find((section) =>
      hasPermission(session.role, section.permission),
    );
    throw redirect({ to: first?.to ?? '/' });
  },
});
