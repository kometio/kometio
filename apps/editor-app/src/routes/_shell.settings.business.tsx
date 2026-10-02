import { createFileRoute } from '@tanstack/react-router';
import { BusinessInfoSection } from '../app/settings/business-info-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/business')(
  siteSettingsRoute('configureSite', BusinessInfoSection),
);
