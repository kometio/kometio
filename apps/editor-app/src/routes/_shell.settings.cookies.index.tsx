import { createFileRoute } from '@tanstack/react-router';
import { CookieBannerView } from '../app/settings/cookie-banner-view';
import { siteSettingsRoute } from './-site-settings-route';

export const Route = createFileRoute('/_shell/settings/cookies/')(
  siteSettingsRoute('configureSite', CookieBannerView),
);
