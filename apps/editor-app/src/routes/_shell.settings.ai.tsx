import { createFileRoute } from '@tanstack/react-router';
import type { SiteRecord } from '@kometio/api-contracts';
import { AiSettingsSection } from '../app/settings/ai-settings-section';
import { siteSettingsRoute } from './-site-settings-route';

function AiSettingsOfSite({ site }: { site: SiteRecord }) {
  return <AiSettingsSection siteId={site.id} />;
}

export const Route = createFileRoute('/_shell/settings/ai')(
  siteSettingsRoute('configureSite', AiSettingsOfSite),
);
