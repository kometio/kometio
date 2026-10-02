import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { isSiteDomain } from '@kometio/shared-types';
import type { SiteRecord } from '@kometio/api-contracts';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { updateGeneralSettings } from '../../lib/sites-api-client';
import { cleanDomainInput } from './domain-input';
import { SettingsSection } from './settings-section';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface GeneralSettingsSectionProps {
  site: SiteRecord;
}

interface GeneralSettingsFormValues {
  name: string;
  domain: string;
}

function toFormValues(site: SiteRecord): GeneralSettingsFormValues {
  return { name: site.name, domain: site.domain ?? '' };
}

export function GeneralSettingsSection({ site }: GeneralSettingsSectionProps) {
  const { t } = useTranslation();
  // What the last edit of the domain took out of what was typed, to say so
  // under the field. Only shown while there is something unsaved.
  const [removed, setRemoved] = useState<string[]>([]);
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.general'),
    // A domain is judged once the field has been left, and on every
    // keystroke after that: "www." is not wrong yet while it is typed.
    form: { mode: 'onTouched' },
    toFormValues,
    toChange: (values: GeneralSettingsFormValues) => ({
      name: values.name.trim(),
      domain: values.domain.trim() || null,
    }),
    send: updateGeneralSettings,
    // The pages are found by the domain: changing it moves them, and the
    // address they had stops answering.
    confirmBeforeSave: (values, saved) => {
      const next = values.domain.trim();
      if (next === saved.domain) return null;
      if (next === '') {
        return {
          title: t('generalSettings.domainChange.removeTitle'),
          description: t('generalSettings.domainChange.removeDescription', {
            old: saved.domain,
          }),
          actionLabel: t('generalSettings.domainChange.removeAction'),
        };
      }
      return {
        title: t('generalSettings.domainChange.title'),
        description:
          saved.domain === ''
            ? t('generalSettings.domainChange.addedDescription', {
                domain: next,
              })
            : t('generalSettings.domainChange.description', {
                domain: next,
                old: saved.domain,
              }),
        actionLabel: t('generalSettings.domainChange.action'),
      };
    },
  });
  const {
    register,
    control,
    formState: { errors, isDirty },
  } = form;
  const name = useWatch({ control, name: 'name' });
  const domainField = register('domain', {
    validate: (value) =>
      value.trim() === '' ||
      isSiteDomain(value.trim()) ||
      t('generalSettings.domainInvalid'),
  });

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.general')}
      description={t('settings.sections.general.description')}
      canSave={name.trim().length > 0}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="general-settings-name">
            {t('generalSettings.nameLabel')}
          </Label>
          <Input
            id="general-settings-name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={
              errors.name ? 'general-settings-name-error' : undefined
            }
            {...register('name', { required: true })}
          />
          {/* What the server said was wrong with it, under it. */}
          <InlineError id="general-settings-name-error">
            {errors.name?.message}
          </InlineError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="general-settings-domain">
            {t('generalSettings.domainLabel')}
          </Label>
          <Input
            id="general-settings-domain"
            placeholder={t('generalSettings.domainPlaceholder')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errors.domain ? true : undefined}
            aria-describedby={
              errors.domain
                ? 'general-settings-domain-error general-settings-domain-hint'
                : 'general-settings-domain-hint'
            }
            {...domainField}
            // What is pasted is the address bar's: the scheme and the path
            // come off as it goes in, and the line under the field says so.
            onChange={(event) => {
              const cleaned = cleanDomainInput(event.target.value);
              event.target.value = cleaned.domain;
              setRemoved(cleaned.removed);
              void domainField.onChange(event);
            }}
          />
          <InlineError id="general-settings-domain-error">
            {errors.domain?.message}
          </InlineError>
          {isDirty && removed.length > 0 && (
            <p role="status" className="text-xs text-muted-foreground">
              {t('generalSettings.domainRemoved', {
                removed: removed.map((piece) => `“${piece}”`).join(', '),
              })}
            </p>
          )}
          <p
            id="general-settings-domain-hint"
            className="text-xs text-muted-foreground"
          >
            {t('generalSettings.domainDescription')}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
