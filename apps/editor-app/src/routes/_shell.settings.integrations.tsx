import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsView } from '../app/settings/integrations-view';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/integrations')(
  siteSettingsRoute('configureSite', IntegrationsView),
);
