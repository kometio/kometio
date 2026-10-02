import { createFileRoute } from '@tanstack/react-router';
import { GeneralSettingsSection } from '../app/settings/general-settings-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/general')(
  siteSettingsRoute('configureSite', GeneralSettingsSection),
);
