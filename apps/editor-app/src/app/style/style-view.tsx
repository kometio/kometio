import type { ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { pageBlockCategories, pageBlocks } from '@kometio/block-registry';
import { CURATED_THEME_FONTS, isCssLength } from '@kometio/shared-types';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import type { SiteRecord } from '@kometio/api-contracts';
import {
  themeAllowsStyleOverrides,
  themeCapabilitiesQueryOptions,
} from './theme-capabilities-queries';
import { themeForegroundTokensQueryOptions } from './theme-foreground-tokens-queries';
import { BlockStylesSection } from './block-styles-section';
import {
  BrandColorField,
  brandColor,
  themeColorAsHex,
} from './brand-color-field';
import { FaviconField } from './favicon-field';
import { StylePreview } from './style-preview';
import { ThemeSection } from './theme-section';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { SettingsSectionHeader } from '../settings/settings-section';
import { themeBaseTokensQueryOptions } from './theme-base-tokens-queries';
import { PageHeader } from '../shell/page-header';
import { updateThemeSettings as sendThemeSettings } from '../../lib/sites-api-client';
import { SettingsForm } from '../settings/settings-section';
import { useSiteSettingsForm } from '../settings/use-site-settings-form';

export interface StyleViewProps {
  site: SiteRecord;
}

// Distinct from every curated value in CURATED_THEME_FONTS — selecting it
// means "no site-level override", i.e. themeFontFamily stays `null` and
// the active filesystem theme's own default font applies (docs/adr/0021).
const INHERIT_THEME_FONT = '__inherit__';
const CUSTOM_FONT = '__custom__';
const CURATED_FONT_VALUES: string[] = CURATED_THEME_FONTS.map(
  (font) => font.value,
);

function initialFontState(themeFontFamily: string | null) {
  if (themeFontFamily === null) {
    return { fontChoice: INHERIT_THEME_FONT, customFontName: '' };
  }
  if (CURATED_FONT_VALUES.includes(themeFontFamily)) {
    return { fontChoice: themeFontFamily, customFontName: '' };
  }
  return { fontChoice: CUSTOM_FONT, customFontName: themeFontFamily };
}

interface StyleFormValues {
  overridesEnabled: boolean;
  primaryColorEnabled: boolean;
  primaryColor: string | null;
  secondaryColorEnabled: boolean;
  secondaryColor: string | null;
  fontChoice: string;
  customFontName: string;
  faviconUrl: string;
  // Empty string = "not customized" (stored as null), so the theme's own
  // width applies — the same convention as every other field here.
  contentWidth: string;
  customCss: string;
}

function toFormValues(site: SiteRecord): StyleFormValues {
  return {
    overridesEnabled: site.themeOverridesEnabled,
    primaryColorEnabled: site.themePrimaryColor !== null,
    primaryColor: site.themePrimaryColor,
    secondaryColorEnabled: site.themeSecondaryColor !== null,
    secondaryColor: site.themeSecondaryColor,
    ...initialFontState(site.themeFontFamily),
    faviconUrl: site.themeFaviconUrl ?? '',
    contentWidth: site.themeContentWidth ?? '',
    customCss: site.themeCustomCss ?? '',
  };
}

/** One titled part of the page, with a sentence on what it decides. */
function StyleSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SettingsSectionHeader id={id} title={title} description={description} />
      {children}
    </section>
  );
}

/**
 * What the site's switch, and the theme's own ceiling, turn off: greyed out
 * and `inert`, which is what actually stops the fields being usable —
 * asserting on the grey would pass on a page that still accepts input.
 */
function Gated({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-8 ${active ? '' : 'opacity-50'}`}
      inert={!active || undefined}
      aria-disabled={!active}
    >
      {children}
    </div>
  );
}

/**
 * The look of the site, on a page of its own (docs/adr/0021, tier 1 of the
 * two-tier theming): the theme, its colours and font, how wide the content
 * is, the style of every block of a type, the icon, and — last, apart —
 * CSS written by hand. It is the one home for all of it: the canvas used
 * to have a second, smaller copy of the colours and the theme in a panel,
 * and the two had started to disagree.
 *
 * The theme and the block styles are applied as they are chosen, and say
 * so; everything else is one form, saved by the bar.
 */
export function StyleView({ site }: StyleViewProps) {
  const { t } = useTranslation();
  const { data: foregroundTokens } = useQuery(
    themeForegroundTokensQueryOptions(site.themeName),
  );
  const { data: baseTokens } = useQuery(
    themeBaseTokensQueryOptions(site.themeName),
  );
  // The active theme's ceiling (docs/adr/0021). Until the editor could
  // read it, this page told you to go and read the theme's own
  // documentation instead — the switch below still says so, and now the
  // page can answer for itself.
  const { data: themeCapabilities } = useQuery(
    themeCapabilitiesQueryOptions(site.themeName),
  );
  const themeAllowsStyling = themeAllowsStyleOverrides(themeCapabilities);

  const { form, section } = useSiteSettingsForm({
    site,
    failedMessage: t('saveBar.failed.style'),
    toFormValues,
    toChange: (values: StyleFormValues) => ({
      primaryColor: values.primaryColorEnabled
        ? brandColor('primary', values.primaryColor, baseTokens?.primary)
        : null,
      secondaryColor: values.secondaryColorEnabled
        ? brandColor('secondary', values.secondaryColor, baseTokens?.secondary)
        : null,
      fontFamily:
        values.fontChoice === INHERIT_THEME_FONT
          ? null
          : values.fontChoice === CUSTOM_FONT
            ? values.customFontName.trim() || null
            : values.fontChoice,
      customCss: values.customCss.trim() || null,
      contentWidth: values.contentWidth.trim() || null,
      // Owned by IntegrationsView now, not this page — round-tripped
      // unchanged since updateThemeSettings always replaces the whole
      // object (see Site.updateThemeSettings, no partial-patch support).
      headScript: site.themeHeadScript,
      bodyScript: site.themeBodyScript,
      allowedTrackerDomains: site.themeAllowedTrackerDomains,
      trackerScripts: site.themeTrackerScripts,
      faviconUrl: values.faviconUrl.trim() || null,
      overridesEnabled: values.overridesEnabled,
    }),
    send: sendThemeSettings,
  });
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;
  const overridesEnabled = useWatch({ control, name: 'overridesEnabled' });
  const primaryColorEnabled = useWatch({
    control,
    name: 'primaryColorEnabled',
  });
  const primaryColor = useWatch({ control, name: 'primaryColor' });
  const secondaryColorEnabled = useWatch({
    control,
    name: 'secondaryColorEnabled',
  });
  const secondaryColor = useWatch({ control, name: 'secondaryColor' });
  const fontChoice = useWatch({ control, name: 'fontChoice' });
  const customFontName = useWatch({ control, name: 'customFontName' });
  const faviconUrl = useWatch({ control, name: 'faviconUrl' });
  // A value set from code has to say it is a change, or the bar that
  // saves never appears (see the locale settings).
  const changed = { shouldDirty: true };
  const canOverride = overridesEnabled && themeAllowsStyling;

  // What the preview draws: the form as it is now, saved or not.
  const previewPrimary = primaryColorEnabled
    ? brandColor('primary', primaryColor, baseTokens?.primary)
    : (themeColorAsHex(baseTokens?.primary) ?? undefined);
  const previewFont =
    fontChoice === INHERIT_THEME_FONT
      ? null
      : fontChoice === CUSTOM_FONT
        ? customFontName.trim() || null
        : fontChoice;

  return (
    // The favicon is chosen from the library, and the block styles' colour
    // fields offer it too.
    <MediaPickerProvider siteId={site.id}>
      <div className="flex max-w-2xl flex-col gap-8">
        <PageHeader
          title={t('themeSettings.title')}
          description={t('themeSettings.intro')}
        />

        {!themeAllowsStyling && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {t('themeSettings.themeLocked')}
          </p>
        )}

        <ThemeSection site={site} />

        <SettingsForm {...section} className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="theme-settings-overrides" className="text-sm">
                {t('themeSettings.overridesEnabledLabel')}
              </Label>
              <Switch
                id="theme-settings-overrides"
                checked={overridesEnabled}
                onCheckedChange={(checked) =>
                  setValue('overridesEnabled', checked, changed)
                }
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {t('themeSettings.overridesEnabledDescription')}
            </span>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {t('themeSettings.overridesHowSummary')}
              </summary>
              <p className="mt-1">{t('themeSettings.overridesHow')}</p>
            </details>
          </div>

          <Gated active={canOverride}>
            <StyleSection
              id="style-colors-title"
              title={t('themeSettings.colorsTitle')}
            >
              <BrandColorField
                id="theme-settings-primary-color"
                kind="primary"
                enabled={primaryColorEnabled}
                onEnabledChange={(enabled) =>
                  setValue('primaryColorEnabled', enabled, changed)
                }
                value={primaryColor}
                onValueChange={(value) =>
                  setValue('primaryColor', value, changed)
                }
                themeValue={baseTokens?.primary}
                foreground={foregroundTokens?.primaryForeground}
              />
              <BrandColorField
                id="theme-settings-secondary-color"
                kind="secondary"
                enabled={secondaryColorEnabled}
                onEnabledChange={(enabled) =>
                  setValue('secondaryColorEnabled', enabled, changed)
                }
                value={secondaryColor}
                onValueChange={(value) =>
                  setValue('secondaryColor', value, changed)
                }
                themeValue={baseTokens?.secondary}
                foreground={foregroundTokens?.secondaryForeground}
              />
            </StyleSection>

            <StyleSection
              id="style-font-title"
              title={t('themeSettings.typographyTitle')}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="theme-settings-font">
                  {t('themeSettings.fontLabel')}
                </Label>
                <Select
                  value={fontChoice}
                  onValueChange={(choice) =>
                    setValue('fontChoice', choice, changed)
                  }
                >
                  <SelectTrigger id="theme-settings-font" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT_THEME_FONT}>
                      {t('themeSettings.fontInherit')}
                    </SelectItem>
                    {CURATED_THEME_FONTS.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        {font.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_FONT}>
                      {t('themeSettings.fontCustom')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {fontChoice === CUSTOM_FONT && (
                  <Input
                    aria-label={t('themeSettings.fontCustomLabel')}
                    placeholder={t('themeSettings.fontCustomPlaceholder')}
                    {...register('customFontName')}
                  />
                )}
              </div>
              <StylePreview
                primary={previewPrimary}
                primaryForeground={foregroundTokens?.primaryForeground}
                font={previewFont}
              />
            </StyleSection>

            <StyleSection
              id="style-width-title"
              title={t('themeSettings.contentWidthLabel')}
              description={t('themeSettings.contentWidthHelp')}
            >
              <div className="flex flex-col gap-1.5">
                <Input
                  id="theme-settings-content-width"
                  // Named by the section's heading, which says what it is.
                  aria-labelledby="style-width-title"
                  placeholder="64rem"
                  aria-invalid={errors.contentWidth ? true : undefined}
                  aria-describedby={
                    errors.contentWidth ? 'content-width-error' : undefined
                  }
                  {...register('contentWidth', {
                    // Empty is "the theme's own"; anything else has to be
                    // a width. The API's schema only keeps a value from
                    // breaking out of its rule, and lets "banana" through
                    // to be thrown away by the browser without a word.
                    validate: (value) =>
                      value.trim() === '' ||
                      isCssLength(value) ||
                      t('themeSettings.contentWidthInvalid'),
                  })}
                />
                <InlineError id="content-width-error">
                  {errors.contentWidth?.message}
                </InlineError>
              </div>
            </StyleSection>
          </Gated>

          {/* Not gated by the site's switch: what a block's own style says
              lives on the blocks, and the switch does not touch it. Only a
              theme that refuses styling turns it off. */}
          <Gated active={themeAllowsStyling}>
            <BlockStylesSection
              site={site}
              registry={pageBlocks}
              categories={pageBlockCategories}
            />
          </Gated>

          <Gated active={canOverride}>
            <StyleSection
              id="style-favicon-title"
              title={t('themeSettings.faviconLabel')}
              description={t('themeSettings.faviconHelp')}
            >
              <FaviconField
                value={faviconUrl}
                onChange={(url) => setValue('faviconUrl', url, changed)}
              />
            </StyleSection>

            <StyleSection
              id="style-advanced-title"
              title={t('themeSettings.advancedTitle')}
              description={t('themeSettings.customCssWarning')}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="theme-settings-custom-css">
                  {t('themeSettings.customCssLabel')}
                </Label>
                <Textarea
                  id="theme-settings-custom-css"
                  rows={6}
                  className="font-mono text-xs"
                  {...register('customCss')}
                />
              </div>
            </StyleSection>
          </Gated>
        </SettingsForm>
      </div>
    </MediaPickerProvider>
  );
}
