import { createFileRoute } from '@tanstack/react-router';
import { SeoSettingsSection } from '../app/settings/seo-settings-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/seo')(
  siteSettingsRoute('configureSite', SeoSettingsSection),
);
