import { Controller, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  getLocaleDisplayName,
  isIsoCountryCode,
  listCountries,
} from '@kometio/shared-types';
import { LEGAL_DOCUMENT_KINDS } from '../../lib/legal-documents-api-client';
import { Checkbox } from '../../components/ui/checkbox';
import { OptionsSelect } from '../../components/ui/select';
import type { Control } from 'react-hook-form';
import { WizardChoices, WizardField } from './legal-wizard-field';
import type { WizardFormValues } from './legal-wizard-values';

export interface DocumentsStepProps {
  control: Control<WizardFormValues>;
  /** The languages the site publishes: what a document can be written in. */
  enabledLocales: string[];
}

export function DocumentsStep({ control, enabledLocales }: DocumentsStepProps) {
  const { t, i18n } = useTranslation();
  const { errors } = useFormState({ control });
  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="documents"
        rules={{
          validate: (value) =>
            value.length > 0 || t('legalDocuments.documentsRequired'),
        }}
        render={({ field }) => (
          <WizardChoices
            label={t('legalDocuments.documentsLabel')}
            error={errors.documents?.message}
          >
            {(invalid) =>
              LEGAL_DOCUMENT_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    {...invalid}
                    checked={field.value.includes(kind)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked === true
                          ? [...field.value, kind]
                          : field.value.filter((k) => k !== kind),
                      )
                    }
                  />
                  {t(`legalDocuments.kind.${kind}`)}
                </label>
              ))
            }
          </WizardChoices>
        )}
      />

      <Controller
        control={control}
        name="locales"
        rules={{
          validate: (value) =>
            value.length > 0 || t('legalDocuments.localesRequired'),
        }}
        render={({ field }) => (
          <WizardChoices
            label={t('legalDocuments.localesLabel')}
            error={errors.locales?.message}
          >
            {(invalid) =>
              enabledLocales.map((locale) => (
                <label key={locale} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    {...invalid}
                    checked={field.value.includes(locale)}
                    onCheckedChange={(checked) =>
                      field.onChange(
                        checked === true
                          ? [...field.value, locale]
                          : field.value.filter((l) => l !== locale),
                      )
                    }
                  />
                  {/* The language by its name: "IT" said it to people who
                      already knew. */}
                  {getLocaleDisplayName(locale, i18n.language)}
                </label>
              ))
            }
          </WizardChoices>
        )}
      />

      <Controller
        control={control}
        name="jurisdictionCountry"
        rules={{
          validate: (value) =>
            value !== '' || t('legalDocuments.jurisdictionRequired'),
        }}
        render={({ field }) => (
          <WizardField
            label={t('legalDocuments.jurisdictionLabel')}
            hint={t('legalDocuments.jurisdictionHint')}
            error={errors.jurisdictionCountry?.message}
          >
            {(control) => (
              <OptionsSelect
                id={control.id}
                aria-invalid={control['aria-invalid']}
                aria-describedby={control['aria-describedby']}
                className="sm:w-72"
                value={field.value}
                placeholder={t('legalDocuments.jurisdictionPlaceholder')}
                onValueChange={(next) =>
                  field.onChange(isIsoCountryCode(next) ? next : '')
                }
                options={listCountries(i18n.language).map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
              />
            )}
          </WizardField>
        )}
      />
    </div>
  );
}
