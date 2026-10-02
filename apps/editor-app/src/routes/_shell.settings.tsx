import { createFileRoute } from '@tanstack/react-router';
import { SettingsLayout } from '../app/settings/settings-layout';
import { requireAnyPermission } from './-require-permission';

export const Route = createFileRoute('/_shell/settings')({
  staticData: { titleKey: 'shell.nav.settings' },
  // Every section asks for its own permission too; this keeps out a role
  // that has none of them, before the menu is drawn empty.
  beforeLoad: ({ context }) =>
    requireAnyPermission(context.queryClient, [
      'configureSite',
      'changeLiveSite',
    ]),
  component: SettingsLayout,
});
