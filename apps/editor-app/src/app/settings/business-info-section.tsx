import { z } from 'zod';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { BusinessAddress, OpeningHoursDay } from '@kometio/shared-types';
import type { SiteRecord } from '@kometio/api-contracts';
import {
  BUSINESS_TYPES,
  EMPTY_BUSINESS_ADDRESS,
  isBusinessAddressEmpty,
  isBusinessType,
  listCountries,
} from '@kometio/shared-types';
import { OptionsSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { updateBusinessInfo } from '../../lib/sites-api-client';
import { OpeningHoursEditor } from './opening-hours-editor';
import { hasInvalidRange } from './opening-hours';
import { SettingsSection } from './settings-section';
import { useSiteSettingsForm } from './use-site-settings-form';

const DAYS_OF_WEEK: OpeningHoursDay['dayOfWeek'][] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function emptyWeek(): OpeningHoursDay[] {
  return DAYS_OF_WEEK.map((dayOfWeek) => ({ dayOfWeek, ranges: [] }));
}

export interface BusinessInfoSectionProps {
  site: SiteRecord;
}

interface BusinessInfoFormValues {
  address: BusinessAddress;
  phone: string;
  email: string;
  businessType: string;
  openingHours: OpeningHoursDay[];
}

function toFormValues(site: SiteRecord): BusinessInfoFormValues {
  return {
    address: site.businessAddress ?? EMPTY_BUSINESS_ADDRESS,
    phone: site.businessPhone ?? '',
    email: site.businessEmail ?? '',
    businessType: site.businessType ?? '',
    openingHours: site.openingHours ?? emptyWeek(),
  };
}

export function BusinessInfoSection({ site }: BusinessInfoSectionProps) {
  const { t, i18n } = useTranslation();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.businessInfo'),
    toFormValues,
    toChange: (values: BusinessInfoFormValues) => ({
      businessAddress: isBusinessAddressEmpty(values.address)
        ? null
        : trimBusinessAddress(values.address),
      businessPhone: values.phone.trim() || null,
      businessEmail: values.email.trim() || null,
      businessType: values.businessType.trim() || null,
      openingHours: values.openingHours.some((day) => day.ranges.length > 0)
        ? values.openingHours
        : null,
    }),
    send: updateBusinessInfo,
  });
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;

  const openingHours = useWatch({ control, name: 'openingHours' });
  const typeChoices = businessTypeChoices(i18n.language, (type) =>
    t(`businessInfo.types.${type}`),
  );

  return (
    <SettingsSection
      {...section}
      title={t('settings.nav.items.business')}
      description={t('businessInfo.description')}
      // A range that ends before it starts says so under its row; the bar
      // waits until it is put right.
      canSave={!hasInvalidRange(openingHours)}
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">
            {t('businessInfo.addressLabel')}
          </legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="business-address-street">
              {t('businessInfo.streetLabel')}
            </Label>
            <Input
              id="business-address-street"
              {...register('address.street')}
            />
          </div>
          {/* Postcode and town on one row: they are one line of the
                    address, and giving each a full row of its own made the
                    dialog read as four unrelated questions. */}
          <div className="flex gap-2">
            <div className="flex w-32 shrink-0 flex-col gap-2">
              <Label htmlFor="business-address-postal-code">
                {t('businessInfo.postalCodeLabel')}
              </Label>
              <Input
                id="business-address-postal-code"
                {...register('address.postalCode')}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="business-address-city">
                {t('businessInfo.cityLabel')}
              </Label>
              <Input id="business-address-city" {...register('address.city')} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="business-address-country">
              {t('businessInfo.countryLabel')}
            </Label>
            {/* The names are the platform's — no table of countries
                      to translate or keep up to date, see
                      ISO_COUNTRY_CODES. Typing a letter jumps through the
                      249 entries, as it did in the native control. */}
            <Controller
              control={control}
              name="address.country"
              render={({ field }) => (
                <OptionsSelect
                  id="business-address-country"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: '', label: t('businessInfo.countryNone') },
                    ...listCountries(i18n.language).map((country) => ({
                      value: country.code,
                      label: country.name,
                    })),
                  ]}
                />
              )}
            />
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <Label htmlFor="business-phone">{t('businessInfo.phoneLabel')}</Label>
          <Input id="business-phone" {...register('phone')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="business-email">{t('businessInfo.emailLabel')}</Label>
          {/* Checked here as well as by the API, so a typo is a line
                    under the field and not "something went wrong" after
                    pressing Save. Empty is fine: not every business
                    publishes an address to write to. */}
          {/* `inputMode`, not `type="email"`: the same keyboard on a
                    phone, without the browser's own validation popping a
                    different message, by different rules, before this one. */}
          <Input
            id="business-email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'business-email-error' : undefined}
            {...register('email', {
              validate: (value) =>
                value.trim() === '' ||
                z.string().email().safeParse(value.trim()).success ||
                t('businessInfo.emailInvalid'),
            })}
          />
          <InlineError id="business-email-error">
            {errors.email?.message}
          </InlineError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="business-type">{t('businessInfo.typeLabel')}</Label>
          {/* Written as the kind of business it is; the value stored is
              the schema.org type it stands for. A value saved before this
              was a list, and not in it, stays choosable as itself. */}
          <Controller
            control={control}
            name="businessType"
            render={({ field }) => (
              <OptionsSelect
                id="business-type"
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: '', label: t('businessInfo.typeNone') },
                  ...(field.value !== '' && !isBusinessType(field.value)
                    ? [
                        {
                          value: field.value,
                          label: t('businessInfo.typeCustom', {
                            value: field.value,
                          }),
                        },
                      ]
                    : []),
                  ...typeChoices,
                ]}
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('businessInfo.hoursLabel')}</Label>
          <OpeningHoursEditor
            value={openingHours}
            onChange={(next) =>
              setValue('openingHours', next, { shouldDirty: true })
            }
          />
        </div>
      </div>
    </SettingsSection>
  );
}

/**
 * The kinds of business, named in the editor's language and sorted the way
 * it sorts — "Other" last, whatever it is called.
 */
function businessTypeChoices(
  locale: string,
  nameOf: (type: (typeof BUSINESS_TYPES)[number]) => string,
): { value: string; label: string }[] {
  const collator = new Intl.Collator(locale);
  const choices = BUSINESS_TYPES.map((type) => ({
    value: type,
    label: nameOf(type),
  }));
  return [
    ...choices
      .filter((choice) => choice.value !== 'LocalBusiness')
      .sort((a, b) => collator.compare(a.label, b.label)),
    ...choices.filter((choice) => choice.value === 'LocalBusiness'),
  ];
}

/** Stored without the spaces somebody typed around a part. */
function trimBusinessAddress(address: BusinessAddress): BusinessAddress {
  return {
    street: address.street.trim(),
    postalCode: address.postalCode.trim(),
    city: address.city.trim(),
    country: address.country.trim(),
  };
}
