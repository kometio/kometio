import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { SiteRecord } from '@kometio/api-contracts';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import { RadioGroup } from '../../components/ui/radio-group';
import {
  countSubmissionsOlderThan,
  updateFormSubmissionRetention,
} from '../../lib/sites-api-client';
import { RadioOption } from '../common/radio-option';
import { SettingsSection } from '../settings/settings-section';
import { useSiteSettingsForm } from '../settings/use-site-settings-form';

export interface FormSubmissionRetentionSectionProps {
  site: SiteRecord;
}

type RetentionMode = 'forever' | 'days';

interface FormSubmissionRetentionFormValues {
  mode: RetentionMode;
  // Kept as a string, not number | null, for the same reason every other
  // controlled text/number input in this codebase is: an <input> element's
  // own value is always a string, and '' isn't a valid `number` to hold in
  // form state either way.
  days: string;
}

function toFormValues(site: SiteRecord): FormSubmissionRetentionFormValues {
  return site.formSubmissionRetentionDays === null
    ? { mode: 'forever', days: '' }
    : { mode: 'days', days: String(site.formSubmissionRetentionDays) };
}

/** A whole number of days, more than none. */
function isDays(value: string): boolean {
  const days = Number(value.trim());
  return value.trim() !== '' && Number.isInteger(days) && days > 0;
}

/** What the form holds as the API's number: `null` keeps every answer. */
function retentionDaysOf(
  values: FormSubmissionRetentionFormValues,
): number | null {
  return values.mode === 'days' ? Number(values.days.trim()) : null;
}

export function FormSubmissionRetentionSection({
  site,
}: FormSubmissionRetentionSectionProps) {
  const { t } = useTranslation();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.retention'),
    toFormValues,
    toChange: (values: FormSubmissionRetentionFormValues) => ({
      formSubmissionRetentionDays: retentionDaysOf(values),
    }),
    send: updateFormSubmissionRetention,
    // Deleting answers is the one thing here that cannot be taken back: a
    // shorter time, or a time where there was none, deletes what is older
    // at the next nightly clean-up. A longer time, or none, deletes nothing.
    // The question says how many, from the server — and is not asked at all
    // when nothing is that old yet, since nothing goes tonight.
    confirmBeforeSave: async (values, saved) => {
      const next = retentionDaysOf(values);
      const before = retentionDaysOf(saved);
      if (next === null || (before !== null && next >= before)) return null;
      const description = async () => {
        try {
          const count = await countSubmissionsOlderThan(site.id, next);
          return count === 0
            ? null
            : t('formSubmissionRetention.confirm.descriptionCount', {
                count,
                days: next,
              });
        } catch {
          // Could not be counted: the question is still worth asking, in
          // words that do not need the number.
          return t('formSubmissionRetention.confirm.description', {
            count: next,
          });
        }
      };
      const sentence = await description();
      if (sentence === null) return null;
      return {
        title: t('formSubmissionRetention.confirm.title'),
        description: sentence,
        actionLabel: t('formSubmissionRetention.confirm.action'),
        destructive: true,
      };
    },
  });
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;
  const mode = useWatch({ control, name: 'mode' });
  const days = useWatch({ control, name: 'days' });
  const daysField = register('days', {
    validate: (value, values) =>
      values.mode === 'forever' ||
      isDays(value) ||
      t('formSubmissionRetention.invalidValue'),
  });

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.retention')}
      description={t('formSubmissionRetention.description')}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">
          {t('formSubmissionRetention.legend')}
        </legend>
        <Controller
          control={control}
          name="mode"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(next) =>
                field.onChange(next === 'days' ? 'days' : 'forever')
              }
            >
              <RadioOption
                id="retention-forever"
                value="forever"
                label={t('formSubmissionRetention.foreverLabel')}
                description={t('formSubmissionRetention.foreverDescription')}
              />
              <RadioOption
                id="retention-days"
                value="days"
                label={t('formSubmissionRetention.daysLabel')}
                description={t('formSubmissionRetention.daysDescription')}
              >
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="w-24"
                    aria-label={t('formSubmissionRetention.daysInputLabel')}
                    aria-invalid={errors.days ? true : undefined}
                    aria-describedby={
                      errors.days ? 'retention-days-error' : undefined
                    }
                    {...daysField}
                    // Typing a number is choosing "after N days": the field
                    // is not a second step behind the radio.
                    onChange={(event) => {
                      if (mode !== 'days') {
                        setValue('mode', 'days', { shouldDirty: true });
                      }
                      void daysField.onChange(event);
                    }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {t('formSubmissionRetention.unit', {
                      count: Number(days) || 0,
                    })}
                  </span>
                </div>
                <InlineError id="retention-days-error">
                  {errors.days?.message}
                </InlineError>
              </RadioOption>
            </RadioGroup>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t('formSubmissionRetention.hint')}
        </p>
      </fieldset>
    </SettingsSection>
  );
}
