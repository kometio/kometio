import { Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  getLocaleDisplayName,
  localeSettingsSchema,
  type LocaleSettings,
} from '@kometio/shared-types';
import { type SiteRecord } from '@kometio/api-contracts';
import { Label } from '../../components/ui/label';
import { RadioGroup } from '../../components/ui/radio-group';
import { RadioOption } from '../common/radio-option';
import { updateLocaleSettings } from '../../lib/sites-api-client';
import { LocaleListEditor } from './locale-list-editor';
import { SettingsSection } from './settings-section';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface LocaleSettingsSectionProps {
  site: SiteRecord;
}

function toFormValues(site: SiteRecord): LocaleSettings {
  return {
    enabledLocales: site.enabledLocales,
    defaultLocale: site.defaultLocale,
    untranslatedPageFallback: site.untranslatedPageFallback,
  };
}

export function LocaleSettingsSection({ site }: LocaleSettingsSectionProps) {
  const { t, i18n } = useTranslation();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.languages'),
    form: { resolver: zodResolver(localeSettingsSchema) },
    toFormValues,
    toChange: (values: LocaleSettings) => values,
    send: updateLocaleSettings,
    // A language that leaves drops out of the language switcher and the
    // sitemap. Nothing is deleted — the texts stay, and come back with the
    // language — and the question says both.
    confirmBeforeSave: (values, saved) => {
      const removed = saved.enabledLocales.filter(
        (locale) => !values.enabledLocales.includes(locale),
      );
      if (removed.length === 0) return null;
      const languages = removed
        .map((locale) => getLocaleDisplayName(locale, i18n.language))
        .join(', ');
      return {
        title: t('localeSettings.removeConfirm.title', {
          count: removed.length,
          languages,
        }),
        description: t('localeSettings.removeConfirm.description', {
          count: removed.length,
          languages,
        }),
        actionLabel: t('localeSettings.removeConfirm.action', {
          count: removed.length,
        }),
      };
    },
  });
  const { control, setValue } = form;

  const enabledLocales = useWatch({ control, name: 'enabledLocales' });
  const defaultLocale = useWatch({ control, name: 'defaultLocale' });

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.languages')}
      description={t('settings.sections.languages.description')}
      canSave={enabledLocales.length > 0}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>{t('localeSettings.localesLabel')}</Label>
          <LocaleListEditor
            enabledLocales={enabledLocales}
            defaultLocale={defaultLocale}
            onChange={(locales, nextDefault) => {
              // `shouldDirty`: a value set from code, unlike one typed in a
              // field, does not count as a change unless it is asked to —
              // and the bar that saves only shows for a change.
              setValue('enabledLocales', locales, { shouldDirty: true });
              setValue('defaultLocale', nextDefault, { shouldDirty: true });
            }}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            {t('localeSettings.fallbackLabel')}
          </legend>
          <Controller
            control={control}
            name="untranslatedPageFallback"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(next) =>
                  field.onChange(
                    next === 'not-available'
                      ? 'not-available'
                      : 'redirect-to-default',
                  )
                }
              >
                <RadioOption
                  id="locale-fallback-redirect"
                  value="redirect-to-default"
                  label={t('localeSettings.fallbackRedirectLabel')}
                  description={t('localeSettings.fallbackRedirectDescription')}
                />
                <RadioOption
                  id="locale-fallback-not-available"
                  value="not-available"
                  label={t('localeSettings.fallbackNotAvailableLabel')}
                  description={t(
                    'localeSettings.fallbackNotAvailableDescription',
                  )}
                />
              </RadioGroup>
            )}
          />
        </fieldset>
      </div>
    </SettingsSection>
  );
}
