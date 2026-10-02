import { useId, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import {
  cookieBannerPositionSchema,
  cookieBannerReopenPositionSchema,
  cookieBannerSettingsSchema,
  getLocaleDisplayName,
  type CookieBannerCopy,
} from '@kometio/shared-types';
import { type SiteRecord } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { OptionsSelect } from '../../components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { pageGroupTranslationsQueryOptions } from '../pages/page-groups-queries';
import { CookieBannerPreview } from './cookie-banner-preview';
import {
  PagePickerDialog,
  type PagePickerOption,
} from '../pages/page-picker-dialog';
import { ConsentBannerWarning } from './consent-banner-warning';
import { SettingsSection } from './settings-section';
import { updateCookieBannerSettings as sendCookieBannerSettings } from '../../lib/sites-api-client';
import { useSiteSettingsForm } from './use-site-settings-form';

export interface CookieBannerViewProps {
  site: SiteRecord;
}

type PolicyKind = 'privacy' | 'cookie';

/**
 * Configures the site-wide consent banner PageLayout.astro renders
 * directly (docs/adr/0039) — a full route (`_shell.settings.cookies.index.tsx`),
 * not a small Dialog, following IntegrationsView's own precedent for a
 * comparably-scoped config surface. The categorized tracker script list
 * itself (which category each snippet belongs to) is edited in
 * Integrations, not here — see integrations-view.tsx's own comment for why
 * that stays a single writer on ThemeSettings.
 */
/**
 * One of the banner's texts, for one language: a name above it, not only
 * inside it. The five sat in a row of boxes each named by its placeholder,
 * which is gone the moment something is typed.
 */
function CopyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * A policy page the banner links to: which page it is, by its title, and
 * the buttons to choose or take it away.
 *
 * The button used to say "Selected page" once a page was chosen, so a
 * reload left nobody able to tell which. The site stores the page's id and
 * the title is read from it; a page picked in this visit is known by its
 * title at once, before the read comes back.
 */
function PolicyPageField({
  label,
  pageGroupId,
  pickedTitle,
  locale,
  onChoose,
  onClear,
}: {
  label: string;
  pageGroupId: string | null;
  /** The title of the page picked in this visit, if it was. */
  pickedTitle: string | undefined;
  locale: string;
  onChoose: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const { data: translations } = useQuery({
    ...pageGroupTranslationsQueryOptions(pageGroupId ?? ''),
    enabled: pageGroupId !== null && pickedTitle === undefined,
  });
  const translation = translations?.find((one) => one.locale === locale);
  const title =
    pickedTitle ??
    (translation ? translation.seoMeta.title || translation.slug : null);

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onChoose}>
          {pageGroupId
            ? (title ?? t('cookieBanner.pageSelected'))
            : t('cookieBanner.selectPage')}
        </Button>
        {pageGroupId && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t('cookieBanner.clearSelection')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** What the banner is set up as: the site's own record of it, all of it, as the form holds it. */
type CookieBannerFormValues = SiteRecord['cookieBannerSettings'];

/**
 * Configures the site-wide consent banner PageLayout.astro renders
 * directly (docs/adr/0039) — a section of the settings area, not a small
 * Dialog, following IntegrationsView's own precedent for a comparably-scoped
 * config surface. The categorized tracker script list itself (which
 * category each snippet belongs to) is edited in Integrations, not here —
 * see integrations-view.tsx's own comment for why that stays a single
 * writer on ThemeSettings.
 */
export function CookieBannerView({ site }: CookieBannerViewProps) {
  const { t, i18n } = useTranslation();
  const copyId = useId();
  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.cookieBanner'),
    toFormValues: (current: SiteRecord): CookieBannerFormValues =>
      current.cookieBannerSettings,
    toChange: (values: CookieBannerFormValues) => values,
    send: sendCookieBannerSettings,
  });
  const { control, setValue } = form;
  const enabled = useWatch({ control, name: 'enabled' });
  const position = useWatch({ control, name: 'position' });
  const acceptButtonSide = useWatch({ control, name: 'acceptButtonSide' });
  const showReopenTab = useWatch({ control, name: 'showReopenTab' });
  const reopenPosition = useWatch({ control, name: 'reopenPosition' });
  const privacyPolicyPageGroupId = useWatch({
    control,
    name: 'privacyPolicyPageGroupId',
  });
  const cookiePolicyPageGroupId = useWatch({
    control,
    name: 'cookiePolicyPageGroupId',
  });
  const copyOverrides = useWatch({ control, name: 'copyOverrides' });

  // The titles of the pages picked in this visit, by the page they belong
  // to: the site stores the page and not its name, so a page chosen from
  // the list is known by title only until the screen is left. Keyed by the
  // page, so putting an earlier choice back with Cancel does not show it
  // under the title of the one that replaced it.
  const [pickedTitles, setPickedTitles] = useState<Record<string, string>>({});
  const [pickerFor, setPickerFor] = useState<PolicyKind | null>(null);

  // A value set from code has to say it is a change, or the bar that
  // saves never appears (see the locale settings).
  const changed = { shouldDirty: true };

  function handlePick(option: PagePickerOption) {
    if (pickerFor === 'privacy') {
      setValue('privacyPolicyPageGroupId', option.pageGroupId, changed);
    } else if (pickerFor === 'cookie') {
      setValue('cookiePolicyPageGroupId', option.pageGroupId, changed);
    }
    setPickedTitles((titles) => ({
      ...titles,
      [option.pageGroupId]: option.title,
    }));
    setPickerFor(null);
  }

  function updateCopyField(
    locale: string,
    field: keyof CookieBannerCopy,
    value: string,
  ) {
    setValue(
      'copyOverrides',
      {
        ...copyOverrides,
        [locale]: { ...copyOverrides[locale], [field]: value },
      },
      changed,
    );
  }

  return (
    <>
      <SettingsSection
        {...section}
        title={t('settings.nav.items.cookies')}
        description={t('cookieBanner.intro')}
      >
        <div className="flex flex-col gap-6">
          {/* Scripts that ask for consent from a banner that is off: said
              here too, next to the switch that would turn it on. */}
          <ConsentBannerWarning site={site} onCookiesPage />
          <Link
            to="/settings/cookies/legal-documents"
            className="flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm text-primary hover:bg-accent"
          >
            <FileText className="size-4" />
            {t('cookieBanner.legalDocumentsLink')}
          </Link>

          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) =>
                setValue('enabled', checked, changed)
              }
              aria-label={t('cookieBanner.enabledLabel')}
            />
            <span className="text-sm font-medium">
              {t('cookieBanner.enabledLabel')}
            </span>
          </div>

          {enabled && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cookie-banner-position">
                    {t('cookieBanner.positionLabel')}
                  </Label>
                  <OptionsSelect
                    id="cookie-banner-position"
                    value={position}
                    onValueChange={(value) => {
                      const next = cookieBannerPositionSchema.options.find(
                        (candidate) => candidate === value,
                      );
                      if (next) setValue('position', next, changed);
                    }}
                    options={[
                      {
                        value: 'bottom-bar',
                        label: t('cookieBanner.position.bottomBar'),
                      },
                      {
                        value: 'bottom-left',
                        label: t('cookieBanner.position.bottomLeft'),
                      },
                      {
                        value: 'bottom-right',
                        label: t('cookieBanner.position.bottomRight'),
                      },
                      {
                        value: 'center-modal',
                        label: t('cookieBanner.position.centerModal'),
                      },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cookie-banner-accept-side">
                    {t('cookieBanner.acceptButtonSideLabel')}
                  </Label>
                  <OptionsSelect
                    id="cookie-banner-accept-side"
                    value={acceptButtonSide}
                    onValueChange={(value) => {
                      const next =
                        cookieBannerSettingsSchema.shape.acceptButtonSide.options.find(
                          (candidate) => candidate === value,
                        );
                      if (next) setValue('acceptButtonSide', next, changed);
                    }}
                    options={[
                      { value: 'left', label: t('cookieBanner.side.left') },
                      { value: 'right', label: t('cookieBanner.side.right') },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={showReopenTab}
                  onCheckedChange={(checked) =>
                    setValue('showReopenTab', checked, changed)
                  }
                  aria-label={t('cookieBanner.showReopenTabLabel')}
                />
                <span className="text-sm font-medium">
                  {t('cookieBanner.showReopenTabLabel')}
                </span>
              </div>
              {showReopenTab && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cookie-banner-reopen-position">
                    {t('cookieBanner.reopenPositionLabel')}
                  </Label>
                  <OptionsSelect
                    id="cookie-banner-reopen-position"
                    className="w-48"
                    value={reopenPosition}
                    onValueChange={(value) => {
                      const next =
                        cookieBannerReopenPositionSchema.options.find(
                          (candidate) => candidate === value,
                        );
                      if (next) setValue('reopenPosition', next, changed);
                    }}
                    options={[
                      {
                        value: 'bottom-left',
                        label: t('cookieBanner.position.bottomLeft'),
                      },
                      {
                        value: 'bottom-right',
                        label: t('cookieBanner.position.bottomRight'),
                      },
                    ]}
                  />
                </div>
              )}

              <CookieBannerPreview
                settings={{
                  position,
                  acceptButtonSide,
                  showReopenTab,
                  reopenPosition,
                  copyOverrides,
                }}
                locales={site.enabledLocales}
                defaultLocale={site.defaultLocale}
              />

              <PolicyPageField
                label={t('cookieBanner.privacyPolicyLabel')}
                pageGroupId={privacyPolicyPageGroupId}
                pickedTitle={
                  privacyPolicyPageGroupId
                    ? pickedTitles[privacyPolicyPageGroupId]
                    : undefined
                }
                locale={site.defaultLocale}
                onChoose={() => setPickerFor('privacy')}
                onClear={() =>
                  setValue('privacyPolicyPageGroupId', null, changed)
                }
              />
              <PolicyPageField
                label={t('cookieBanner.cookiePolicyLabel')}
                pageGroupId={cookiePolicyPageGroupId}
                pickedTitle={
                  cookiePolicyPageGroupId
                    ? pickedTitles[cookiePolicyPageGroupId]
                    : undefined
                }
                locale={site.defaultLocale}
                onChoose={() => setPickerFor('cookie')}
                onClear={() =>
                  setValue('cookiePolicyPageGroupId', null, changed)
                }
              />

              <div className="flex flex-col gap-2">
                {/* The heading of the per-language section, not the label of
                    a field: as a <label> it named nothing, and the
                    accordion's own <h3>s came straight after the page's
                    <h1>. */}
                <h3 className="text-sm font-medium">
                  {t('cookieBanner.copyOverridesLabel')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t('cookieBanner.copyOverridesHint')}
                </p>
                <Accordion type="multiple">
                  {site.enabledLocales.map((locale) => (
                    <AccordionItem key={locale} value={locale}>
                      {/* The language by its name: "IT" said it to
                          people who already knew. */}
                      <AccordionTrigger>
                        {getLocaleDisplayName(locale, i18n.language)}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col gap-2">
                          <CopyField
                            id={`${copyId}-${locale}-title`}
                            label={t('cookieBanner.titleLabel')}
                            value={copyOverrides[locale]?.title ?? ''}
                            onChange={(next) =>
                              updateCopyField(locale, 'title', next)
                            }
                          />
                          <CopyField
                            id={`${copyId}-${locale}-body`}
                            label={t('cookieBanner.bodyLabel')}
                            value={copyOverrides[locale]?.body ?? ''}
                            onChange={(next) =>
                              updateCopyField(locale, 'body', next)
                            }
                          />
                          <CopyField
                            id={`${copyId}-${locale}-acceptAll`}
                            label={t('cookieBanner.acceptAllLabel')}
                            value={copyOverrides[locale]?.acceptAll ?? ''}
                            onChange={(next) =>
                              updateCopyField(locale, 'acceptAll', next)
                            }
                          />
                          <CopyField
                            id={`${copyId}-${locale}-rejectAll`}
                            label={t('cookieBanner.rejectAllLabel')}
                            value={copyOverrides[locale]?.rejectAll ?? ''}
                            onChange={(next) =>
                              updateCopyField(locale, 'rejectAll', next)
                            }
                          />
                          <CopyField
                            id={`${copyId}-${locale}-customize`}
                            label={t('cookieBanner.customizeLabel')}
                            value={copyOverrides[locale]?.customize ?? ''}
                            onChange={(next) =>
                              updateCopyField(locale, 'customize', next)
                            }
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </>
          )}
        </div>
      </SettingsSection>

      <PagePickerDialog
        siteId={site.id}
        locale={site.defaultLocale}
        open={pickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null);
        }}
        onSelect={handlePick}
      />
    </>
  );
}
