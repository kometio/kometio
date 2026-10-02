import { useId } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SiteRecord } from '@kometio/api-contracts';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { updateSeoSettings } from '../../lib/sites-api-client';
import { SettingsSection } from './settings-section';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface SeoSettingsSectionProps {
  site: SiteRecord;
}

interface SeoSettingsFormValues {
  searchEngineIndexingEnabled: boolean;
}

function toFormValues(site: SiteRecord): SeoSettingsFormValues {
  return { searchEngineIndexingEnabled: site.searchEngineIndexingEnabled };
}

export function SeoSettingsSection({ site }: SeoSettingsSectionProps) {
  const { t } = useTranslation();
  const switchId = useId();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.seo'),
    toFormValues,
    toChange: (values: SeoSettingsFormValues) => values,
    send: updateSeoSettings,
    // Turning it off is the one change here that is not a matter of taste:
    // the site drops out of the search results.
    confirmBeforeSave: (values, saved) =>
      saved.searchEngineIndexingEnabled && !values.searchEngineIndexingEnabled
        ? {
            title: t('seoSettings.turnOffConfirm.title'),
            description: t('seoSettings.turnOffConfirm.description'),
            actionLabel: t('seoSettings.turnOffConfirm.action'),
          }
        : null,
  });

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.seo')}
      description={t('settings.sections.seo.description')}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            {/* The label is the switch's own, so a click on the words
                turns it too. */}
            <Label htmlFor={switchId}>{t('seoSettings.indexingLabel')}</Label>
            <span className="text-xs text-muted-foreground">
              {t('seoSettings.indexingDescription')}
            </span>
          </div>
          <Controller
            control={form.control}
            name="searchEngineIndexingEnabled"
            render={({ field }) => (
              <Switch
                id={switchId}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('seoSettings.indexingDisclaimer')}
        </p>
      </div>
    </SettingsSection>
  );
}
