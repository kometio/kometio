import { z } from 'zod';
import { useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { Control, UseFormRegister } from 'react-hook-form';
import { WizardField } from './legal-wizard-field';
import type { WizardFormValues } from './legal-wizard-values';

export interface IdentityStepProps {
  register: UseFormRegister<WizardFormValues>;
  control: Control<WizardFormValues>;
}

const emailSchema = z.string().email();

export function IdentityStep({ register, control }: IdentityStepProps) {
  const { t } = useTranslation();
  const { errors } = useFormState({ control });
  return (
    <div className="flex flex-col gap-4">
      <WizardField
        label={t('legalDocuments.legalEntityNameLabel')}
        error={errors.legalEntityName?.message}
      >
        {(control) => (
          <Input
            {...control}
            {...register('legalEntityName', {
              required: t('legalDocuments.legalEntityNameRequired'),
              validate: (value) =>
                value.trim() !== '' ||
                t('legalDocuments.legalEntityNameRequired'),
            })}
          />
        )}
      </WizardField>
      {/* Checked here as well as by the generator, so a typo is a line
          under the field and not "could not generate" after four steps. */}
      <WizardField
        label={t('legalDocuments.contactEmailLabel')}
        error={errors.contactEmail?.message}
      >
        {(control) => (
          <Input
            {...control}
            inputMode="email"
            autoComplete="email"
            {...register('contactEmail', {
              required: t('legalDocuments.contactEmailRequired'),
              validate: (value) =>
                emailSchema.safeParse(value.trim()).success ||
                t('legalDocuments.contactEmailInvalid'),
            })}
          />
        )}
      </WizardField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="legal-vat-id">{t('legalDocuments.vatIdLabel')}</Label>
          <Input id="legal-vat-id" {...register('vatId')} />
        </div>
        <WizardField
          label={t('legalDocuments.domainLabel')}
          error={errors.domain?.message}
        >
          {(control) => (
            <Input
              {...control}
              {...register('domain', {
                required: t('legalDocuments.domainRequired'),
                validate: (value) =>
                  value.trim() !== '' || t('legalDocuments.domainRequired'),
              })}
            />
          )}
        </WizardField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="legal-address">
            {t('legalDocuments.addressLabel')}
          </Label>
          <Input id="legal-address" {...register('address')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="legal-phone">{t('legalDocuments.phoneLabel')}</Label>
          <Input id="legal-phone" {...register('phone')} />
        </div>
      </div>
    </div>
  );
}
