import { useId } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type {
  TrackerDomainEntry,
  TrackerScriptEntry,
} from '@kometio/shared-types';
import type { SiteRecord } from '@kometio/api-contracts';
import { Label } from '../../components/ui/label';
import { ConsentBannerWarning } from './consent-banner-warning';
import { Textarea } from '../../components/ui/textarea';
import { TrackerDomainListEditor } from './tracker-domain-list-editor';
import { TrackerScriptListEditor } from './tracker-script-list-editor';
import { SettingsSection } from './settings-section';
import { updateThemeSettings as sendThemeSettings } from '../../lib/sites-api-client';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface IntegrationsViewProps {
  site: SiteRecord;
}

interface IntegrationsFormValues {
  headScript: string;
  bodyScript: string;
  allowedTrackerDomains: TrackerDomainEntry[];
  trackerScripts: TrackerScriptEntry[];
}

function toFormValues(site: SiteRecord): IntegrationsFormValues {
  return {
    headScript: site.themeHeadScript ?? '',
    bodyScript: site.themeBodyScript ?? '',
    allowedTrackerDomains: site.themeAllowedTrackerDomains,
    trackerScripts: site.themeTrackerScripts,
  };
}

/**
 * A section of the settings area, same reasoning as StyleView (docs/adr/0021's
 * own precedent) — third-party scripts/trackers are their own concern, not
 * "style". Head/body script fields lived in StyleView until ADR-0031 moved
 * them here alongside the new tracker domain whitelist: both are about
 * what third-party code this site runs and talks to, gated by the same
 * admin-only endpoint, independent of StyleView's own `overridesEnabled`
 * switch (a tracker shouldn't stop running just because someone toggled
 * off color/font overrides).
 */
export function IntegrationsView({ site }: IntegrationsViewProps) {
  const { t } = useTranslation();
  const scriptsId = useId();
  const domainsId = useId();
  const consentId = useId();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.integrations'),
    toFormValues,
    toChange: (values: IntegrationsFormValues) => ({
      // Owned by StyleView, not this page — round-tripped unchanged since
      // updateThemeSettings always replaces the whole object (see
      // Site.updateThemeSettings, no partial-patch support), so anything
      // not sent back is cleared.
      primaryColor: site.themePrimaryColor,
      secondaryColor: site.themeSecondaryColor,
      fontFamily: site.themeFontFamily,
      customCss: site.themeCustomCss,
      contentWidth: site.themeContentWidth,
      faviconUrl: site.themeFaviconUrl,
      overridesEnabled: site.themeOverridesEnabled,
      headScript: values.headScript.trim() || null,
      bodyScript: values.bodyScript.trim() || null,
      allowedTrackerDomains: values.allowedTrackerDomains,
      trackerScripts: values.trackerScripts,
    }),
    // The save may auto-detect a known vendor (docs/adr/0039) and move it
    // out of headScript/bodyScript into themeTrackerScripts: the form takes
    // the server's actual result as its saved state (useSiteSettingsForm
    // does), not what was submitted, or it would keep showing the
    // now-duplicated snippet.
    send: sendThemeSettings,
  });
  const { register, control, setValue } = form;
  const allowedTrackerDomains = useWatch({
    control,
    name: 'allowedTrackerDomains',
  });
  const trackerScripts = useWatch({ control, name: 'trackerScripts' });

  return (
    <SettingsSection
      {...section}
      title={t('integrations.title')}
      description={t('integrations.intro')}
    >
      {/* First, above every field: scripts that will never run are the
          one thing on this page that is wrong rather than merely unset. */}
      <ConsentBannerWarning site={site} />

      <section aria-labelledby={scriptsId} className="flex flex-col gap-4">
        <h3 id={scriptsId} className="text-sm font-semibold">
          {t('integrations.groups.scripts')}
        </h3>
        <div className="flex flex-col gap-2">
          <Label htmlFor="integrations-head-script">
            {t('integrations.headScriptLabel')}
          </Label>
          <Textarea
            id="integrations-head-script"
            rows={3}
            className="font-mono text-xs"
            aria-describedby="integrations-head-script-hint"
            {...register('headScript')}
          />
          <p
            id="integrations-head-script-hint"
            className="text-xs text-muted-foreground"
          >
            {t('integrations.headScriptHint')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="integrations-body-script">
            {t('integrations.bodyScriptLabel')}
          </Label>
          <Textarea
            id="integrations-body-script"
            rows={3}
            className="font-mono text-xs"
            aria-describedby="integrations-body-script-hint"
            {...register('bodyScript')}
          />
          <p
            id="integrations-body-script-hint"
            className="text-xs text-muted-foreground"
          >
            {t('integrations.bodyScriptHint')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('integrations.scriptDisclaimer')}
        </p>
      </section>

      <section aria-labelledby={domainsId} className="flex flex-col gap-2">
        <h3 id={domainsId} className="text-sm font-semibold">
          {t('integrations.groups.domains')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('integrations.domainsHint')}
        </p>
        <TrackerDomainListEditor
          entries={allowedTrackerDomains}
          onChange={(next) =>
            setValue('allowedTrackerDomains', next, { shouldDirty: true })
          }
        />
        <p className="text-xs text-muted-foreground">
          {t('integrations.trackerDomainsDisclaimer')}
        </p>
      </section>

      <section aria-labelledby={consentId} className="flex flex-col gap-2">
        <h3 id={consentId} className="text-sm font-semibold">
          {t('integrations.groups.consent')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('integrations.consentHint')}
        </p>
        <TrackerScriptListEditor
          entries={trackerScripts}
          onChange={(next) =>
            setValue('trackerScripts', next, { shouldDirty: true })
          }
        />
        <p className="text-xs text-muted-foreground">
          {t('integrations.trackerScriptsDisclaimer')}
        </p>
      </section>
    </SettingsSection>
  );
}
