import { createFileRoute } from '@tanstack/react-router';
import { LocaleSettingsSection } from '../app/settings/locale-settings-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/languages')(
  siteSettingsRoute('configureSite', LocaleSettingsSection),
);
