import { useState } from 'react';
import { Controller, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { MAX_THIRD_PARTY_SERVICES } from '@kometio/shared-types';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { Control, UseFormRegister } from 'react-hook-form';
import { WizardChoices, WizardField } from './legal-wizard-field';
import type { WizardFormValues } from './legal-wizard-values';

export interface UsageStepProps {
  register: UseFormRegister<WizardFormValues>;
  control: Control<WizardFormValues>;
}

export function UsageStep({ register, control }: UsageStepProps) {
  const { t } = useTranslation();
  const { errors } = useFormState({ control });
  const [newThirdParty, setNewThirdParty] = useState('');
  // Said when an add is refused for the list being full: pressed, not
  // predicted — the button stays a button and the sentence says why.
  const [listFull, setListFull] = useState(false);
  const tooMany = t('legalDocuments.tooManyServices', {
    max: MAX_THIRD_PARTY_SERVICES,
  });

  /** Adds what was typed to the services already listed, once and only if it says something. */
  function addService(current: string[], onChange: (next: string[]) => void) {
    const value = newThirdParty.trim();
    if (!value || current.includes(value)) return;
    if (current.length >= MAX_THIRD_PARTY_SERVICES) {
      setListFull(true);
      return;
    }
    onChange([...current, value]);
    setNewThirdParty('');
  }

  return (
    <div className="flex flex-col gap-4">
      <WizardChoices
        label={t('legalDocuments.dataCollectedLabel')}
        hint={t('legalDocuments.dataCollectedHint')}
        error={undefined}
      >
        {() =>
          (['contactForm', 'newsletter', 'accounts'] as const).map((field) => (
            <Controller
              key={field}
              control={control}
              name={`dataCollected.${field}`}
              render={({ field: controllerField }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={controllerField.value}
                    onCheckedChange={(checked) =>
                      controllerField.onChange(checked === true)
                    }
                  />
                  {t(`legalDocuments.dataCollected.${field}`)}
                </label>
              )}
            />
          ))
        }
      </WizardChoices>

      <div className="flex flex-col gap-2">
        <Label>{t('legalDocuments.thirdPartyServicesLabel')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('legalDocuments.thirdPartyServicesHint')}
        </p>
        <Controller
          control={control}
          name="thirdPartyServices"
          // The API refuses a longer list, and the list can start longer
          // than that: it is filled from the site's own trackers.
          rules={{
            validate: (list) =>
              list.length <= MAX_THIRD_PARTY_SERVICES || tooMany,
          }}
          render={({ field, fieldState }) => (
            <>
              <div className="flex flex-wrap gap-2">
                {field.value.map((service) => (
                  <Badge key={service} variant="secondary" className="gap-1">
                    {service}
                    {/* Written, as every action is: "Remove" beside the
                        name it removes, its full sentence for a screen
                        reader. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="-my-1 -mr-1.5"
                      aria-label={t('legalDocuments.removeThirdParty', {
                        service,
                      })}
                      onClick={() => {
                        setListFull(false);
                        field.onChange(
                          field.value.filter((s) => s !== service),
                        );
                      }}
                    >
                      {t('legalDocuments.removeThirdPartyShort')}
                    </Button>
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newThirdParty}
                  aria-label={t('legalDocuments.thirdPartyServiceNameLabel')}
                  placeholder={t('legalDocuments.thirdPartyServicePlaceholder')}
                  onChange={(event) => {
                    setListFull(false);
                    setNewThirdParty(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addService(field.value, field.onChange);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addService(field.value, field.onChange)}
                >
                  <Plus className="size-3.5" />
                  {t('legalDocuments.addThirdParty')}
                </Button>
              </div>
              <InlineError>
                {fieldState.error?.message ?? (listFull ? tooMany : undefined)}
              </InlineError>
            </>
          )}
        />
      </div>

      <WizardField
        label={t('legalDocuments.retentionDaysLabel')}
        hint={t('legalDocuments.retentionDaysHint')}
        error={errors.retentionDays?.message}
      >
        {(control) => (
          <Input
            {...control}
            type="number"
            min={1}
            step={1}
            placeholder={t('legalDocuments.retentionDaysPlaceholder')}
            {...register('retentionDays', {
              // Empty keeps them for ever; anything else is a number of days.
              validate: (value) =>
                value.trim() === '' ||
                /^[1-9]\d*$/.test(value.trim()) ||
                t('legalDocuments.retentionDaysInvalid'),
            })}
          />
        )}
      </WizardField>
    </div>
  );
}
