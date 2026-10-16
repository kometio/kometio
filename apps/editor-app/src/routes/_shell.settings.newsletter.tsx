import { createFileRoute } from '@tanstack/react-router';
import { NewsletterSettingsSection } from '../app/settings/newsletter-settings-section';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/newsletter')(
  siteSettingsRoute('configureSite', NewsletterSettingsSection),
);
